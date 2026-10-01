import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Room, RoomDocument } from '../schemas/room.schema';
import { HistoryService } from '../../../core_domain/history/services/history.service';

export type RoomRecord = { key: string; label: string };

const DEFAULT_ROOMS: ReadonlyArray<RoomRecord> = [
  { key: 'living', label: 'Living room' },
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'bedroom', label: 'Bedroom' },
  { key: 'bathroom', label: 'Bathroom' },
  { key: 'office', label: 'Office' },
];

@Injectable()
export class RoomsService {
  constructor(
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    private readonly historyService: HistoryService,
  ) {}

  async listForUser(userId: string): Promise<RoomRecord[]> {
    await this.ensureDefaults(userId);
    const rooms = await this.roomModel
      .find({ userId }, { key: 1, label: 1, _id: 0 })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    return rooms.map((r) => ({ key: r.key, label: r.label }));
  }

  async createForUser(userId: string, name: string, actorName?: string): Promise<RoomRecord | null> {
    const label = name.trim();
    if (!label) return null;

    const key = slugify(label);
    if (!key) return null;

    const alreadyExists = await this.roomModel
      .exists({ userId, key })
      .exec();

    const created = await this.roomModel
      .findOneAndUpdate(
        { userId, key },
        { $setOnInsert: { userId, key, label } },
        { upsert: true, returnDocument: 'after' },
      )
      .lean()
      .exec();

    const record = { key: created.key, label: created.label };

    if (!alreadyExists) {
      try {
        await this.historyService.createForUser(userId, {
          category: 'system',
          icon: 'gear',
          title: "Ajout d'une pièce",
          subtitle: `Pièce "${record.label}" ajoutée`,
          actorName: actorName?.trim() || undefined,
          locationLabel: record.label,
        });
      } catch {
        // Ignore history errors.
      }
    }

    return record;
  }

  private async ensureDefaults(userId: string): Promise<void> {
    const existing = await this.roomModel
      .find({ userId }, { key: 1, _id: 0 })
      .lean()
      .exec();

    const existingKeys = new Set(existing.map((r) => r.key));
    const missing = DEFAULT_ROOMS.filter((r) => !existingKeys.has(r.key));
    if (!missing.length) return;

    try {
      await this.roomModel.insertMany(
        missing.map((r) => ({ userId, key: r.key, label: r.label })),
        { ordered: false },
      );
    } catch {
      // Ignore duplicate key errors caused by concurrent requests.
    }
  }
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}
