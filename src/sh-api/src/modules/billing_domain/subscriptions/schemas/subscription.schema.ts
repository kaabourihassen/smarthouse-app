import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SubscriptionDocument = HydratedDocument<Subscription> & {
  createdAt: Date;
  updatedAt: Date;
};

export type SubscriptionMemberRole = 'spouse' | 'child' | 'parent' | 'guest';

@Schema({ _id: false })
export class SubscriptionMember {
  @Prop({ required: true, trim: true, maxlength: 100 })
  fullName: string;

  @Prop({ required: true, trim: true, lowercase: true, maxlength: 254 })
  email: string;

  @Prop({ required: true })
  role: SubscriptionMemberRole;

  @Prop({ required: true, default: true })
  isActive: boolean;

  @Prop({ required: true, default: Date.now })
  addedAt: Date;
}

export const SubscriptionMemberSchema = SchemaFactory.createForClass(SubscriptionMember);

@Schema({ timestamps: true })
export class Subscription {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  stripeSubscriptionId: string;

  @Prop({ required: false, index: true })
  stripeCustomerId?: string;

  @Prop({ required: false })
  status?: string;

  @Prop({ required: false })
  planId?: string;

  @Prop({ required: false })
  priceId?: string;

  @Prop({ required: false })
  priceUnitAmount?: number;

  @Prop({ required: false })
  priceCurrency?: string;

  @Prop({ required: false })
  priceInterval?: string;

  @Prop({ required: false })
  priceIntervalCount?: number;

  @Prop({ required: false })
  currentPeriodEnd?: Date;

  @Prop({ required: false })
  cancelAtPeriodEnd?: boolean;

  @Prop({ type: [SubscriptionMemberSchema], default: [] })
  members: SubscriptionMember[];
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
