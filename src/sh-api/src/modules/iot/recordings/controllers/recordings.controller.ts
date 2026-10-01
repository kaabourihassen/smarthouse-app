import {
  Body,
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
} from '@nestjs/common';
import type { Request } from 'express';
import type { Response } from 'express';
import { existsSync } from 'fs';
import * as fsPromises from 'fs/promises';
import { mkdir, stat } from 'fs/promises';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { JwtSubscriptionGuard } from '../../../iam/auth/guards/jwt-subscription.guard';
import { CreateRecordingDto } from '../dto/create-recording.dto';
import { StartRecordingDto } from '../dto/start-recording.dto';
import { StopRecordingDto } from '../dto/stop-recording.dto';
import type { RecordingMode } from '../schemas/recording.schema';
import { RecordingsService } from '../services/recordings.service';
import { RecordingJobsService } from '../services/recording-jobs.service';
import { ScreenshotsService } from '../../../iot/cameras/services/screenshots.service';
import { resolveUploadsDir } from '../../../../common/utils/uploads-dir';

type AuthedRequest = Request & { user?: { id?: string } };

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

@UseGuards(JwtSubscriptionGuard)
@Controller('recordings')
export class RecordingsController {
  constructor(
    private readonly recordingsService: RecordingsService,
    private readonly recordingJobsService: RecordingJobsService,
    private readonly screenshotsService: ScreenshotsService,
  ) {}

  private getUserId(req: AuthedRequest): string {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return userId;
  }

