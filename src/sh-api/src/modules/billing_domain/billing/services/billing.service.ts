import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { UsersService } from '../../../iam/users/services/users.service';
import type { PlanId } from '../dto/create-checkout-session.dto';
import { SubscriptionsService } from '../../../billing_domain/subscriptions/services/subscriptions.service';
import { Role } from '../../../core_domain/common/enums/role.enum';

@Injectable()
export class BillingService {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  private async resolveBillingUserId(actorUserId: string): Promise<{ actor: any; billingUserId: string }> {
    if (!actorUserId) {
      throw new UnauthorizedException();
    }

    const actor = await this.usersService.findById(actorUserId);
    if (!actor) {
      throw new UnauthorizedException();
    }

    const ownSub = await this.subscriptionsService.findLatestByUserId(actorUserId);
    const ownPlanId = typeof ownSub?.planId === 'string' ? ownSub.planId.trim() : '';
    if (ownPlanId) {
      return { actor, billingUserId: actorUserId };
    }

    const legacyPlanId = typeof (actor as any)?.currentPlanId === 'string' ? String((actor as any).currentPlanId).trim() : '';
    if (legacyPlanId) {
      return { actor, billingUserId: actorUserId };
    }

    if (actor.email) {
      const memberSub = await this.subscriptionsService.findLatestByMemberEmail(actor.email);
      if (memberSub) {
        throw new ForbiddenException('Only the subscription owner can change the plan');
      }
    }

    return { actor, billingUserId: actorUserId };
  }

