import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from '../../iam/users/users.module';
import { SubscriptionsModule } from '../../billing_domain/subscriptions/subscriptions.module';
import { StripeWebhooksController } from './controllers/stripe-webhooks.controller';

@Module({
  imports: [ConfigModule, UsersModule, SubscriptionsModule],
  controllers: [StripeWebhooksController],
})
export class WebhooksModule {}
