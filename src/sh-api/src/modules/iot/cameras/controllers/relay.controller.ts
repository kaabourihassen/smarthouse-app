import { Controller, Get, Query, Req, Res, ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { MjpegRelayService } from '../services/mjpeg-relay.service';

function isLocalRequest(req: Request): boolean {
  const ip = (req.ip ?? '').replace('::ffff:', '');
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

@Controller('relay')
export class RelayController {
  constructor(private readonly relayService: MjpegRelayService) {}

  @Get('stream')
  async stream(
    @Req() req: Request,
    @Res() res: Response,
    @Query('src') src?: string,
    @Query('token') token?: string,
    @Query('camera') camera?: string,
  ) {
    const expectedToken = (process.env.RELAY_TOKEN ?? '').trim();
    if (expectedToken) {
      if (token !== expectedToken) throw new ForbiddenException('Invalid relay token');
    } else if (!isLocalRequest(req)) {
      throw new ForbiddenException('Relay is local-only');
    }

    const streamUrl = String(src ?? '').trim();
    const cameraId = String(camera ?? '').trim();
    const primaryKey = cameraId || streamUrl || 'default';
    const aliases = [cameraId, 'salon', 'default', streamUrl].filter(Boolean) as string[];

    this.relayService.attach(primaryKey, res, {
      aliases,
      upstreamUrl: streamUrl || undefined,
    });
  }
}
