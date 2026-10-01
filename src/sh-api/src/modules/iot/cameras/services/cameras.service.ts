import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import { Camera, CameraDocument, CameraStatus } from '../schemas/camera.schema';

export type CameraRecord = {
  id: string;
  name: string;
  roomKey?: string;
  roomLabel?: string;
  status: CameraStatus;
  detectionEnabled: boolean;
  streamUrl?: string;
  qualityLabel: string;
  storageTotalGb: number;
  createdAt: string;
};

type NewCameraInput = {
  name: string;
  roomKey?: string;
  roomLabel?: string;
  status?: CameraStatus;
  detectionEnabled?: boolean;
  streamUrl?: string;
  qualityLabel?: string;
  storageTotalGb?: number;
};

type UpdateCameraInput = Partial<NewCameraInput>;

@Injectable()
export class CamerasService {
  constructor(
    @InjectModel(Camera.name) private readonly cameraModel: Model<CameraDocument>,
  ) {}

  private getIotUserIds(userId: string): string[] {
    const iotUserId = process.env.IOT_INGEST_USER_ID ?? process.env.IOT_USER_ID ?? '6a9f28113309e2383a6fea5f';
    return Array.from(new Set([userId, iotUserId].filter(Boolean)));
  }

  async listForUser(userId: string): Promise<CameraRecord[]> {
    const userIds = this.getIotUserIds(userId);
    const list = await this.cameraModel
      .find({ userId: { $in: userIds } })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return list.map((c) => this.toRecord(c));
  }

  async createForUser(userId: string, input: NewCameraInput): Promise<CameraRecord> {
    const created = await this.cameraModel.create({
      userId,
      name: input.name.trim(),
      roomKey: input.roomKey?.trim() || undefined,
      roomLabel: input.roomLabel?.trim() || undefined,
      status: input.status ?? 'online',
      detectionEnabled: typeof input.detectionEnabled === 'boolean' ? input.detectionEnabled : true,
      streamUrl: input.streamUrl?.trim() || undefined,
      qualityLabel: input.qualityLabel?.trim() || '1080p HD',
      storageTotalGb: typeof input.storageTotalGb === 'number' ? input.storageTotalGb : 50,
    });

    const saved = await created.save();
    return this.toRecord(saved.toObject());
  }

  async updateForUser(userId: string, id: string, patch: UpdateCameraInput): Promise<CameraRecord | null> {
    const update: Partial<Camera> = {};

    if (typeof patch.name === 'string') update.name = patch.name.trim();
    if (typeof patch.roomKey === 'string') update.roomKey = patch.roomKey.trim();
    if (typeof patch.roomLabel === 'string') update.roomLabel = patch.roomLabel.trim();
    if (patch.status === 'online' || patch.status === 'offline') update.status = patch.status;
    if (typeof patch.detectionEnabled === 'boolean') update.detectionEnabled = patch.detectionEnabled;
    if (typeof patch.streamUrl === 'string') update.streamUrl = patch.streamUrl.trim() || undefined;
    if (typeof patch.qualityLabel === 'string') update.qualityLabel = patch.qualityLabel.trim();
    if (typeof patch.storageTotalGb === 'number') update.storageTotalGb = patch.storageTotalGb;

    const updated = await this.cameraModel
      .findOneAndUpdate({ _id: id, userId }, { $set: update }, { returnDocument: 'after' })
      .lean()
      .exec();

    return updated ? this.toRecord(updated) : null;
  }

  async updateStreamUrlAndStatus(
    userId: string,
    cameraId: string,
    streamUrl?: string,
    status?: CameraStatus,
  ): Promise<CameraRecord | null> {
    const update: Partial<Camera> = {};
    if (typeof streamUrl === 'string') update.streamUrl = streamUrl.trim() || undefined;
    if (status === 'online' || status === 'offline') update.status = status;

    const filter: any = { userId };
    if (isValidObjectId(cameraId)) {
      filter._id = cameraId;
    } else {
      filter.name = cameraId;
    }

    const updated = await this.cameraModel
      .findOneAndUpdate(
        filter,
        {
          $set: update,
          $setOnInsert: {
            name: cameraId,
            roomLabel: cameraId,
            qualityLabel: '720p HD',
            storageTotalGb: 50,
            detectionEnabled: true,
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      .lean()
      .exec();

    return updated ? this.toRecord(updated) : null;
  }

  async getForUser(userId: string, idOrName: string): Promise<CameraRecord | null> {
    const safeStr = String(idOrName ?? '').trim();
    if (!safeStr) return null;

    const userIds = this.getIotUserIds(userId);
    const conditions: any[] = [{ name: safeStr }, { roomKey: safeStr }];
    if (isValidObjectId(safeStr)) {
      try {
        conditions.push({ _id: new Types.ObjectId(safeStr) });
      } catch {
        // ignore
      }
      conditions.push({ _id: safeStr });
    }

    const camera = await this.cameraModel
      .findOne({ userId: { $in: userIds }, $or: conditions })
      .lean()
      .exec();
    return camera ? this.toRecord(camera) : null;
  }

  private toRecord(raw: any): CameraRecord {
    return {
      id: String(raw._id ?? raw.id),
      name: String(raw.name ?? ''),
      roomKey: raw.roomKey ? String(raw.roomKey) : undefined,
      roomLabel: raw.roomLabel ? String(raw.roomLabel) : undefined,
      status: (raw.status === 'offline' ? 'offline' : 'online') as CameraStatus,
      detectionEnabled: Boolean(raw.detectionEnabled),
      streamUrl: raw.streamUrl ? String(raw.streamUrl) : undefined,
      qualityLabel: String(raw.qualityLabel ?? '1080p HD'),
      storageTotalGb: Number(raw.storageTotalGb ?? 50),
      createdAt: new Date(raw.createdAt ?? Date.now()).toISOString(),
    };
  }
}
