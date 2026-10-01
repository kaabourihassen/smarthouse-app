import { ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { SubscriptionsService } from '../../../billing_domain/subscriptions/services/subscriptions.service';
import { UsersService } from '../../../iam/users/services/users.service';

type AuthedRequest = Request & { user?: { id?: string } };

function hasActiveSubscription(sub: any): boolean {
  if (!sub) return false;

  const planId = typeof sub?.planId === 'string' ? sub.planId.trim() : '';
  if (!planId) return false;

  const end = sub?.currentPeriodEnd instanceof Date ? sub.currentPeriodEnd.getTime() : null;
  if (typeof end === 'number' && Number.isFinite(end) && end <= Date.now()) return false;

  const statusRaw = typeof sub?.status === 'string' ? sub.status.trim().toLowerCase() : '';
  if (!statusRaw) {
    // Legacy records may not have a status; if the planId exists and it's not expired, treat as active.
    return true;
  }

  // Stripe statuses you might see: active, trialing, canceled, incomplete, incomplete_expired, past_due, unpaid, paused.
  // We allow legacy statuses (paid/succeeded). Canceled should not grant access.
  if (statusRaw === 'active' || statusRaw === 'trialing') return true;
  if (statusRaw === 'paid' || statusRaw === 'succeeded') return true;
  return false;
}

function hasActiveUserPlan(user: any): boolean {
  if (!user) return false;

  const planId = typeof user?.currentPlanId === 'string' ? user.currentPlanId.trim() : '';
  if (!planId) return false;

  const end = user?.currentPeriodEnd instanceof Date ? user.currentPeriodEnd.getTime() : null;
  if (typeof end === 'number' && Number.isFinite(end) && end <= Date.now()) return false;

  const statusRaw = typeof user?.subscriptionStatus === 'string' ? user.subscriptionStatus.trim().toLowerCase() : '';
  if (!statusRaw) {
    // Legacy users may only have currentPlanId/currentPeriodEnd.
    return true;
  }

  if (statusRaw === 'active' || statusRaw === 'trialing') return true;
  if (statusRaw === 'paid' || statusRaw === 'succeeded') return true;
  return false;
}

/**
 * JWT auth guard + subscription gate.
 *
 * Use this for API endpoints that should only be accessible to users
 * with an active (paid) subscription.
 */
@Injectable()
export class JwtSubscriptionGuard extends AuthGuard('jwt') {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly usersService: UsersService,
  ) {
    super();
  }

  override async canActivate(context: ExecutionContext) {
    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) return false;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();

    const sub = await this.subscriptionsService.findLatestByUserId(userId);
    if (hasActiveSubscription(sub)) return true;

    // Fallback for older accounts where Stripe sync stored the current plan on the User document.
    const user = await this.usersService.findById(userId);
    if (hasActiveUserPlan(user)) return true;

    if (user?.email) {
      const memberSub = await this.subscriptionsService.findLatestByMemberEmail(user.email);
      if (hasActiveSubscription(memberSub)) return true;
    }

    throw new ForbiddenException('Subscription required');

    // (unreachable)
  }
}
