import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { DeviceType } from './device.schema';

export type DeviceReadingDocument = HydratedDocument<DeviceReading> & {
  createdAt: Date;
  updatedAt: Date;
};

// Stores point-in-time snapshots of a device's state/value for timelines.
@Schema({ timestamps: true })
export class DeviceReading {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  deviceId: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  room: string;

  @Prop({ required: true })
  type: DeviceType;

  // Human-friendly value shown in the UI (e.g., "75%" or "Temp: 23.4°C | Hum: 45.6%")
  @Prop({ required: true })
  value: string;

  @Prop({ required: true })
  on: boolean;

  // Optional numeric fields for temperature/humidity sensors.
  @Prop({ required: false })
  temperatureC?: number;

  @Prop({ required: false })
  humidityPct?: number;

  // Optional numeric fields for gas sensors.
  @Prop({ required: false })
  gasValue?: number;

  @Prop({ required: false })
  gasDetected?: boolean;

  @Prop({ required: false, trim: true })
  gasLevel?: string;

  // Optional boolean for flame sensors.
  @Prop({ required: false })
  flameDetected?: boolean;
}

export const DeviceReadingSchema = SchemaFactory.createForClass(DeviceReading);

DeviceReadingSchema.index({ userId: 1, deviceId: 1, createdAt: -1 });
