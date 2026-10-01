import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from '../../iam/users/users.module';
import { SubscriptionsModule } from '../../billing_domain/subscriptions/subscriptions.module';
import { BillingController } from './controllers/billing.controller';
import { BillingService } from './services/billing.service';

@Module({
  imports: [ConfigModule, UsersModule, SubscriptionsModule],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
