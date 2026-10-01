import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  Body,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { dirname, join } from 'path';
import { JwtSubscriptionGuard } from '../../../iam/auth/guards/jwt-subscription.guard';
import { CamerasService } from '../services/cameras.service';
import { ScreenshotsService } from '../services/screenshots.service';
import { CaptureScreenshotDto } from '../dto/capture-screenshot.dto';
import { CaptureScreenshotClientDto } from '../dto/capture-screenshot-client.dto';
import { resolveUploadsDir } from '../../../../common/utils/uploads-dir';

const MINIMAL_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xbf, 0x00, 0xff, 0xd9,
]);

type AuthedRequest = Request & { user?: { id?: string } };

function safeFilename(value: string): string {
  return String(value ?? '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function screenshotsRootDir(): string {
  return resolveUploadsDir('screenshots');
}

function getHttpClient(url: URL) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return url.protocol === 'https:' ? require('https') : require('http');
}

async function captureFirstJpegFrame(streamUrl: string, opts: { timeoutMs: number; maxBytes: number }): Promise<Buffer> {
  const url = new URL(streamUrl);
  const http = getHttpClient(url);

  return new Promise<Buffer>((resolve, reject) => {
    const req = http.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          Accept: 'multipart/x-mixed-replace,image/jpeg,*/*',
          'User-Agent': 'sh-api/1.0',
        },
      },
      (res: any) => {
        if (!res || (res.statusCode && res.statusCode >= 400)) {
          const status = res?.statusCode ? ` (HTTP ${res.statusCode})` : '';
          req.destroy();
          return reject(new ServiceUnavailableException(`Camera stream is not reachable${status}`));
        }

        const chunks: Buffer[] = [];
        let total = 0;

        const cleanup = () => {
          try {
            res.removeAllListeners();
          } catch {
            // ignore
          }
          try {
            req.destroy();
          } catch {
            // ignore
          }
        };

        res.on('data', (chunk: Buffer) => {
          if (!Buffer.isBuffer(chunk)) return;
          chunks.push(chunk);
          total += chunk.length;

          if (total > opts.maxBytes) {
            cleanup();
            return reject(new ServiceUnavailableException('Camera stream frame too large'));
          }

          const buf = Buffer.concat(chunks, total);
          const start = buf.indexOf(Buffer.from([0xff, 0xd8]));
          if (start < 0) return;
          const end = buf.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
          if (end < 0) return;

          const jpeg = buf.subarray(start, end + 2);
          cleanup();
          return resolve(jpeg);
        });

        res.on('error', (err: any) => {
          cleanup();
          return reject(new ServiceUnavailableException(`Camera stream error: ${String(err?.message ?? err)}`));
        });

        res.on('end', () => {
          cleanup();
          return reject(new ServiceUnavailableException('Camera stream ended before a frame was captured'));
        });
      },
    );

    req.on('error', (err: any) => {
      return reject(new ServiceUnavailableException(`Camera stream request failed: ${String(err?.message ?? err)}`));
    });

    req.setTimeout(opts.timeoutMs, () => {
      try {
        req.destroy(new Error('timeout'));
      } catch {
        // ignore
      }
      return reject(new ServiceUnavailableException('Camera stream timed out'));
    });

    req.end();
  });
}

@UseGuards(JwtSubscriptionGuard)
@Controller('screenshots')
export class ScreenshotsController {
  constructor(
    private readonly screenshotsService: ScreenshotsService,
    private readonly camerasService: CamerasService,
  ) {}

