import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { join, resolve } from 'path';
import { ScreenshotsService } from '../services/screenshots.service';
import { CamerasService } from '../services/cameras.service';
import { ComputerVisionService } from '../services/computer-vision.service';
import { RecordingJobsService } from '../../../iot/recordings/services/recording-jobs.service';
import { resolveUploadsDir } from '../../../../common/utils/uploads-dir';
import { Inject, forwardRef, Logger } from '@nestjs/common';
import * as fs from 'fs';

import { RecordingsService } from '../../../iot/recordings/services/recordings.service';
import { MjpegRelayService } from '../services/mjpeg-relay.service';

type MulterUploadedFile = {
  path?: string;
  size?: number;
  mimetype?: string;
  originalname?: string;
  filename?: string;
};

function safeFilename(value: string): string {
  return String(value ?? '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function screenshotsRootDir(): string {
  return resolveUploadsDir('screenshots');
}

@Controller('iot')
export class IotCamerasController {
  private readonly logger = new Logger(IotCamerasController.name);

  constructor(
    private readonly screenshotsService: ScreenshotsService,
    private readonly camerasService: CamerasService,
    private readonly computerVisionService: ComputerVisionService,
    private readonly relayService: MjpegRelayService,
    @Inject(forwardRef(() => RecordingJobsService))
    private readonly recordingJobsService: RecordingJobsService,
    private readonly recordingsService: RecordingsService,
  ) {}

  @Post('camera/register')
  async registerCamera(
    @Body() body: { cameraId?: string; streamUrl?: string; status?: 'online' | 'offline' },
    @Headers('x-api-key') apiKey?: string,
  ) {
    const expectedKey = this.getEnv('IOT_INGEST_API_KEY', 'IOT_API_KEY');
    if (!apiKey || apiKey !== expectedKey) throw new ForbiddenException('Invalid API key');

    const userId = this.getEnv('IOT_INGEST_USER_ID', 'IOT_USER_ID');
    const cameraId = typeof body?.cameraId === 'string' && body.cameraId.trim() ? body.cameraId.trim() : 'default';

    let streamUrl = body.streamUrl;
    if (streamUrl && (streamUrl.includes('localhost') || streamUrl.includes('127.0.0.1'))) {
      streamUrl = streamUrl.replace('localhost', 'host.docker.internal').replace('127.0.0.1', 'host.docker.internal');
    }

    const updated = await this.camerasService.updateStreamUrlAndStatus(
      userId,
      cameraId,
      streamUrl,
      body.status ?? 'online',
    );

    return { success: true, camera: updated };
  }

  private getEnv(requiredKey: string, legacyKey?: string): string {
    const value = process.env[requiredKey] ?? (legacyKey ? process.env[legacyKey] : undefined);
    if (!value) {
      const keys = legacyKey ? `${requiredKey} (or legacy ${legacyKey})` : requiredKey;
      throw new ForbiddenException(`${keys} is not configured`);
    }
    return value;
  }

  @Post('camera/screenshot')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          try {
            const userId = process.env.IOT_INGEST_USER_ID ?? process.env.IOT_USER_ID;
            const cameraId = String((req as any)?.body?.cameraId ?? 'default');

            const root = screenshotsRootDir();
            const dir = join(root, safeFilename(userId ?? 'unknown'), safeFilename(cameraId || 'default'));
            try {
              mkdirSync(dir, { recursive: true });
              cb(null, dir);
            } catch (err: any) {
              const fallbackDir = join('/tmp', 'screenshots', safeFilename(cameraId || 'default'));
              mkdirSync(fallbackDir, { recursive: true });
              cb(null, fallbackDir);
            }
          } catch (err: any) {
            cb(err, '');
          }
        },
        filename: (req, file, cb) => {
          const ts = new Date().toISOString().replace(/[:.]/g, '-');
          cb(null, `${ts}-${randomUUID()}.jpg`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'image/jpeg') {
          return cb(new BadRequestException('Only image/jpeg is supported') as any, false);
        }
        cb(null, true);
      },
    }),
  )
  async ingestScreenshot(
    @UploadedFile() file: MulterUploadedFile,
    @Body() body: { cameraId?: string; title?: string; roomLabel?: string },
    @Headers('x-api-key') apiKey?: string,
  ) {
    const expectedKey = this.getEnv('IOT_INGEST_API_KEY', 'IOT_API_KEY');
    if (!apiKey || apiKey !== expectedKey) throw new ForbiddenException('Invalid API key');

    const userId = this.getEnv('IOT_INGEST_USER_ID', 'IOT_USER_ID');

    if (!file) throw new BadRequestException('Missing photo');

    const cameraId = typeof body?.cameraId === 'string' && body.cameraId.trim() ? body.cameraId.trim() : 'default';
    const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : 'Motion screenshot';
    const roomLabel = typeof body?.roomLabel === 'string' && body.roomLabel.trim() ? body.roomLabel.trim() : undefined;

    // Multer diskStorage sets this.
    const filePath = String(file.path ?? '');
    if (!filePath) throw new BadRequestException('Upload failed');

    const capturedAt = new Date().toISOString();

    // Immediately push frame into Kubernetes live stream relay asynchronously so dashboard updates
    try {
      const frameBuffer = await fs.promises.readFile(filePath);
      this.relayService.pushFrame(cameraId, frameBuffer);
      this.relayService.pushFrame('default', frameBuffer);
    } catch {
      // ignore
    }

    // Yield event loop so MJPEG relay streams remain completely smooth during AI processing
    await new Promise((resolve) => setImmediate(resolve));

    // Analyze image with AI
    this.logger.log(`Analyzing screenshot for human detection: ${filePath}`);
    const aiResult = await this.computerVisionService.analyzeImage(filePath);

    if (!aiResult.isHuman) {
      this.logger.log(`No human detected (score: ${aiResult.maxScore}). Ignoring screenshot.`);
      // Delete file to avoid false alerts
      try {
        await fs.promises.unlink(filePath);
      } catch (err) {
        this.logger.warn(`Failed to delete ignored screenshot at ${filePath}`, err);
      }
      return { ignored: true, reason: 'No human detected', aiScore: aiResult.maxScore };
    }

    this.logger.log(`Human detected! (score: ${aiResult.maxScore}). Triggering 2-minute recording.`);

    let imageBase64: string | undefined;
    try {
      imageBase64 = await fs.promises.readFile(filePath, { encoding: 'base64' });
    } catch {
      // ignore
    }

    const savedScreenshot = await this.screenshotsService.createForUser(userId, {
      cameraId,
      title,
      roomLabel,
      capturedAt,
      sizeBytes: Number(file.size ?? 0),
      filePath,
      imageBase64,
      aiScore: aiResult.maxScore,
      aiClass: aiResult.detectedClasses.join(','),
      isHuman: aiResult.isHuman,
    });

    // Check if a recording is already active or recently started for this camera to avoid duplicate recordings
    const isRecordingBusy = await this.recordingJobsService.hasActiveOrRecentRecording(cameraId, 120);
    if (isRecordingBusy) {
      this.logger.log(`Recording already active or recently created for camera '${cameraId}'. Skipping duplicate recording creation.`);
      return savedScreenshot;
    }

    // Trigger a 2-minute video recording
    const recTitle = `AI Human Detection (${Math.round(aiResult.maxScore * 100)}%)`;
    try {
      await this.recordingJobsService.start(userId, {
        cameraId,
        mode: 'detection',
        title: recTitle,
        roomLabel,
        thumbnailUrl: savedScreenshot.fileUrl,
        durationSeconds: 120,
      });
    } catch (err) {
      this.logger.error('Failed to start automated recording via ffmpeg', err);
      try {
        await this.recordingsService.createForUser(userId, {
          cameraId,
          mode: 'detection',
          title: recTitle,
          roomLabel,
          startedAt: capturedAt,
          durationSeconds: 120,
          sizeBytes: Number(file.size ?? 0) * 10,
          thumbnailUrl: savedScreenshot.fileUrl,
        });
      } catch (fallbackErr) {
        this.logger.error('Failed to create fallback recording entry', fallbackErr);
      }
    }

    return savedScreenshot;
  }

  @Post('camera/frame')
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async ingestFrame(
    @UploadedFile() file: MulterUploadedFile & { buffer?: Buffer },
    @Body() body: { cameraId?: string },
    @Headers('x-api-key') apiKey?: string,
  ) {
    const expectedKey = this.getEnv('IOT_INGEST_API_KEY', 'IOT_API_KEY');
    if (!apiKey || apiKey !== expectedKey) throw new ForbiddenException('Invalid API key');

    const cameraId = typeof body?.cameraId === 'string' && body.cameraId.trim() ? body.cameraId.trim() : 'default';

    let buffer: Buffer | undefined = file?.buffer;
    if (!buffer && file?.path) {
      try {
        buffer = fs.readFileSync(file.path);
        fs.unlinkSync(file.path);
      } catch {
        // ignore
      }
    }

    if (buffer && buffer.length > 0) {
      this.relayService.pushFrame(cameraId, buffer);
      this.relayService.pushFrame('default', buffer);
      return { success: true, length: buffer.length };
    }

    return { success: false, message: 'No frame data' };
  }
}
