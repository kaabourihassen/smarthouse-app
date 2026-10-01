import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Complaint, ComplaintDocument, ComplaintStatus } from '../schemas/complaint.schema';
import { findOffensiveToken } from '../utils/offensive-language';
import { OpenAiModerationService } from './openai-moderation.service';

export type ComplaintRecord = {
  id: string;
  userId: string;
  title: string;
  message: string;
  status: ComplaintStatus;
  createdAt: Date;
};

@Injectable()
export class ComplaintsService {
  constructor(
    @InjectModel(Complaint.name)
    private readonly complaintModel: Model<ComplaintDocument>,
    private readonly moderation: OpenAiModerationService,
  ) {}

  async createForUser(userId: string, input: { title: string; message: string }): Promise<ComplaintRecord> {
    const title = input.title.trim();
    const message = input.message.trim();

    // Quick local filter (cheap). Still do OpenAI moderation below.
    const badInTitle = findOffensiveToken(title);
    const badInMessage = findOffensiveToken(message);
    const bad = badInTitle ?? badInMessage;
    if (bad) {
      throw new BadRequestException('Your complaint contains offensive language. Please rephrase and try again.');
    }

    // Authoritative AI moderation (French/English supported).
    const flagged = await this.moderation.isFlagged(`${title}\n\n${message}`);
    if (flagged) {
      throw new BadRequestException('Your complaint contains offensive language. Please rephrase and try again.');
    }

    const created = await this.complaintModel.create({
      userId,
      title,
      message,
      status: 'open',
    });
    const saved = await created.save();
    return this.toRecord(saved.toObject());
  }

  async listForUser(userId: string): Promise<ComplaintRecord[]> {
    const complaints = await this.complaintModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return complaints.map((c) => this.toRecord(c));
  }

  async listAll(): Promise<ComplaintRecord[]> {
    const complaints = await this.complaintModel
      .find({})
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return complaints.map((c) => this.toRecord(c));
  }

  async updateStatus(id: string, status: ComplaintStatus): Promise<ComplaintRecord> {
    const updated = await this.complaintModel
      .findByIdAndUpdate(id, { $set: { status } }, { returnDocument: 'after' })
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('Complaint not found');
    }
    return this.toRecord(updated);
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.complaintModel.deleteMany({ userId }).exec();
  }

  private toRecord(raw: any): ComplaintRecord {
    return {
      id: String(raw._id ?? raw.id),
      userId: String(raw.userId ?? ''),
      title: String(raw.title ?? ''),
      message: String(raw.message ?? ''),
      status: (raw.status ?? 'open') as ComplaintStatus,
      createdAt: raw.createdAt instanceof Date ? raw.createdAt : new Date(raw.createdAt),
    };
  }
}
