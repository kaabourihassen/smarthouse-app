import { Module } from '@nestjs/common';
import { AdminController } from './controllers/admin.controller';
import { UsersModule } from '../../iam/users/users.module';
import { DevicesModule } from '../../iot/devices/devices.module';
import { SubscriptionsModule } from '../../billing_domain/subscriptions/subscriptions.module';
import { ComplaintsModule } from '../../core_domain/complaints/complaints.module';
import { AuthModule } from '../../iam/auth/auth.module';

@Module({
  imports: [UsersModule, DevicesModule, SubscriptionsModule, ComplaintsModule, AuthModule],
  controllers: [AdminController],
})
export class AdminModule {}
