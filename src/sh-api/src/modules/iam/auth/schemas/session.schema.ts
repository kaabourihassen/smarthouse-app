import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SessionDocument = HydratedDocument<Session> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class Session {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  revokedAt?: Date;

  @Prop()
  userAgent?: string;

  @Prop()
  ip?: string;
}

export const SessionSchema = SchemaFactory.createForClass(Session);

// Automatically delete expired sessions.
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
