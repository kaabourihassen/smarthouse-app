import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../iam/auth/auth.module';
import { HistoryModule } from '../../core_domain/history/history.module';
import { NotificationsModule } from '../../core_domain/notifications/notifications.module';
import { DevicesController } from './controllers/devices.controller';
import { Device, DeviceSchema } from './schemas/device.schema';
import { DeviceReading, DeviceReadingSchema } from './schemas/device-reading.schema';
import { DevicesService } from './services/devices.service';
import { MqttIngestService } from './iot/mqtt/mqtt-ingest.service';

import { makeCounterProvider } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    AuthModule,
    HistoryModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Device.name, schema: DeviceSchema },
      { name: DeviceReading.name, schema: DeviceReadingSchema },
    ]),
  ],
  controllers: [DevicesController],
  providers: [
    DevicesService, 
    MqttIngestService,
    makeCounterProvider({
      name: 'smarthouse_devices_created_total',
      help: 'Total number of devices created',
    }),
    makeCounterProvider({
      name: 'smarthouse_devices_deleted_total',
      help: 'Total number of devices deleted',
    }),
    makeCounterProvider({
      name: 'smarthouse_device_actions_total',
      help: 'Total number of device actions performed',
      labelNames: ['action', 'type'],
    }),
  ],
  exports: [DevicesService],
})
export class DevicesModule {}
