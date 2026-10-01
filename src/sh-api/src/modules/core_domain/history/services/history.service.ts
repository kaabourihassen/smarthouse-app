import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  HistoryCategory,
  HistoryEvent,
  HistoryEventDocument,
  HistoryIcon,
} from '../schemas/history-event.schema';

export type HistoryRecord = {
  id: string;
  category: HistoryCategory;
  title: string;
  subtitle: string;
  actorName?: string;
  locationLabel?: string;
  detail?: string;
  icon: HistoryIcon;
  createdAt: string;
};

export type CreateHistoryEventInput = {
  category: HistoryCategory;
  icon: HistoryIcon;
  title: string;
  subtitle: string;
  actorName?: string;
  locationLabel?: string;
  detail?: string;
};

@Injectable()
export class HistoryService {
  constructor(
    @InjectModel(HistoryEvent.name)
    private readonly historyModel: Model<HistoryEventDocument>,
  ) {}

  async listForUser(userId: string): Promise<HistoryRecord[]> {
    const items = await this.historyModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return items.map((e) => this.toRecord(e));
  }

  async createForUser(userId: string, input: CreateHistoryEventInput): Promise<HistoryRecord> {
    const created = await this.historyModel.create({
      userId,
      category: input.category,
      icon: input.icon,
      title: input.title.trim(),
      subtitle: input.subtitle.trim(),
      actorName: input.actorName?.trim() || undefined,
      locationLabel: input.locationLabel?.trim() || undefined,
      detail: input.detail?.trim() || undefined,
    });

    const saved = await created.save();
    return this.toRecord(saved.toObject());
  }

  private toRecord(raw: any): HistoryRecord {
    return {
      id: String(raw._id ?? raw.id),
      category: raw.category as HistoryCategory,
      icon: raw.icon as HistoryIcon,
      title: String(raw.title ?? ''),
      subtitle: String(raw.subtitle ?? ''),
      actorName: raw.actorName ? String(raw.actorName) : undefined,
      locationLabel: raw.locationLabel ? String(raw.locationLabel) : undefined,
      detail: raw.detail ? String(raw.detail) : undefined,
      createdAt: new Date(raw.createdAt ?? Date.now()).toISOString(),
    };
  }
}
