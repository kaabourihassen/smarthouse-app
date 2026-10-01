import { Injectable, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { MjpegRelayService } from '../services/mjpeg-relay.service';
import { CamerasService } from '../services/cameras.service';

type CameraSocket = Socket & {
  data: {
    cameraId?: string;
    userId?: string;
  };
};

const IS_PROD = process.env.NODE_ENV === 'production';
const CORS_ORIGIN = process.env.CORS_ORIGIN;

@Injectable()
@WebSocketGateway({
  namespace: '/camera-stream',
  cors: {
    origin: IS_PROD ? (CORS_ORIGIN ?? false) : true,
    credentials: true,
  },
})
export class CameraStreamGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(CameraStreamGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly relayService: MjpegRelayService,
    private readonly camerasService: CamerasService,
  ) {}

  async handleConnection(client: CameraSocket): Promise<void> {
    try {
      const apiKey =
        (client.handshake.query?.apiKey as string) ||
        (client.handshake.headers?.['x-api-key'] as string);

      const expectedKey =
        process.env.IOT_INGEST_API_KEY ?? process.env.IOT_API_KEY;

      if (expectedKey && apiKey !== expectedKey) {
        this.logger.warn(`Unauthorized camera connection attempt: ${client.id}`);
        client.disconnect(true);
        return;
      }

      const cameraId =
        (client.handshake.query?.cameraId as string) || 'default';

      const userId =
        process.env.IOT_INGEST_USER_ID ?? process.env.IOT_USER_ID;

      client.data.cameraId = cameraId;
      client.data.userId = userId;

      await client.join(`camera:${cameraId}`);

      if (userId) {
        await this.camerasService.updateStreamUrlAndStatus(
          userId,
          cameraId,
          undefined,
          'online',
        );
      }

      this.logger.log(`Camera connected: ${cameraId} (socket: ${client.id})`);
    } catch (err: any) {
      this.logger.error(`Error in handleConnection: ${err?.message}`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: CameraSocket): Promise<void> {
    const cameraId = client.data?.cameraId;
    const userId = client.data?.userId;

    if (cameraId) {
      this.logger.log(`Camera disconnected: ${cameraId} (socket: ${client.id})`);
      if (userId) {
        await this.camerasService.updateStreamUrlAndStatus(
          userId,
          cameraId,
          undefined,
          'offline',
        );
      }
    }
  }

  @SubscribeMessage('frame')
  handleFrame(
    @ConnectedSocket() client: CameraSocket,
    @MessageBody() body: Buffer | ArrayBuffer | string,
  ): void {
    const cameraId = client.data?.cameraId || 'default';

    let buffer: Buffer;
    if (Buffer.isBuffer(body)) {
      buffer = body;
    } else if (body instanceof ArrayBuffer) {
      buffer = Buffer.from(body);
    } else if (typeof body === 'string') {
      buffer = Buffer.from(body, body.startsWith('data:') ? 'base64' : 'utf-8');
    } else {
      return;
    }

    // Push frame to MJPEG relay service for client consumption
    this.relayService.pushFrame(cameraId, buffer);

    // Broadcast frame over WebSocket channel to listeners
    this.server.to(`camera:${cameraId}`).emit('camera-frame', {
      cameraId,
      timestamp: Date.now(),
      length: buffer.length,
    });
  }
}