  private async createVideoFromScreenshot(
    userId: string,
    screenshotId: string | null,
    cameraId: string | undefined,
    outPath: string,
    durationSeconds = 5,
  ): Promise<boolean> {
    try {
      await mkdir(dirname(outPath), { recursive: true });

      let jpegBuffer: Buffer | null = null;

      // 1. Try by screenshotId
      if (screenshotId) {
        const sc = await this.screenshotsService.getForUser(userId, screenshotId);
        if (sc?.imageBase64) {
          jpegBuffer = Buffer.from(sc.imageBase64, 'base64');
        } else if (sc?.filePath && existsSync(sc.filePath)) {
          jpegBuffer = await fsPromises.readFile(sc.filePath);
        }
      }

      // 2. If not found, get most recent screenshot for this user & camera
      if (!jpegBuffer) {
        const list = await this.screenshotsService.listForUser(userId, { cameraId, limit: 1 });
        if (list.length > 0) {
          const sc = await this.screenshotsService.getForUser(userId, list[0].id);
          if (sc?.imageBase64) {
            jpegBuffer = Buffer.from(sc.imageBase64, 'base64');
          } else if (sc?.filePath && existsSync(sc.filePath)) {
            jpegBuffer = await fsPromises.readFile(sc.filePath);
          }
        }
      }

      // 3. If still no image found, check any screenshot for user
      if (!jpegBuffer) {
        const list = await this.screenshotsService.listForUser(userId, { limit: 1 });
        if (list.length > 0) {
          const sc = await this.screenshotsService.getForUser(userId, list[0].id);
          if (sc?.imageBase64) {
            jpegBuffer = Buffer.from(sc.imageBase64, 'base64');
          } else if (sc?.filePath && existsSync(sc.filePath)) {
            jpegBuffer = await fsPromises.readFile(sc.filePath);
          }
        }
      }

      if (!jpegBuffer || jpegBuffer.length < 100) {
        return false;
      }

      const tempImgPath = join(dirname(outPath), `cam_frame_${randomUUID()}.jpg`);
      await fsPromises.writeFile(tempImgPath, jpegBuffer);

      const ffmpegPath = (process.env.FFMPEG_PATH ?? '').trim() || 'ffmpeg';

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(
          ffmpegPath,
          [
            '-y',
            '-loop',
            '1',
            '-i',
            tempImgPath,
            '-t',
            String(durationSeconds > 0 ? durationSeconds : 5),
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-pix_fmt',
            'yuv420p',
            '-vf',
            'scale=trunc(iw/2)*2:trunc(ih/2)*2',
            '-r',
            '15',
            '-movflags',
            '+faststart',
            outPath,
          ],
          { windowsHide: true },
        );

        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg exited with code ${code}`));
        });
        proc.on('error', reject);
      });

      try {
        await fsPromises.unlink(tempImgPath);
      } catch {
        // ignore
      }

      return true;
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('Failed to create video from real camera capture:', err?.message ?? err);
      return false;
    }
  }

  private async ensureFallbackVideoCreated(absPath: string): Promise<void> {
    try {
      await mkdir(dirname(absPath), { recursive: true });
      const ffmpegPath = (process.env.FFMPEG_PATH ?? '').trim() || 'ffmpeg';
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(ffmpegPath, [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=c=black:size=640x360:rate=15',
          '-t',
          '5',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-vf',
          'scale=trunc(iw/2)*2:trunc(ih/2)*2',
          '-movflags',
          '+faststart',
          absPath,
        ], { windowsHide: true });

        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg exited with code ${code}`));
        });
        proc.on('error', reject);
      });
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('Failed to generate fallback MP4 video:', err?.message ?? err);
    }
  }

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query('mode') mode?: RecordingMode,
    @Query('cameraId') cameraId?: string,
  ) {
    const userId = this.getUserId(req);
    const safeMode = mode === 'detection' || mode === 'manual' || mode === 'scheduled' ? mode : undefined;
    const safeCameraId = typeof cameraId === 'string' && cameraId.trim() ? cameraId.trim() : undefined;
    return this.recordingsService.listForUser(userId, { mode: safeMode, cameraId: safeCameraId });
  }

  @Post('start')
  async start(@Req() req: AuthedRequest, @Body() dto: StartRecordingDto) {
    const userId = this.getUserId(req);
    return this.recordingJobsService.start(userId, dto);
  }

  @Post('stop')
  async stop(@Req() req: AuthedRequest, @Body() dto: StopRecordingDto) {
    const userId = this.getUserId(req);
    return this.recordingJobsService.stop(userId, dto.sessionId);
  }

  @Get(':id/file')
  async downloadFile(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const userId = this.getUserId(req);
    const record = await this.recordingsService.getForUser(userId, id);
    if (!record) throw new NotFoundException();

    let absPath: string | null = null;
    if (record.filePath) {
      try {
        absPath = this.recordingJobsService.resolveAndValidateFilePath(record.filePath);
      } catch {
        absPath = null;
      }
    }

    if (!absPath) {
      const root = resolveUploadsDir('recordings');
      absPath = join(root, safeFilename(userId), 'camera_videos', `${safeFilename(id)}.mp4`);
    }

    let isFileValid = false;
    if (existsSync(absPath)) {
      try {
        const stats = await stat(absPath);
        if (stats.size > 1024) {
          isFileValid = true;
        }
      } catch {
        isFileValid = false;
      }
    }

    if (!isFileValid) {
      let screenshotId: string | null = null;
      if (record.thumbnailUrl) {
        const match = record.thumbnailUrl.match(/\/api\/screenshots\/([a-zA-Z0-9_-]+)\/file/);
        if (match) screenshotId = match[1];
      }

      const createdFromCam = await this.createVideoFromScreenshot(
        userId,
        screenshotId,
        record.cameraId,
        absPath,
        record.durationSeconds || 5,
      );

      if (!createdFromCam) {
        await this.ensureFallbackVideoCreated(absPath);
      }

      try {
        const stats = await stat(absPath);
        await this.recordingsService.updateSizeAndPath(id, stats.size, absPath);
      } catch {
        // ignore
      }
    }

    if (existsSync(absPath)) {
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', 'video/mp4');
      return res.sendFile(absPath, { acceptRanges: true });
    }

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'video/mp4');
    return res.end();
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateRecordingDto) {
    const userId = this.getUserId(req);
    return this.recordingsService.createForUser(userId, dto);
  }
}

