import { BadRequestException, Controller, Headers, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import Stripe from 'stripe';
import { UsersService } from '../../../iam/users/services/users.service';
import { SubscriptionsService } from '../../../billing_domain/subscriptions/services/subscriptions.service';

type StripeWebhookRequest = Request & { body: Buffer };

function getCurrentPeriodEndFromSubscription(subscription: Stripe.Subscription): Date | undefined {
  const unix = (subscription as any)?.current_period_end;
  return typeof unix === 'number' ? new Date(unix * 1000) : undefined;
}

function getPriceIdFromSubscription(subscription: Stripe.Subscription): string | undefined {
  const priceId = (subscription as any)?.items?.data?.[0]?.price?.id;
  return typeof priceId === 'string' ? priceId : undefined;
}

function getPriceDetailsFromSubscription(subscription: Stripe.Subscription): {
  priceId?: string;
  priceUnitAmount?: number;
  priceCurrency?: string;
  priceInterval?: string;
  priceIntervalCount?: number;
} {
  const price = (subscription as any)?.items?.data?.[0]?.price;

  const priceId = typeof price?.id === 'string' ? price.id : undefined;
  const priceUnitAmount = typeof price?.unit_amount === 'number' ? price.unit_amount : undefined;
  const priceCurrency = typeof price?.currency === 'string' ? price.currency : undefined;
  const priceInterval = typeof price?.recurring?.interval === 'string' ? price.recurring.interval : undefined;
  const priceIntervalCount =
    typeof price?.recurring?.interval_count === 'number' ? price.recurring.interval_count : undefined;

  return { priceId, priceUnitAmount, priceCurrency, priceInterval, priceIntervalCount };
}

@Controller('webhooks')
export class StripeWebhooksController {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  private getStripeClient(): Stripe {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new BadRequestException('STRIPE_SECRET_KEY is not configured');
    }
    return new Stripe(secretKey);
  }

  @Post('stripe')
  async handleStripeWebhook(
    @Req() req: StripeWebhookRequest,
    @Headers('stripe-signature') signature?: string,
  ) {
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new BadRequestException('STRIPE_WEBHOOK_SECRET is not configured');
    }
    if (!signature) {
      throw new BadRequestException('Missing Stripe-Signature header');
    }
    const stripe = this.getStripeClient();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (err: any) {
      throw new BadRequestException(`Webhook signature verification failed: ${err?.message ?? 'unknown error'}`);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;

        const userId = session.metadata?.['userId'];
        const planId = session.metadata?.['planId'];
        if (!userId) break;

        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
        const customerId = typeof session.customer === 'string' ? session.customer : null;

        let status: string | undefined;
        let currentPeriodEnd: Date | undefined;
        let priceId: string | undefined;
        let priceUnitAmount: number | undefined;
        let priceCurrency: string | undefined;
        let priceInterval: string | undefined;
        let priceIntervalCount: number | undefined;
        let cancelAtPeriodEnd: boolean | undefined;
        if (subscriptionId) {
          const subscription = (await stripe.subscriptions.retrieve(subscriptionId)) as unknown as Stripe.Subscription;
          status = subscription.status;
          currentPeriodEnd = getCurrentPeriodEndFromSubscription(subscription);
          const price = getPriceDetailsFromSubscription(subscription);
          priceId = price.priceId;
          priceUnitAmount = price.priceUnitAmount;
          priceCurrency = price.priceCurrency;
          priceInterval = price.priceInterval;
          priceIntervalCount = price.priceIntervalCount;
          cancelAtPeriodEnd = (subscription as any)?.cancel_at_period_end;
        }

        if (subscriptionId) {
          await this.subscriptionsService.upsertByStripeSubscriptionId(subscriptionId, userId, {
            stripeCustomerId: customerId ?? undefined,
            status,
            planId: planId ?? undefined,
            priceId,
            priceUnitAmount,
            priceCurrency,
            priceInterval,
            priceIntervalCount,
            currentPeriodEnd,
            cancelAtPeriodEnd,
          });
        }

        // Keep user fields in sync (optional, but useful for quick lookups)
        await this.usersService.updateStripeBilling(userId, {
          stripeCustomerId: customerId ?? undefined,
          stripeSubscriptionId: subscriptionId ?? undefined,
          subscriptionStatus: status,
          currentPlanId: planId,
          currentPeriodEnd,
        });

        await this.usersService.ensureResidentRole(userId);

        // Enforce a single Stripe subscription per user:
        // cancel any older subscriptions created for the same user.
        if (customerId && subscriptionId) {
          try {
            const list = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
            const userIdStr = String(userId);

            for (const s of list.data ?? []) {
              if (!s?.id || s.id === subscriptionId) continue;

              const metaUserId = typeof (s as any)?.metadata?.userId === 'string' ? (s as any).metadata.userId : '';
              if (metaUserId !== userIdStr) continue;

              const sStatus = (s as any)?.status;
              if (sStatus === 'canceled' || sStatus === 'incomplete_expired') continue;

              try {
                await stripe.subscriptions.cancel(s.id);
              } catch {
                // Ignore cancellation errors.
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
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const status = subscription.status;
        const currentPeriodEnd = getCurrentPeriodEndFromSubscription(subscription);
        const price = getPriceDetailsFromSubscription(subscription);
        const priceId = price.priceId;
        const priceUnitAmount = price.priceUnitAmount;
        const priceCurrency = price.priceCurrency;
        const priceInterval = price.priceInterval;
        const priceIntervalCount = price.priceIntervalCount;
        const cancelAtPeriodEnd = (subscription as any)?.cancel_at_period_end;

        const userIdFromMetadata = (subscription as any)?.metadata?.userId;
        const planIdFromMetadata = (subscription as any)?.metadata?.planId;

        if (typeof userIdFromMetadata === 'string' && userIdFromMetadata) {
          await this.subscriptionsService.upsertByStripeSubscriptionId(subscription.id, userIdFromMetadata, {
            stripeCustomerId: typeof (subscription as any)?.customer === 'string' ? (subscription as any).customer : undefined,
            status,
            planId: typeof planIdFromMetadata === 'string' ? planIdFromMetadata : undefined,
            priceId,
            priceUnitAmount,
            priceCurrency,
            priceInterval,
            priceIntervalCount,
            currentPeriodEnd,
            cancelAtPeriodEnd,
          });

          await this.usersService.ensureResidentRole(userIdFromMetadata);
        } else {
          await this.subscriptionsService.updateByStripeSubscriptionId(subscription.id, {
            status,
            priceId,
            priceUnitAmount,
            priceCurrency,
            priceInterval,
            priceIntervalCount,
            currentPeriodEnd,
            cancelAtPeriodEnd,
          });
        }

        const user = await this.usersService.findByStripeSubscriptionId(subscription.id);
        if (user) {
          await this.usersService.updateStripeBilling(user.id, {
            subscriptionStatus: status,
            currentPeriodEnd,
            currentPlanId: typeof planIdFromMetadata === 'string' ? planIdFromMetadata : undefined,
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = (() => {
          const anyInvoice = invoice as any;
          const direct = anyInvoice?.subscription;
          if (typeof direct === 'string') return direct;

          const fromDetails = anyInvoice?.subscription_details?.subscription;
          if (typeof fromDetails === 'string') return fromDetails;

          const fromParent = anyInvoice?.parent?.subscription_details?.subscription;
          if (typeof fromParent === 'string') return fromParent;

          return null;
        })();
        if (!subscriptionId) break;

        await this.subscriptionsService.updateByStripeSubscriptionId(subscriptionId, {
          status: 'past_due',
        });

        const user = await this.usersService.findByStripeSubscriptionId(subscriptionId);
        if (!user) break;

        await this.usersService.updateStripeBilling(user.id, {
          subscriptionStatus: 'past_due',
        });
        break;
      }

      default:
        break;
    }

    return { received: true };
  }
}
