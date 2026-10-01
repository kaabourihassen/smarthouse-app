import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DeviceDocument = HydratedDocument<Device> & {
  createdAt: Date;
  updatedAt: Date;
};

export type DeviceType =
  | 'lighting'
  | 'airConditioning'
  | 'heating'
  | 'fan'
  | 'temperatureHumidity'
  | 'gas'
  | 'flame';

export type DeviceIcon = 'wind' | 'bulb' | 'fan' | 'thermo' | 'flame';

@Schema({ timestamps: true })
export class Device {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  room: string;

  @Prop({ required: true })
  type: DeviceType;

  @Prop({ required: true })
  value: string;

  @Prop({ required: true, min: 0 })
  consumptionKwh: number;

  @Prop({ required: true })
  icon: DeviceIcon;

  @Prop({ required: true, default: true })
  on: boolean;

  @Prop({ required: true, default: false })
  muted: boolean;
}

export const DeviceSchema = SchemaFactory.createForClass(Device);

DeviceSchema.index({ userId: 1, createdAt: -1 });
