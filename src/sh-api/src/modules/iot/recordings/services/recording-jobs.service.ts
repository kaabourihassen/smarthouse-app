import { BadRequestException, Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, stat } from 'fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'path';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { once } from 'events';
import type { RecordingMode } from '../schemas/recording.schema';
import { RecordingsService, type RecordingRecord } from './recordings.service';
import { CamerasService } from '../../../iot/cameras/services/cameras.service';
import type { StartRecordingDto } from '../dto/start-recording.dto';
import { resolveUploadsDir } from '../../../../common/utils/uploads-dir';

type Session = {
  sessionId: string;
  userId: string;
  cameraId: string;
  mode: RecordingMode;
  title: string;
  roomLabel?: string;
  thumbnailUrl?: string;
  startedAt: Date;
  streamUrl: string;
  filePath: string;
  proc: ChildProcessWithoutNullStreams;
};

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function recordingsRootDir(): string {
  return resolveUploadsDir('recordings');
}

@Injectable()
export class RecordingJobsService {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly recordingsService: RecordingsService,
    @Optional() @Inject(forwardRef(() => CamerasService)) private readonly camerasService?: CamerasService,
  ) {}

  async start(userId: string, dto: StartRecordingDto): Promise<{ sessionId: string; startedAt: string }> {
    // If an automated detection recording is already active for this camera, reuse it to avoid overloading camera
    if (dto.mode === 'detection') {
      for (const [existingId, s] of this.sessions.entries()) {
        if (s.userId === userId && s.cameraId === dto.cameraId && s.mode === 'detection') {
          // eslint-disable-next-line no-console
          console.log(`[ffmpeg] Reusing existing active detection session ${existingId} for camera ${dto.cameraId}`);
          return { sessionId: existingId, startedAt: s.startedAt.toISOString() };
        }
      }
    }

    let streamUrl = (dto.streamUrl ?? '').trim();
    if (!streamUrl) {
      const camera = await this.camerasService?.getForUser(userId, dto.cameraId);
      if (camera) {
        streamUrl = (camera.streamUrl ?? '').trim();
      }
    }
    if (!streamUrl) {
      streamUrl = (process.env.ESP32_STREAM_URL ?? '').trim();
    }
    if (!streamUrl) {
      throw new BadRequestException('Camera streamUrl is not configured');
    }

    const startedAt = new Date();
    const ts = safeFilename(startedAt.toISOString());
    const sessionId = randomUUID();

    const root = recordingsRootDir();
    const filePath = join(root, safeFilename(userId), safeFilename(dto.cameraId), `${ts}.mp4`);

    await mkdir(dirname(filePath), { recursive: true });

    const title = (dto.title ?? `Recording ${ts}`).trim();

    const ffmpegDebug = (process.env.FFMPEG_DEBUG ?? '').trim() === '1';
    const logLevel = ffmpegDebug ? 'info' : 'error';
    const relayToken = (process.env.RELAY_TOKEN ?? '').trim();
    const relayPort = (process.env.PORT ?? '').trim() || '3000';

    let ffmpegInputUrl = streamUrl;
    if (ffmpegInputUrl && (ffmpegInputUrl.includes('localhost') || ffmpegInputUrl.includes('127.0.0.1'))) {
      ffmpegInputUrl = ffmpegInputUrl.replace('localhost', 'host.docker.internal').replace('127.0.0.1', 'host.docker.internal');
    }

    if (!ffmpegInputUrl || !ffmpegInputUrl.startsWith('http')) {
      ffmpegInputUrl = `http://127.0.0.1:${relayPort}/api/relay/stream?src=${encodeURIComponent(streamUrl)}&camera=${encodeURIComponent(dto.cameraId || 'default')}` +
        (relayToken ? `&token=${encodeURIComponent(relayToken)}` : '');
    }

    // eslint-disable-next-line no-console
    console.log(`[ffmpeg:${sessionId}] input URL: ${ffmpegInputUrl}`);

    const durationSeconds = dto.durationSeconds ?? (dto.mode === 'detection' ? 120 : undefined);

    const args = [
      '-y',
      '-hide_banner',
      '-loglevel',
      logLevel,
      '-user_agent',
      'sh-api/1.0',
      '-headers',
      'Accept: multipart/x-mixed-replace,image/jpeg,*/*\r\n',
      '-rw_timeout',
      '15000000',
      '-f',
      'mjpeg',
      '-i',
      ffmpegInputUrl,
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-vf',
      'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-r',
      '25',
      '-movflags',
      '+faststart',
    ];

    if (durationSeconds && durationSeconds > 0) {
      args.push('-t', String(durationSeconds));
    }

    args.push(filePath);

    const ffmpegPath = (process.env.FFMPEG_PATH ?? '').trim() || 'ffmpeg';
    const proc = spawn(ffmpegPath, args, { windowsHide: true });

    proc.stderr.on('data', (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (!msg) return;
      // eslint-disable-next-line no-console
      console.error(`[ffmpeg:${sessionId}] ${msg}`);
    });
    if (ffmpegDebug) {
      proc.stdout.on('data', (chunk: Buffer) => {
        const msg = chunk.toString().trim();
        if (!msg) return;
        // eslint-disable-next-line no-console
        console.log(`[ffmpeg:${sessionId}] ${msg}`);
      });
    }

    try {
      await Promise.race([
        once(proc, 'spawn'),
        once(proc, 'error').then(([err]) => {
          throw err;
        }),
      ]);
    } catch (err: any) {
      throw new ServiceUnavailableException(
        `Failed to start ffmpeg. Ensure ffmpeg is installed and available in PATH. Details: ${String(err?.message ?? err)}`,
      );
    }

    this.sessions.set(sessionId, {
      sessionId,
      userId,
      cameraId: dto.cameraId,
      mode: dto.mode,
      title,
      roomLabel: dto.roomLabel?.trim() || undefined,
      thumbnailUrl: dto.thumbnailUrl?.trim() || undefined,
      startedAt,
      streamUrl,
      filePath,
      proc,
    });

    proc.once('exit', async (code, signal) => {
      const s = this.sessions.get(sessionId);
      if (!s || s.proc !== proc) return;
      this.sessions.delete(sessionId);
      // eslint-disable-next-line no-console
      console.log(`[ffmpeg:${sessionId}] exited with code=${code ?? 'null'} signal=${signal ?? 'null'}. Finalizing recording...`);

      const endedAt = new Date();
      const actualDuration = Math.max(1, Math.round((endedAt.getTime() - s.startedAt.getTime()) / 1000));

      let sizeBytes = 0;
      try {
        const fileStat = await stat(s.filePath);
        sizeBytes = Number(fileStat.size ?? 0);
      } catch {
        sizeBytes = 0;
      }

      try {
        await this.recordingsService.createForUser(userId, {
          cameraId: s.cameraId,
          mode: s.mode,
          title: s.title,
          roomLabel: s.roomLabel,
          startedAt: s.startedAt.toISOString(),
          durationSeconds: actualDuration,
          sizeBytes,
          thumbnailUrl: s.thumbnailUrl,
          filePath: s.filePath,
        });
        // eslint-disable-next-line no-console
        console.log(`[ffmpeg:${sessionId}] Recording successfully saved to DB (${sizeBytes} bytes, ${actualDuration}s)`);
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error(`[ffmpeg:${sessionId}] Failed to save recording to DB:`, err?.message ?? err);
      }
    });

    return { sessionId, startedAt: startedAt.toISOString() };
  }

  async stop(userId: string, sessionId: string): Promise<RecordingRecord> {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) {
      // If already stopped or exited via -t 120, return the most recent recording
      const latest = await this.recordingsService.listForUser(userId);
      if (latest && latest.length > 0) return latest[0];
      throw new NotFoundException('Recording session not found');
    }

    this.sessions.delete(sessionId);

    // Ask ffmpeg to finalize the MP4 and exit.
    session.proc.kill('SIGINT');

    try {
      await Promise.race([
        once(session.proc, 'exit'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
    } catch {
      // Even if ffmpeg errors, we still try to stat the file and store what we have.
    }

    const endedAt = new Date();
    const durationSeconds = Math.max(1, Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000));

    let sizeBytes = 0;
    try {
      const s = await stat(session.filePath);
      sizeBytes = Number(s.size ?? 0);
    } catch {
      sizeBytes = 0;
    }

    return this.recordingsService.createForUser(userId, {
      cameraId: session.cameraId,
      mode: session.mode,
      title: session.title,
      roomLabel: session.roomLabel,
      startedAt: session.startedAt.toISOString(),
      durationSeconds,
      sizeBytes,
      thumbnailUrl: session.thumbnailUrl,
      filePath: session.filePath,
    });
  }

  async hasActiveOrRecentRecording(cameraId: string, withinSeconds = 120): Promise<boolean> {
    const safeCamId = String(cameraId ?? 'default').trim();

    // 1. Check currently active FFmpeg recording processes
    for (const s of this.sessions.values()) {
      if (s.cameraId === safeCamId) {
        return true;
      }
    }

    // 2. Check recently created recording entries in database
    const now = Date.now();
    const iotUserId = process.env.IOT_INGEST_USER_ID ?? process.env.IOT_USER_ID ?? '6a9f28113309e2383a6fea5f';
    const recent = await this.recordingsService.listForUser(iotUserId, { cameraId: safeCamId });
    if (recent && recent.length > 0) {
      const latest = recent[0];
      const startTime = new Date(latest.startedAt).getTime();
      if (now - startTime < withinSeconds * 1000) {
        return true;
      }
    }

    return false;
  }

  resolveAndValidateFilePath(filePath: string): string {
    const root = recordingsRootDir();
    const abs = resolve(filePath);
    const rel = relative(root, abs);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new BadRequestException('Invalid file path');
    return abs;
  }
}