  private getStripeClient(): Stripe {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new BadRequestException('STRIPE_SECRET_KEY is not configured');
    }
    return new Stripe(secretKey);
  }

  private getClientUrl(): string {
    const clientUrl = this.configService.get<string>('CLIENT_URL');
    if (!clientUrl) {
      throw new BadRequestException('CLIENT_URL is not configured');
    }
    return clientUrl.replace(/\/+$/, '');
  }

  private getPriceId(planId: PlanId): string {
    const envKeyByPlan: Record<PlanId, string> = {
      basic: 'STRIPE_PRICE_BASIC',
      'premium-plus': 'STRIPE_PRICE_PREMIUM_PLUS',
      'extended-pro': 'STRIPE_PRICE_EXTENDED_PRO',
    };

    const envKey = envKeyByPlan[planId];
    const priceId = this.configService.get<string>(envKey);
    if (!priceId) {
      throw new BadRequestException(`${envKey} is not configured`);
    }
    return priceId;
  }

  private getPlanIdFromPriceId(priceId: string | undefined): PlanId | undefined {
    if (!priceId) return undefined;

    const mappings: Array<{ planId: PlanId; envKey: string }> = [
      { planId: 'basic', envKey: 'STRIPE_PRICE_BASIC' },
      { planId: 'premium-plus', envKey: 'STRIPE_PRICE_PREMIUM_PLUS' },
      { planId: 'extended-pro', envKey: 'STRIPE_PRICE_EXTENDED_PRO' },
    ];

    for (const mapping of mappings) {
      const configured = this.configService.get<string>(mapping.envKey);
      if (configured && configured === priceId) return mapping.planId;
    }
    return undefined;
  }

  async createSubscriptionCheckoutSession(userId: string, planId: PlanId): Promise<{ url: string }> {
    const { billingUserId } = await this.resolveBillingUserId(userId);

    const user = await this.usersService.findById(billingUserId);
    if (!user) {
      throw new UnauthorizedException();
    }

    const stripe = this.getStripeClient();
    const clientUrl = this.getClientUrl();
    const priceId = this.getPriceId(planId);

    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`.trim(),
        metadata: { userId: billingUserId },
      });
      customerId = customer.id;

      await this.usersService.updateStripeBilling(billingUserId, {
        stripeCustomerId: customerId,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${clientUrl}/dashboard/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/dashboard/subscription?checkout=cancel`,
      client_reference_id: billingUserId,
      metadata: {
        userId: billingUserId,
        planId,
      },
      subscription_data: {
        metadata: {
          userId: billingUserId,
          planId,
        },
      },
    });

    const url = session.url;
    if (!url) {
      throw new BadRequestException('Stripe Checkout session has no URL');
    }

    return { url };
  }

  async syncCheckoutSession(userId: string, sessionId: string): Promise<{ synced: boolean }> {
    const normalizedSessionId = (sessionId ?? '').trim();
    if (!normalizedSessionId) {
      throw new BadRequestException('Missing sessionId');
    }

    const { billingUserId } = await this.resolveBillingUserId(userId);

    const stripe = this.getStripeClient();

    const session = (await stripe.checkout.sessions.retrieve(normalizedSessionId)) as Stripe.Checkout.Session;

    if (session.mode !== 'subscription') {
      throw new BadRequestException('Checkout session is not a subscription');
    }

    const sessionUserId = session.metadata?.['userId'];
    const clientRef = typeof session.client_reference_id === 'string' ? session.client_reference_id : undefined;
    if (sessionUserId && sessionUserId !== billingUserId) {
      throw new UnauthorizedException();
    }
    if (!sessionUserId && clientRef && clientRef !== billingUserId) {
      throw new UnauthorizedException();
    }

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : typeof (session.subscription as any)?.id === 'string'
          ? (session.subscription as any).id
          : null;
    const customerId = typeof session.customer === 'string' ? session.customer : null;

    if (!subscriptionId) {
      throw new BadRequestException('Checkout session has no subscription');
    }

    const subscription = (await stripe.subscriptions.retrieve(subscriptionId)) as unknown as Stripe.Subscription;

    const status = subscription.status;
    const anySub = subscription as any;
    const unix = anySub?.current_period_end;
    const currentPeriodEnd = typeof unix === 'number' ? new Date(unix * 1000) : undefined;
    const cancelAtPeriodEnd = typeof anySub?.cancel_at_period_end === 'boolean' ? anySub.cancel_at_period_end : undefined;

    const price = anySub?.items?.data?.[0]?.price;
    const priceId = typeof price?.id === 'string' ? price.id : undefined;
    const priceUnitAmount = typeof price?.unit_amount === 'number' ? price.unit_amount : undefined;
    const priceCurrency = typeof price?.currency === 'string' ? price.currency : undefined;
    const priceInterval = typeof price?.recurring?.interval === 'string' ? price.recurring.interval : undefined;
    const priceIntervalCount = typeof price?.recurring?.interval_count === 'number' ? price.recurring.interval_count : undefined;

    const planIdFromSession = session.metadata?.['planId'];
    const planIdFromSub = (subscription as any)?.metadata?.planId;
    const inferredPlanId = this.getPlanIdFromPriceId(priceId);
    const planId =
      (typeof planIdFromSession === 'string' && planIdFromSession ? planIdFromSession : undefined) ??
      (typeof planIdFromSub === 'string' && planIdFromSub ? planIdFromSub : undefined) ??
      inferredPlanId;

    await this.subscriptionsService.upsertByStripeSubscriptionId(subscriptionId, billingUserId, {
      stripeCustomerId: customerId ?? undefined,
      status,
      planId,
      priceId,
      priceUnitAmount,
      priceCurrency,
      priceInterval,
      priceIntervalCount,
      currentPeriodEnd,
      cancelAtPeriodEnd,
    });

    await this.usersService.updateStripeBilling(billingUserId, {
      stripeCustomerId: customerId ?? undefined,
      stripeSubscriptionId: subscriptionId,
      subscriptionStatus: status,
      currentPlanId: planId,
      currentPeriodEnd,
    });

    await this.usersService.ensureResidentRole(billingUserId);

    // Enforce a single Stripe subscription per user.
    // Safe to do here because this method runs after a successful Checkout.
    if (customerId) {
      try {
        const list = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
        const userIdStr = String(billingUserId);

        for (const s of list.data ?? []) {
          if (!s?.id || s.id === subscriptionId) continue;

          const metaUserId = typeof (s as any)?.metadata?.userId === 'string' ? (s as any).metadata.userId : '';
          if (metaUserId !== userIdStr) continue;

          const sStatus = (s as any)?.status;
          if (sStatus === 'canceled' || sStatus === 'incomplete_expired') continue;

          try {
            await stripe.subscriptions.cancel(s.id);
          } catch {
            // Ignore cancellation errors (already canceled, not found, etc.).
          }

          try {
            await this.subscriptionsService.updateByStripeSubscriptionId(s.id, {
              status: 'canceled',
              cancelAtPeriodEnd: false,
            });
          } catch {
            // Ignore local sync errors.
          }
        }
      } catch {
        // Ignore Stripe list errors.
      }
    }

    return { synced: true };
  }

  async cancelSubscription(userId: string): Promise<{ canceled: boolean }> {
    const { actor, billingUserId } = await this.resolveBillingUserId(userId);

    if (actor.role === Role.Member) {
      throw new ForbiddenException('Only the subscription owner can cancel the plan');
    }

    const subscription = await this.subscriptionsService.findLatestByUserId(billingUserId);

    const stripe = this.getStripeClient();

    const tryCancel = async (id: string): Promise<Stripe.Subscription | null> => {
      try {
        return (await stripe.subscriptions.cancel(id)) as unknown as Stripe.Subscription;
      } catch (err: any) {
        if (err?.code === 'resource_missing') return null;
        throw err;
      }
    };

    let canceled: Stripe.Subscription | null = null;
    const directId = subscription?.stripeSubscriptionId ?? (actor as any)?.stripeSubscriptionId;
    if (directId) {
      canceled = await tryCancel(directId);
    }

    if (!canceled) {
      const customerId = subscription?.stripeCustomerId ?? actor?.stripeCustomerId;
      if (customerId) {
        const list = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 });
        const candidate = (list.data ?? []).find(
          (s) => s?.id && s.status !== 'canceled' && s.status !== 'incomplete_expired',
        );
        if (candidate?.id) {
          canceled = await tryCancel(candidate.id);
          if (canceled && subscription && subscription.stripeSubscriptionId !== candidate.id) {
            subscription.stripeSubscriptionId = candidate.id as any;
          }
        }
      }
    }

    if (!canceled) {
      throw new BadRequestException('Stripe subscription not found');
    }

    const status = canceled.status;
    const anySub = canceled as any;
    const unix = anySub?.current_period_end;
    const currentPeriodEnd = typeof unix === 'number' ? new Date(unix * 1000) : undefined;
    const cancelAtPeriodEnd = typeof anySub?.cancel_at_period_end === 'boolean' ? anySub.cancel_at_period_end : undefined;

    if (subscription) {
      subscription.status = status;
      if (currentPeriodEnd) subscription.currentPeriodEnd = currentPeriodEnd;
      if (cancelAtPeriodEnd !== undefined) subscription.cancelAtPeriodEnd = cancelAtPeriodEnd;
      if (Array.isArray(subscription.members)) {
        for (const member of subscription.members) {
          member.isActive = false;
        }
      }

      await subscription.save();
    }

    await this.usersService.updateStripeBilling(billingUserId, {
      stripeSubscriptionId: canceled.id,
      subscriptionStatus: status,
      currentPeriodEnd,
    });

    const memberEmails = (subscription?.members ?? [])
      .map((m) => (m?.email ?? '').trim().toLowerCase())
      .filter(Boolean);
    if (memberEmails.length) {
      await Promise.all(memberEmails.map((email) => this.usersService.updateRoleByEmail(email, Role.Resident)));
    }

    return { canceled: true };
  }
}
