import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification> & {
  createdAt: Date;
  updatedAt: Date;
};

export type NotificationType = 'security' | 'alerts' | 'system' | 'other';
export type NotificationTone = 'success' | 'warning' | 'info' | 'danger';
export type NotificationIcon =
  | 'info'
  | 'drop'
  | 'check'
  | 'alert'
  | 'bolt'
  | 'camera'
  | 'thermo'
  | 'shield'
  | 'tip';

@Schema({ timestamps: true })
export class Notification {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  type: NotificationType;

  @Prop({ required: true })
  tone: NotificationTone;

  @Prop({ required: true })
  icon: NotificationIcon;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  message: string;

  @Prop({ required: true, default: false })
  urgent: boolean;

  @Prop({ required: false, default: null })
  readAt?: Date | null;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
