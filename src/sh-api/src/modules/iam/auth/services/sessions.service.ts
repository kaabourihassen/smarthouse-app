import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { Session, SessionDocument } from '../schemas/session.schema';

export type SessionMeta = {
  userAgent?: string;
  ip?: string;
};

@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>,
    private readonly configService: ConfigService,
  ) {}

  async createSession(userId: string, meta: SessionMeta = {}): Promise<SessionDocument> {
    const expiresAt = new Date(Date.now() + this.getSessionLifetimeMs());
    return this.sessionModel.create({ userId, expiresAt, ...meta });
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.sessionModel
      .updateOne({ _id: sessionId }, { $set: { revokedAt: new Date() } })
      .exec();
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.sessionModel
      .updateMany({ userId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } })
      .exec();
  }

  async assertSessionActive(sessionId: string): Promise<void> {
    const session = await this.sessionModel.findById(sessionId).exec();
    if (!session) {
      throw new UnauthorizedException('Session not found');
    }
    if (session.revokedAt) {
      throw new UnauthorizedException('Session revoked');
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Session expired');
    }
  }

  private getSessionLifetimeMs(): number {
    const raw = this.configService.get<string>('JWT_EXPIRES_IN', '1d');
    const parsed = parseDurationMs(raw);
    // Fallback to 24h to match current cookie maxAge.
    return parsed ?? 24 * 60 * 60 * 1000;
  }
}

function parseDurationMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;

  // Pure number => seconds (matches jsonwebtoken common usage).
  if (/^\d+$/.test(v)) {
    const seconds = Number(v);
    return Number.isFinite(seconds) ? seconds * 1000 : null;
  }

  const m = v.match(/^(\d+)\s*(ms|s|m|h|d)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;

  const unit = m[2].toLowerCase();
  if (unit === 'ms') return n;
  if (unit === 's') return n * 1000;
  if (unit === 'm') return n * 60 * 1000;
  if (unit === 'h') return n * 60 * 60 * 1000;
  if (unit === 'd') return n * 24 * 60 * 60 * 1000;
  return null;
}
