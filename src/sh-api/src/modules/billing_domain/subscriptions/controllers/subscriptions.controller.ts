import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../iam/auth/guards/jwt-auth.guard';
import { UsersService } from '../../../iam/users/services/users.service';
import { AddSubscriptionMemberDto } from '../dto/add-subscription-member.dto';
import { SubscriptionsService } from '../services/subscriptions.service';
import type { SubscriptionMemberRole } from '../schemas/subscription.schema';
import { Role } from '../../../core_domain/common/enums/role.enum';

type AuthedRequest = Request & { user?: { id?: string } };

type SubscriptionMemberRecord = {
  fullName: string;
  email: string;
  role: SubscriptionMemberRole;
  isActive: boolean;
  addedAt: string;
};

type SubscriptionMeRecord = {
  isOwner: boolean;
  status?: string;
  planId?: string;
  priceId?: string;
  priceUnitAmount?: number;
  priceCurrency?: string;
  priceInterval?: string;
  priceIntervalCount?: number;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  members: SubscriptionMemberRecord[];
};

function toMemberRecord(m: any): SubscriptionMemberRecord {
  return {
    fullName: typeof m?.fullName === 'string' ? m.fullName : '',
    email: typeof m?.email === 'string' ? m.email : '',
    role: m?.role as SubscriptionMemberRole,
    isActive: !!m?.isActive,
    addedAt: m?.addedAt instanceof Date ? m.addedAt.toISOString() : new Date(0).toISOString(),
  };
}

function toMeRecord(sub: any, isOwner: boolean): SubscriptionMeRecord {
  const rawMembers = Array.isArray(sub?.members) ? sub.members : [];
  return {
    isOwner,
    status: typeof sub?.status === 'string' ? sub.status : undefined,
    planId: typeof sub?.planId === 'string' ? sub.planId : undefined,
    priceId: typeof sub?.priceId === 'string' ? sub.priceId : undefined,
    priceUnitAmount: typeof sub?.priceUnitAmount === 'number' ? sub.priceUnitAmount : undefined,
    priceCurrency: typeof sub?.priceCurrency === 'string' ? sub.priceCurrency : undefined,
    priceInterval: typeof sub?.priceInterval === 'string' ? sub.priceInterval : undefined,
    priceIntervalCount: typeof sub?.priceIntervalCount === 'number' ? sub.priceIntervalCount : undefined,
    currentPeriodEnd: sub?.currentPeriodEnd instanceof Date ? sub.currentPeriodEnd.toISOString() : undefined,
    cancelAtPeriodEnd: typeof sub?.cancelAtPeriodEnd === 'boolean' ? sub.cancelAtPeriodEnd : undefined,
    members: rawMembers.map(toMemberRecord),
  };
}

@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly usersService: UsersService,
  ) {}

  private getUserId(req: AuthedRequest): string {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return userId;
  }

  private assertOwnerRole(req: AuthedRequest): void {
    const role = (req.user as any)?.role as Role | undefined;
    if (role === Role.Member) {
      throw new ForbiddenException('Only the subscription owner can manage members');
    }
  }

  @Get('me')
  async me(@Req() req: AuthedRequest): Promise<{ subscription: SubscriptionMeRecord | null }> {
    const userId = this.getUserId(req);
    const sub = await this.subscriptionsService.findLatestByUserId(userId);

    if (sub) {
      return { subscription: toMeRecord(sub.toObject(), true) };
    }

    // Legacy fallback: older accounts may only have the plan stored on the User document.
    const user = await this.usersService.findById(userId);
    if (!user) {
      return { subscription: null };
    }
    const planId = typeof (user as any)?.currentPlanId === 'string' ? String((user as any).currentPlanId) : '';
    if (!planId.trim()) {
      const memberSub = await this.subscriptionsService.findLatestByMemberEmail(user.email);
      if (!memberSub) {
        return { subscription: null };
      }

      return { subscription: toMeRecord(memberSub.toObject(), false) };
    }

    const status = typeof (user as any)?.subscriptionStatus === 'string' ? String((user as any).subscriptionStatus) : undefined;
    const currentPeriodEnd = (user as any)?.currentPeriodEnd instanceof Date ? (user as any).currentPeriodEnd.toISOString() : undefined;

    return {
      subscription: {
        isOwner: true,
        status,
        planId: planId.trim(),
        currentPeriodEnd,
        members: [],
      },
    };
  }

  @Post('me/members')
  async addMember(@Req() req: AuthedRequest, @Body() dto: AddSubscriptionMemberDto) {
    const userId = this.getUserId(req);
    this.assertOwnerRole(req);

    const email = dto.email.trim().toLowerCase();
    if (!email) throw new BadRequestException('Invalid member input');

    const updated = await this.subscriptionsService.addMemberForUser(userId, { email });

    return { subscription: toMeRecord(updated.toObject(), true) };
  }

  @Delete('me/members/:email')
  async removeMember(@Req() req: AuthedRequest, @Param('email') emailParam: string) {
    const userId = this.getUserId(req);
    this.assertOwnerRole(req);

    const email = (emailParam ?? '').trim().toLowerCase();
    if (!email || !email.includes('@')) throw new BadRequestException('Invalid member input');

    const updated = await this.subscriptionsService.removeMemberForUser(userId, email);
    return { subscription: toMeRecord(updated.toObject(), true) };
  }
}
