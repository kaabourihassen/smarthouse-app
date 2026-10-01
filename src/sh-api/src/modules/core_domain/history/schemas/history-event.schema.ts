import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HistoryEventDocument = HydratedDocument<HistoryEvent> & {
  createdAt: Date;
  updatedAt: Date;
};

export type HistoryCategory =
  | 'devices'
  | 'security'
  | 'energy'
  | 'automation'
  | 'system'
  | 'users';

export type HistoryIcon = 'bulb' | 'lock' | 'bolt' | 'robot' | 'gear' | 'user' | 'clock';

@Schema({ timestamps: true })
export class HistoryEvent {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  category: HistoryCategory;

  @Prop({ required: true })
  icon: HistoryIcon;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  subtitle: string;

  @Prop({ required: false, trim: true })
  actorName?: string;

  @Prop({ required: false, trim: true })
  locationLabel?: string;

  @Prop({ required: false, trim: true })
  detail?: string;
}

export const HistoryEventSchema = SchemaFactory.createForClass(HistoryEvent);

HistoryEventSchema.index({ userId: 1, createdAt: -1 });
