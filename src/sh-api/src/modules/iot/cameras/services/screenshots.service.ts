import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { isAbsolute, relative, resolve } from 'path';
import { Screenshot, ScreenshotDocument } from '../schemas/screenshot.schema';
import { CamerasService } from './cameras.service';
import { resolveUploadsDir } from '../../../../common/utils/uploads-dir';

export type ScreenshotRecord = {
  id: string;
  cameraId: string;
  title: string;
  roomLabel?: string;
  capturedAt: string;
  sizeBytes: number;
  fileUrl: string;
  aiScore?: number;
  aiClass?: string;
  isHuman?: boolean;
};

type ListFilter = {
  cameraId?: string;
  limit?: number;
};

type NewScreenshotInput = {
  cameraId: string;
  title: string;
  roomLabel?: string;
  capturedAt: string;
  sizeBytes: number;
  filePath: string;
  imageBase64?: string;
  aiScore?: number;
  aiClass?: string;
  isHuman?: boolean;
};

function screenshotsRootDir(): string {
  return resolveUploadsDir('screenshots');
}

@Injectable()
export class ScreenshotsService {
  constructor(
    @InjectModel(Screenshot.name) private readonly screenshotModel: Model<ScreenshotDocument>,
    private readonly camerasService: CamerasService,
  ) {}

  async listForUser(userId: string, filter: ListFilter = {}): Promise<ScreenshotRecord[]> {
    const iotUserId = process.env.IOT_INGEST_USER_ID ?? process.env.IOT_USER_ID ?? '6a9f28113309e2383a6fea5f';
    const userIds = Array.from(new Set([userId, iotUserId].filter(Boolean)));
    const query: any = { userId: { $in: userIds } };

    if (filter.cameraId) {
      const camera = await this.camerasService.getForUser(userId, filter.cameraId);
      const names = [filter.cameraId];
      if (camera) {
        if (camera.name) names.push(camera.name);
        if (camera.id) names.push(camera.id);
      }
      query.cameraId = { $in: names };
    }

    const safeLimit = Math.max(1, Math.min(200, Number(filter.limit) || 20));

    const list = await this.screenshotModel
      .find(query)
      .sort({ capturedAt: -1 })
      .limit(safeLimit)
      .lean()
      .exec();

    return list.map((s) => this.toRecord(s));
  }

  async getForUser(userId: string, id: string): Promise<(ScreenshotRecord & { filePath: string; imageBase64?: string }) | null> {
    const found = await this.screenshotModel.findOne({ _id: id, userId }).lean().exec();
    if (!found) return null;

    const record = this.toRecord(found);
    return {
      ...record,
      filePath: String(found.filePath ?? ''),
      imageBase64: found.imageBase64 ? String(found.imageBase64) : undefined,
    };
  }

  async createForUser(userId: string, input: NewScreenshotInput): Promise<ScreenshotRecord> {
    const created = await this.screenshotModel.create({
      userId,
      cameraId: input.cameraId.trim(),
      title: input.title.trim(),
      roomLabel: input.roomLabel?.trim() || undefined,
      capturedAt: new Date(input.capturedAt),
      sizeBytes: Number(input.sizeBytes ?? 0),
      filePath: input.filePath.trim(),
      imageBase64: input.imageBase64 ? input.imageBase64.trim() : undefined,
      aiScore: input.aiScore,
      aiClass: input.aiClass?.trim() || undefined,
      isHuman: input.isHuman,
    });

    const saved = await created.save();
    return this.toRecord(saved.toObject());
  }

  resolveAndValidateFilePath(filePath: string): string {
    const root = screenshotsRootDir();
    const abs = resolve(filePath);
    const rel = relative(root, abs);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new BadRequestException('Invalid file path');
    return abs;
  }

  private toRecord(raw: any): ScreenshotRecord {
    const id = String(raw._id ?? raw.id);
    return {
      id,
      cameraId: String(raw.cameraId ?? ''),
      title: String(raw.title ?? ''),
      roomLabel: raw.roomLabel ? String(raw.roomLabel) : undefined,
      capturedAt: new Date(raw.capturedAt ?? raw.createdAt ?? Date.now()).toISOString(),
      sizeBytes: Number(raw.sizeBytes ?? 0),
      fileUrl: `/api/screenshots/${id}/file`,
      aiScore: raw.aiScore,
      aiClass: raw.aiClass ? String(raw.aiClass) : undefined,
      isHuman: raw.isHuman,
    };
  }
}