  private getUserId(req: AuthedRequest): string {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return userId;
  }

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query('cameraId') cameraId?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = this.getUserId(req);
    const safeCameraId = typeof cameraId === 'string' && cameraId.trim() ? cameraId.trim() : undefined;
    const safeLimit = typeof limit === 'string' ? Number(limit) : undefined;
    return this.screenshotsService.listForUser(userId, { cameraId: safeCameraId, limit: safeLimit });
  }

  @Get(':id/file')
  async viewFile(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const userId = this.getUserId(req);
    const record = await this.screenshotsService.getForUser(userId, id);
    if (!record) throw new NotFoundException();

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    if (record.filePath) {
      try {
        const absPath = this.screenshotsService.resolveAndValidateFilePath(record.filePath);
        if (existsSync(absPath)) {
          return res.sendFile(absPath);
        }
      } catch {
        // ignore invalid file path / ENOENT
      }
    }

    if (record.imageBase64) {
      const raw = record.imageBase64;
      const base64 = raw.includes(',') ? raw.split(',')[1] : raw;
      const buf = Buffer.from(base64, 'base64');
      return res.end(buf);
    }

    return res.end(MINIMAL_JPEG);
  }

  @Post('capture')
  async captureFromLive(@Req() req: AuthedRequest, @Body() dto: CaptureScreenshotDto) {
    const userId = this.getUserId(req);
    const cameraId = (dto.cameraId ?? '').trim();
    if (!cameraId) throw new BadRequestException('cameraId is required');

    let streamUrl = (dto.streamUrl ?? '').trim();
    let roomLabel = (dto.roomLabel ?? '').trim() || undefined;

    if (!streamUrl) {
      const camera = await this.camerasService.getForUser(userId, cameraId);
      if (camera) {
        streamUrl = (camera.streamUrl ?? '').trim();
        roomLabel = roomLabel ?? (camera.roomLabel ?? undefined);
      }
    }
    if (!streamUrl) {
      streamUrl = (process.env.ESP32_STREAM_URL ?? '').trim();
    }
    if (!streamUrl) {
      throw new BadRequestException('Camera streamUrl is not configured');
    }

    const capturedAt = new Date();
    const ts = safeFilename(capturedAt.toISOString());
    const root = screenshotsRootDir();
    const filePath = join(root, safeFilename(userId), safeFilename(cameraId), `${ts}-${randomUUID()}.jpg`);
    await mkdir(dirname(filePath), { recursive: true });

    const jpeg = await captureFirstJpegFrame(streamUrl, { timeoutMs: 7000, maxBytes: 8 * 1024 * 1024 });
    await writeFile(filePath, jpeg);

    const title = (dto.title ?? 'Live screenshot').trim() || 'Live screenshot';
    const created = await this.screenshotsService.createForUser(userId, {
      cameraId,
      title,
      roomLabel,
      capturedAt: capturedAt.toISOString(),
      sizeBytes: jpeg.length,
      filePath,
      imageBase64: jpeg.toString('base64'),
    });

    return created;
  }

  @Post('capture-client')
  async captureFromClient(@Req() req: AuthedRequest, @Body() dto: CaptureScreenshotClientDto) {
    const userId = this.getUserId(req);
    const cameraId = (dto.cameraId ?? '').trim();
    if (!cameraId) throw new BadRequestException('cameraId is required');

    const raw = String(dto.imageBase64 ?? '').trim();
    if (!raw) throw new BadRequestException('imageBase64 is required');

    const base64 = raw.includes(',') ? raw.split(',')[1] : raw;
    const jpeg = Buffer.from(base64, 'base64');
    if (jpeg.length === 0) throw new BadRequestException('Invalid imageBase64');
    if (jpeg.length > 8 * 1024 * 1024) throw new BadRequestException('Screenshot too large');
    if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new BadRequestException('Screenshot is not JPEG');

    const capturedAt = new Date();
    const ts = safeFilename(capturedAt.toISOString());
    const root = screenshotsRootDir();
    const filePath = join(root, safeFilename(userId), safeFilename(cameraId), `${ts}-${randomUUID()}.jpg`);
    await mkdir(dirname(filePath), { recursive: true });

    await writeFile(filePath, jpeg);

    const title = (dto.title ?? 'Live screenshot').trim() || 'Live screenshot';
    const roomLabel = (dto.roomLabel ?? '').trim() || undefined;

    const created = await this.screenshotsService.createForUser(userId, {
      cameraId,
      title,
      roomLabel,
      capturedAt: capturedAt.toISOString(),
      sizeBytes: jpeg.length,
      filePath,
      imageBase64: base64,
    });

    return created;
  }
}
