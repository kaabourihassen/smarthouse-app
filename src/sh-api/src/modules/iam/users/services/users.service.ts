import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { Role } from '../../../core_domain/common/enums/role.enum';

export type StripeBillingPatch = {
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: string;
  currentPlanId?: string;
  currentPeriodEnd?: Date;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findByStripeSubscriptionId(subscriptionId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ stripeSubscriptionId: subscriptionId }).exec();
  }

  async listAllSafeUsers() {
    const users = await this.userModel
      .find({})
      .sort({ createdAt: -1 })
      .exec();
    return users.map((u) => this.toSafeUser(u));
  }

  async updateRole(userId: string, role: Role) {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    user.role = role;
    const saved = await user.save();
    return this.toSafeUser(saved);
  }

  async updateRoleByEmail(email: string, role: Role): Promise<void> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    const user = await this.findByEmail(normalized);
    if (!user) return;
    if (user.role === Role.Admin) return;
    if (user.role === role) return;
    user.role = role;
    await user.save();
  }

  async ensureResidentRole(userId: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) return;
    if (user.role === Role.Admin) return;
    if (user.role === Role.Resident) return;
    user.role = Role.Resident;
    await user.save();
  }

  async setBanned(userId: string, banned: boolean) {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    user.banned = Boolean(banned);
    const saved = await user.save();
    return this.toSafeUser(saved);
  }

  async deleteById(userId: string): Promise<void> {
    const deleted = await this.userModel.findByIdAndDelete(userId).exec();
    if (!deleted) throw new NotFoundException('User not found');
  }

  async create(
    firstName: string,
    lastName: string,
    email: string,
    passwordHash: string,
    role: Role = Role.Resident,
  ) {
    const exists = await this.findByEmail(email);
    if (exists) {
      throw new ConflictException('Email already in use');
    }

    const created = new this.userModel({ firstName, lastName, email, passwordHash, role });
    const saved = await created.save();
    return this.toSafeUser(saved);
  }

  async updateProfile(
    userId: string,
    updates: { firstName?: string; lastName?: string; email?: string },
  ) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (updates.firstName !== undefined) {
      user.firstName = updates.firstName.trim();
    }
    if (updates.lastName !== undefined) {
      user.lastName = updates.lastName.trim();
    }
    if (updates.email !== undefined) {
      const nextEmail = updates.email.trim().toLowerCase();
      if (nextEmail !== user.email) {
        const exists = await this.findByEmail(nextEmail);
        if (exists) {
          throw new ConflictException('Email already in use');
        }
      }
      user.email = nextEmail;
    }

    const saved = await user.save();
    return this.toSafeUser(saved);
  }

  async updateStripeBilling(userId: string, patch: StripeBillingPatch): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (patch.stripeCustomerId !== undefined) user.stripeCustomerId = patch.stripeCustomerId;
    if (patch.stripeSubscriptionId !== undefined) user.stripeSubscriptionId = patch.stripeSubscriptionId;
    if (patch.subscriptionStatus !== undefined) user.subscriptionStatus = patch.subscriptionStatus;
    if (patch.currentPlanId !== undefined) user.currentPlanId = patch.currentPlanId;
    if (patch.currentPeriodEnd !== undefined) user.currentPeriodEnd = patch.currentPeriodEnd;

    await user.save();
  }

  toSafeUser(user: UserDocument) {
    return {
      id: user.id as string,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      banned: Boolean((user as any).banned),
      createdAt: user.createdAt,
    };
  }
}
