import { Injectable } from '@nestjs/common';
import type { Response } from 'express';

type RelayClient = {
  res: Response;
};

export type RelayAttachOptions = {
  aliases?: string[];
  upstreamUrl?: string;
};

type RelayState = {
  streamUrl: string;
  aliases: Set<string>;
  clients: Set<RelayClient>;
  abort: (() => void) | null;
  hasData: boolean;
  bytes: number;
  buffer: Buffer;
  lastJpegBuffer: Buffer | null;
  fallbackInterval?: NodeJS.Timeout | null;
  reconnectTimer?: NodeJS.Timeout | null;
  upstreamReq?: any;
};

function getHttpClient(url: URL) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return url.protocol === 'https:' ? require('https') : require('http');
}

const FALLBACK_JPEG_BASE64 =
  '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';

@Injectable()
export class MjpegRelayService {
  private readonly relays = new Map<string, RelayState>();
  private readonly fallbackJpegBuffer: Buffer;

  constructor() {
    this.fallbackJpegBuffer = Buffer.from(FALLBACK_JPEG_BASE64, 'base64');
  }

  attach(key: string, res: Response, options?: RelayAttachOptions): void {
    const rawKey = (key ?? '').trim();
    if (!rawKey && !options?.upstreamUrl) {
      res.status(503).json({ message: 'Camera stream identifier is not configured' });
      return;
    }

    const primaryKey = rawKey || (options?.upstreamUrl ?? '').trim() || 'default';
    const relay = this.getOrCreateRelay(primaryKey, options);

    // eslint-disable-next-line no-console
    console.log(`[relay] client attached key=${primaryKey} total_clients=${relay.clients.size + 1}`);

    res.status(200);
    res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
    res.setHeader('Cache-Control', 'no-cache, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    const client: RelayClient = { res };
    relay.clients.add(client);

    // Immediately deliver the latest frame or fallback frame so the client has an instant image
    const initialFrame = relay.lastJpegBuffer || this.fallbackJpegBuffer;
    if (initialFrame) {
      const header = `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${initialFrame.length}\r\n\r\n`;
      try {
        res.write(header);
        res.write(initialFrame);
        res.write('\r\n');
      } catch {
        // ignore
      }
    }

    res.on('close', () => {
      relay.clients.delete(client);
      // eslint-disable-next-line no-console
      console.log(`[relay] client disconnected key=${primaryKey} remaining=${relay.clients.size}`);
      if (relay.clients.size === 0) {
        this.cleanupRelay(relay);
      }
    });

    if (relay.streamUrl && !relay.upstreamReq && relay.streamUrl.startsWith('http')) {
      this.startRelay(relay);
    } else if (!relay.upstreamReq) {
      this.startFallbackStream(relay);
    }
  }

  pushFrame(streamKey: string, jpegBuffer: Buffer): void {
    const key = (streamKey ?? '').trim();
    if (!jpegBuffer || jpegBuffer.length === 0) return;

    const targetRelays = new Set<RelayState>();
    for (const r of this.relays.values()) {
      if (r.clients.size > 0) {
        targetRelays.add(r);
      }
    }

    for (const relay of targetRelays) {
      if (relay.clients.size === 0) continue;

      if (relay.fallbackInterval) {
        clearInterval(relay.fallbackInterval);
        relay.fallbackInterval = null;
      }
      relay.hasData = true;
      relay.lastJpegBuffer = jpegBuffer;

      // If this relay is connected to an active HTTP upstream stream, do not write pushed frames to avoid corrupting the stream socket
      if (relay.upstreamReq) {
        continue;
      }

      const header = `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpegBuffer.length}\r\n\r\n`;
      relay.clients.forEach((client) => {
        try {
          client.res.write(header);
          client.res.write(jpegBuffer);
          client.res.write('\r\n');
        } catch {
          // ignore write errors
        }
      });
    }
  }

  private getOrCreateRelay(primaryKey: string, options?: RelayAttachOptions): RelayState {
    let relay = this.relays.get(primaryKey);

    if (!relay && options?.aliases) {
      for (const a of options.aliases) {
        if (a && this.relays.has(a)) {
          relay = this.relays.get(a);
          break;
        }
      }
    }

    if (!relay) {
      const streamUrl = options?.upstreamUrl || (primaryKey.startsWith('http') ? primaryKey : '');
      relay = {
        streamUrl,
        aliases: new Set<string>(),
        clients: new Set<RelayClient>(),
        abort: null,
        hasData: false,
        bytes: 0,
        buffer: Buffer.alloc(0),
        lastJpegBuffer: null,
      };
      this.relays.set(primaryKey, relay);
    }

    relay.aliases.add(primaryKey);
    if (options?.aliases) {
      for (const alias of options.aliases) {
        if (alias) {
          relay.aliases.add(alias);
          this.relays.set(alias, relay);
        }
      }
    }
    if (options?.upstreamUrl && !relay.streamUrl) {
      relay.streamUrl = options.upstreamUrl;
      this.relays.set(options.upstreamUrl, relay);
    }

    return relay;
  }

  private startRelay(relay: RelayState): void {
    if (relay.upstreamReq) return;

    let url: URL;
    try {
      url = new URL(relay.streamUrl);
    } catch {
      this.startFallbackStream(relay);
      return;
    }

    const http = getHttpClient(url);

    const targetHostname =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1' ? 'host.docker.internal' : url.hostname;

    const req = http.request(
      {
        protocol: url.protocol,
        hostname: targetHostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          Accept: 'multipart/x-mixed-replace,image/jpeg,*/*',
          'User-Agent': 'sh-api/1.0',
        },
        timeout: 10000,
      },
      (upRes: any) => {
        if (upRes?.statusCode && upRes.statusCode >= 400) {
          // eslint-disable-next-line no-console
          console.error(`[relay] upstream HTTP ${upRes.statusCode} url=${relay.streamUrl}`);
          this.scheduleReconnect(relay, `HTTP ${upRes.statusCode}`);
          return;
        }

        upRes.on('data', (chunk: Buffer) => {
          if (!Buffer.isBuffer(chunk)) return;
          (relay as any).reconnectAttempts = 0;
          if (!relay.hasData) {
            relay.hasData = true;
            if (relay.fallbackInterval) {
              clearInterval(relay.fallbackInterval);
              relay.fallbackInterval = null;
            }
            // eslint-disable-next-line no-console
            console.log(`[relay] first data chunk received url=${relay.streamUrl}`);
          }
          relay.bytes += chunk.length;
          relay.buffer = Buffer.concat([relay.buffer, chunk]);
          this.flushFrames(relay);
        });

        upRes.on('error', (err: any) => {
          // eslint-disable-next-line no-console
          console.error(`[relay] upstream error url=${relay.streamUrl} err=${String(err?.message ?? err)}`);
          this.scheduleReconnect(relay, 'upstream error');
        });

        upRes.on('end', () => {
          // eslint-disable-next-line no-console
          console.error(`[relay] upstream ended url=${relay.streamUrl}`);
          this.scheduleReconnect(relay, 'upstream ended');
        });
      },
    );

    relay.upstreamReq = req;

    req.on('timeout', () => {
      // eslint-disable-next-line no-console
      console.warn(`[relay] upstream timeout url=${relay.streamUrl}`);
      try {
        req.destroy();
      } catch {
        // ignore
      }
      this.scheduleReconnect(relay, 'timeout');
    });

    req.on('error', (err: any) => {
      // eslint-disable-next-line no-console
      console.error(`[relay] request error url=${relay.streamUrl} err=${String(err?.message ?? err)}`);
      this.scheduleReconnect(relay, 'request error');
    });

    req.end();

    relay.abort = () => {
      try {
        req.destroy();
      } catch {
        // ignore
      }
      this.cleanupRelay(relay);
    };
  }

