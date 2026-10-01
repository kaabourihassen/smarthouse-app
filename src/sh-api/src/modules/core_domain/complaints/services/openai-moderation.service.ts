import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

type OpenAiModerationResponse = {
  results?: Array<{
    flagged?: boolean;
    categories?: Record<string, boolean>;
    category_scores?: Record<string, number>;
  }>;
};

type OpenAiErrorResponse = {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

@Injectable()
export class OpenAiModerationService {
  private readonly logger = new Logger(OpenAiModerationService.name);
  private readonly apiKey = process.env.OPENAI_API_KEY;

  private nextAllowedAt = 0;
  private readonly cacheTtlMs = 10 * 60_000; // 10 minutes
  private readonly cache = new Map<string, { value: boolean; expiresAt: number }>();
  private readonly inFlight = new Map<string, Promise<boolean>>();

  /**
   * Returns true when OpenAI flags the content as disallowed.
   * Gracefully falls back to false on quota/rate-limit/network issues so user submissions are never blocked.
   */
  async isFlagged(text: string): Promise<boolean> {
    if (!this.apiKey) {
      this.logger.warn('OPENAI_API_KEY is missing. Moderation checks bypassed.');
      return false;
    }

    const input = (text ?? '').trim();
    if (!input) return false;

    const key = createHash('sha256').update(input).digest('hex');
    const now = Date.now();

    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    // If temporarily on cooldown after an upstream 429/quota issue, allow through
    if (now < this.nextAllowedAt) {
      this.logger.warn('OpenAI moderation is in cooldown window. Bypassing check and allowing submission.');
      return false;
    }

    const promise = this.callOpenAiModeration(input)
      .then((flagged) => {
        this.cache.set(key, { value: flagged, expiresAt: Date.now() + this.cacheTtlMs });
        return flagged;
      })
      .catch((err) => {
        this.logger.warn(`OpenAI moderation error: ${err?.message ?? err}. Allowing submission through fallback.`);
        return false;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  private async callOpenAiModeration(input: string): Promise<boolean> {
    this.logger.debug(
      `Calling OpenAI moderation (inputLength=${input.length}, keyPresent=${Boolean(this.apiKey)})`,
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'omni-moderation-latest',
          input,
        }),
        signal: controller.signal,
      });
    } catch (err: any) {
      const name = typeof err?.name === 'string' ? err.name : 'Error';
      const message = typeof err?.message === 'string' ? err.message : '';
      this.logger.warn(`OpenAI moderation network call failed: ${name}: ${message}. Bypassing.`);
      return false;
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const status = res.status;
      let details: any = null;
      try {
        details = (await res.json()) as OpenAiErrorResponse;
      } catch {
        // ignore
      }

      const apiMessage = details?.error?.message ?? details?.message ?? 'Unknown error';
      this.logger.warn(`OpenAI moderation returned status=${status}: ${apiMessage}`);

      if (status === 429) {
        // Cooldown for 60 seconds before calling OpenAI API again, but don't fail the submission
        this.nextAllowedAt = Date.now() + 60_000;
        this.logger.warn('OpenAI 429 quota/rate-limit hit. Allowing complaint creation and entering 60s cooldown.');
        return false;
      }

      if (status === 401 || status === 403) {
        this.logger.warn('OpenAI key invalid or unauthorized. Allowing submission.');
        return false;
      }

      return false;
    }

    const data = (await res.json()) as OpenAiModerationResponse;
    const flagged = Boolean(data?.results?.[0]?.flagged);
    if (flagged) {
      this.logger.warn('OpenAI moderation flagged offensive content in complaint.');
    }
    return flagged;
  }
}
