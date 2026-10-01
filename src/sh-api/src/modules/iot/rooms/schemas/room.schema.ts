import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RoomDocument = HydratedDocument<Room> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class Room {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  key: string;

  @Prop({ required: true, trim: true })
  label: string;
}

export const RoomSchema = SchemaFactory.createForClass(Room);

// Unique per user.
RoomSchema.index({ userId: 1, key: 1 }, { unique: true });
