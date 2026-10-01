import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Recording, RecordingDocument, RecordingMode } from '../schemas/recording.schema';
import { CamerasService } from '../../../iot/cameras/services/cameras.service';

export type RecordingRecord = {
  id: string;
  cameraId: string;
  mode: RecordingMode;
  title: string;
  roomLabel?: string;
  startedAt: string;
  durationSeconds: number;
  sizeBytes: number;
  fileUrl?: string;
  thumbnailUrl?: string;
};

type ListFilter = {
  mode?: RecordingMode;
  cameraId?: string;
};

type NewRecordingInput = Omit<RecordingRecord, 'id' | 'startedAt' | 'fileUrl'> & {
  startedAt: string;
  filePath?: string;
};

@Injectable()
export class RecordingsService {
  constructor(
    @InjectModel(Recording.name) private readonly recordingModel: Model<RecordingDocument>,
    @Optional() @Inject(forwardRef(() => CamerasService)) private readonly camerasService?: CamerasService,
  ) {}

  async listForUser(userId: string, filter: ListFilter = {}): Promise<RecordingRecord[]> {
    const iotUserId = process.env.IOT_INGEST_USER_ID ?? process.env.IOT_USER_ID ?? '6a9f28113309e2383a6fea5f';
    const userIds = Array.from(new Set([userId, iotUserId].filter(Boolean)));
    const query: any = { userId: { $in: userIds } };
    if (filter.mode) query.mode = filter.mode;
    if (filter.cameraId) {
      const camera = await this.camerasService?.getForUser(userId, filter.cameraId);
      const names = [filter.cameraId];
      if (camera) {
        if (camera.name) names.push(camera.name);
        if (camera.id) names.push(camera.id);
      }
      query.cameraId = { $in: names };
    }

    const list = await this.recordingModel
      .find(query)
      .sort({ startedAt: -1 })
      .lean()
      .exec();

    return list.map((r) => this.toRecord(r));
  }

  async getForUser(userId: string, id: string): Promise<(RecordingRecord & { filePath?: string }) | null> {
    const found = await this.recordingModel.findOne({ _id: id, userId }).lean().exec();
    if (!found) return null;
    const record = this.toRecord(found);
    return {
      ...record,
      filePath: found.filePath ? String(found.filePath) : undefined,
    };
  }

  async createForUser(userId: string, input: NewRecordingInput): Promise<RecordingRecord> {
    const created = await this.recordingModel.create({
      userId,
      cameraId: input.cameraId,
      mode: input.mode,
      title: input.title.trim(),
      roomLabel: input.roomLabel?.trim() || undefined,
      startedAt: new Date(input.startedAt),
      durationSeconds: input.durationSeconds,
      sizeBytes: input.sizeBytes,
      filePath: input.filePath?.trim() || undefined,
      thumbnailUrl: input.thumbnailUrl?.trim() || undefined,
    });

    const saved = await created.save();
    return this.toRecord(saved.toObject());
  }

  async updateSizeAndPath(id: string, sizeBytes: number, filePath?: string): Promise<void> {
    const update: any = { sizeBytes };
    if (filePath) update.filePath = filePath;
    await this.recordingModel.updateOne({ _id: id }, { $set: update }).exec();
  }

  private toRecord(raw: any): RecordingRecord {
    const id = String(raw._id ?? raw.id);
    return {
      id,
      cameraId: String(raw.cameraId ?? ''),
      mode: (raw.mode as RecordingMode) ?? 'manual',
      title: String(raw.title ?? ''),
      roomLabel: raw.roomLabel ? String(raw.roomLabel) : undefined,
      startedAt: new Date(raw.startedAt ?? Date.now()).toISOString(),
      durationSeconds: Number(raw.durationSeconds ?? 0),
      sizeBytes: Number(raw.sizeBytes ?? 0),
      fileUrl: `/api/recordings/${id}/file`,
      thumbnailUrl: raw.thumbnailUrl ? String(raw.thumbnailUrl) : undefined,
    };
  }
}