  private scheduleReconnect(relay: RelayState, reason: string): void {
    if (relay.upstreamReq) {
      try {
        relay.upstreamReq.destroy();
      } catch {
        // ignore
      }
      relay.upstreamReq = null;
    }

    this.startFallbackStream(relay);

    if (relay.clients.size > 0 && !relay.reconnectTimer) {
      const attempts = ((relay as any).reconnectAttempts = ((relay as any).reconnectAttempts || 0) + 1);
      const backoffMs = Math.min(8000, Math.round(2000 * Math.pow(1.4, attempts - 1)));

      relay.reconnectTimer = setTimeout(() => {
        relay.reconnectTimer = null;
        if (relay.clients.size > 0 && !relay.upstreamReq) {
          // eslint-disable-next-line no-console
          console.log(`[relay] attempting reconnect to ${relay.streamUrl} (after ${reason}, attempt ${attempts}, delay ${backoffMs}ms)...`);
          this.startRelay(relay);
        }
      }, backoffMs);
    }
  }

  private startFallbackStream(relay: RelayState): void {
    if (relay.fallbackInterval) return;

    // Send a frame immediately
    const sendFallbackFrame = () => {
      if (relay.clients.size === 0) {
        if (relay.fallbackInterval) {
          clearInterval(relay.fallbackInterval);
          relay.fallbackInterval = null;
        }
        return;
      }

      const header = `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${this.fallbackJpegBuffer.length}\r\n\r\n`;
      relay.clients.forEach((client) => {
        try {
          client.res.write(header);
          client.res.write(this.fallbackJpegBuffer);
          client.res.write('\r\n');
        } catch {
          // ignore
        }
      });
    };

    sendFallbackFrame();
    relay.fallbackInterval = setInterval(sendFallbackFrame, 500);
  }

  private cleanupRelay(relay: RelayState): void {
    if (relay.fallbackInterval) {
      clearInterval(relay.fallbackInterval);
      relay.fallbackInterval = null;
    }
    if (relay.reconnectTimer) {
      clearTimeout(relay.reconnectTimer);
      relay.reconnectTimer = null;
    }
    if (relay.upstreamReq) {
      try {
        relay.upstreamReq.destroy();
      } catch {
        // ignore
      }
      relay.upstreamReq = null;
    }

    relay.clients.forEach((client) => {
      try {
        client.res.end();
      } catch {
        // ignore
      }
    });

    relay.clients.clear();
    relay.abort = null;
    relay.buffer = Buffer.alloc(0);
    if (relay.streamUrl) {
      this.relays.delete(relay.streamUrl);
    }
    for (const alias of relay.aliases) {
      this.relays.delete(alias);
    }
  }

  private flushFrames(relay: RelayState): void {
    const maxBuffer = 8 * 1024 * 1024;
    if (relay.buffer.length > maxBuffer) {
      // Drop buffer if it grows too large.
      relay.buffer = Buffer.alloc(0);
      return;
    }

    while (true) {
      const start = relay.buffer.indexOf(Buffer.from([0xff, 0xd8]));
      if (start < 0) return;
      const end = relay.buffer.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
      if (end < 0) return;

      const jpeg = relay.buffer.subarray(start, end + 2);
      relay.buffer = relay.buffer.subarray(end + 2);
      relay.lastJpegBuffer = jpeg;

      const header = `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`;

      relay.clients.forEach((client) => {
        try {
          client.res.write(header);
          client.res.write(jpeg);
          client.res.write('\r\n');
        } catch {
          // ignore write errors
        }
      });
    }
  }
}

