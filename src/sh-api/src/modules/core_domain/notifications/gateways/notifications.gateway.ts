import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { UsersService } from '../../../iam/users/services/users.service';
import { SessionsService } from '../../../iam/auth/services/sessions.service';
import type { JwtPayload } from '../../../iam/auth/strategies/jwt.strategy';
import type { NotificationRecord } from '../services/notifications.service';

const COOKIE_NAME = 'access_token';

type AuthedSocket = Socket & { data: { userId?: string } };

function getCookieValue(cookieHeader: unknown, name: string): string | null {
  if (typeof cookieHeader !== 'string') return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    if (k !== name) continue;
    const v = trimmed.slice(eq + 1);
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
  return null;
}

const IS_PROD = process.env.NODE_ENV === 'production';
const CORS_ORIGIN = process.env.CORS_ORIGIN;

@Injectable()
@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: IS_PROD ? (CORS_ORIGIN ?? false) : true,
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly sessionsService: SessionsService,
    private readonly usersService: UsersService,
  ) {}

  async handleConnection(client: AuthedSocket): Promise<void> {
    try {
      const token = getCookieValue(client.handshake.headers?.cookie, COOKIE_NAME);
      if (!token) throw new UnauthorizedException();

      const payload = this.jwtService.verify<JwtPayload>(token);
      const userId = typeof payload?.sub === 'string' ? payload.sub : null;
      if (!userId) throw new UnauthorizedException();

      if (payload?.sid) {
        await this.sessionsService.assertSessionActive(payload.sid);
      }

      const user = await this.usersService.findById(userId);
      if (!user) throw new UnauthorizedException();
      if ((user as any).banned) throw new UnauthorizedException();

      client.data.userId = userId;
      await client.join(userId);

      this.logger.debug(`Client connected (${IS_PROD ? 'prod' : 'dev'}): ${client.id} user=${userId}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket): void {
    const userId = client.data?.userId;
    if (userId) {
      this.logger.debug(`Client disconnected: ${client.id} user=${userId}`);
    }
  }

  emitNew(userId: string, record: NotificationRecord): void {
    if (!userId) return;
    this.server.to(userId).emit('notification:new', record);
  }

  emitUpdated(userId: string, record: NotificationRecord): void {
    if (!userId) return;
    this.server.to(userId).emit('notification:updated', record);
  }

  emitReadAll(userId: string, payload: { updated: number }): void {
    if (!userId) return;
    this.server.to(userId).emit('notifications:readAll', payload);
  }
}
