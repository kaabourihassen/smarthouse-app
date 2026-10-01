import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subscription, SubscriptionDocument, SubscriptionMemberRole } from '../schemas/subscription.schema';
import { UsersService } from '../../../iam/users/services/users.service';
import { Role } from '../../../core_domain/common/enums/role.enum';

export type StripeSubscriptionPatch = {
  stripeCustomerId?: string;
  status?: string;
  planId?: string;
  priceId?: string;
  priceUnitAmount?: number;
  priceCurrency?: string;
  priceInterval?: string;
  priceIntervalCount?: number;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
};

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,
    private readonly usersService: UsersService,
  ) {}

  findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<SubscriptionDocument | null> {
    return this.subscriptionModel.findOne({ stripeSubscriptionId }).exec();
  }

  findLatestByUserId(userId: string): Promise<SubscriptionDocument | null> {
    return this.subscriptionModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  findLatestByMemberEmail(email: string): Promise<SubscriptionDocument | null> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return Promise.resolve(null);

    return this.subscriptionModel
      .findOne({ members: { $elemMatch: { email: normalized, isActive: true } } })
      .sort({ createdAt: -1 })
      .exec();
  }

  async addMemberForUser(
    userId: string,
    input: { email: string },
  ): Promise<SubscriptionDocument> {
    const subscription = await this.findLatestByUserId(userId);
    if (!subscription) {
      throw new BadRequestException('No subscription found for user');
    }

    const email = input.email.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Invalid member input');
    }

    const alreadyExists = (subscription.members ?? []).some((m) => (m.email ?? '').toLowerCase() === email);
    if (alreadyExists) {
      throw new BadRequestException('Member already exists');
    }

    const existingUser = await this.usersService.findByEmail(email);
    if (!existingUser) {
      throw new BadRequestException('No user found with this email');
    }

    const fullName = (() => {
      const composed = `${existingUser.firstName ?? ''} ${existingUser.lastName ?? ''}`.trim();
      if (composed) return composed;
      const local = email.split('@')[0] ?? '';
      const normalized = local.replace(/[._-]+/g, ' ').trim();
      return normalized || 'Member';
    })();

    subscription.members = subscription.members ?? [];
    subscription.members.push({
      fullName,
      email,
      role: 'guest',
      isActive: true,
      addedAt: new Date(),
    } as any);

    const saved = await subscription.save();

    await this.usersService.updateRoleByEmail(email, Role.Member);

    return saved;
  }

  async removeMemberForUser(userId: string, emailInput: string): Promise<SubscriptionDocument> {
    const subscription = await this.findLatestByUserId(userId);
    if (!subscription) {
      throw new BadRequestException('No subscription found for user');
    }

    const email = emailInput.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Invalid member input');
    }

    const members = subscription.members ?? [];
    const nextMembers = members.filter((m) => (m.email ?? '').toLowerCase() !== email);

    if (nextMembers.length === members.length) {
      throw new BadRequestException('Member not found');
    }

    subscription.members = nextMembers as any;
    return subscription.save();
  }

  async upsertByStripeSubscriptionId(
    stripeSubscriptionId: string,
    userId: string,
    patch: StripeSubscriptionPatch,
  ): Promise<SubscriptionDocument> {
    const now = new Date();

    return this.subscriptionModel
      .findOneAndUpdate(
        { stripeSubscriptionId },
        {
          $setOnInsert: {
            stripeSubscriptionId,
            userId: new Types.ObjectId(userId),
            createdAt: now,
          },
          $set: {
            ...patch,
            updatedAt: now,
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      .exec();
  }

  async updateByStripeSubscriptionId(
    stripeSubscriptionId: string,
    patch: StripeSubscriptionPatch,
  ): Promise<SubscriptionDocument | null> {
    const now = new Date();
    return this.subscriptionModel
      .findOneAndUpdate(
        { stripeSubscriptionId },
        { $set: { ...patch, updatedAt: now } },
        { returnDocument: 'after' },
      )
      .exec();
  }

  async listAll(): Promise<any[]> {
    return this.subscriptionModel
      .find({})
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async listLatestPerUser(): Promise<any[]> {
    return this.subscriptionModel
      .aggregate([
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$userId', doc: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$doc' } },
        { $sort: { createdAt: -1 } },
      ])
      .exec();
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.subscriptionModel.deleteMany({ userId: new Types.ObjectId(userId) }).exec();
  }
}
