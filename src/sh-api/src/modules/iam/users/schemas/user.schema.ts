import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '../../../core_domain/common/enums/role.enum';

export type UserDocument = HydratedDocument<User> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ type: String, enum: Role, default: Role.Resident })
  role: Role;

  @Prop({ type: Boolean, default: false })
  banned: boolean;

  // Stripe billing fields (optional)
  @Prop({ required: false })
  stripeCustomerId?: string;

  @Prop({ required: false, index: true })
  stripeSubscriptionId?: string;

  @Prop({ required: false })
  subscriptionStatus?: string;

  @Prop({ required: false })
  currentPlanId?: string;

  @Prop({ required: false })
  currentPeriodEnd?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
