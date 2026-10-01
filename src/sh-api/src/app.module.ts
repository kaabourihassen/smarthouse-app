import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { join } from 'path';
import { AuthModule } from './modules/iam/auth/auth.module';
import { UsersModule } from './modules/iam/users/users.module';
import { RoomsModule } from './modules/iot/rooms/rooms.module';
import { NotificationsModule } from './modules/core_domain/notifications/notifications.module';
import { DevicesModule } from './modules/iot/devices/devices.module';
import { HistoryModule } from './modules/core_domain/history/history.module';
import { WebhooksModule } from './modules/billing_domain/webhooks/webhooks.module';
import { BillingModule } from './modules/billing_domain/billing/billing.module';
import { SubscriptionsModule } from './modules/billing_domain/subscriptions/subscriptions.module';
import { CamerasModule } from './modules/iot/cameras/cameras.module';
import { RecordingsModule } from './modules/iot/recordings/recordings.module';
import { ComplaintsModule } from './modules/core_domain/complaints/complaints.module';
import { AdminModule } from './modules/core_domain/admin/admin.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), '.env'), join(__dirname, '..', '.env')],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: (() => {
          const uri = configService.get<string>('MONGODB_URI');
          if (!uri) {
            throw new Error('MONGODB_URI is not set.');
          }
          return uri;
        })(),
      }),
    }),
    UsersModule,
    AuthModule,
    RoomsModule,
    NotificationsModule,
    HistoryModule,
    DevicesModule,
    CamerasModule,
    RecordingsModule,
    WebhooksModule,
    BillingModule,
    SubscriptionsModule,
    ComplaintsModule,
    AdminModule,
    MetricsModule,
  ],
})
export class AppModule { }
