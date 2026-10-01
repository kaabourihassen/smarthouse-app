import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CameraDocument = HydratedDocument<Camera> & {
  createdAt: Date;
  updatedAt: Date;
};

export type CameraStatus = 'online' | 'offline';

@Schema({ timestamps: true })
export class Camera {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: false, trim: true })
  roomKey?: string;

  @Prop({ required: false, trim: true })
  roomLabel?: string;

  @Prop({ required: true, default: 'online' })
  status: CameraStatus;

  @Prop({ required: true, default: true })
  detectionEnabled: boolean;

  @Prop({ required: false, trim: true })
  streamUrl?: string;

  @Prop({ required: true, default: '1080p HD', trim: true })
  qualityLabel: string;

  @Prop({ required: true, default: 50 })
  storageTotalGb: number;
}

export const CameraSchema = SchemaFactory.createForClass(Camera);

CameraSchema.index({ userId: 1, createdAt: -1 });
