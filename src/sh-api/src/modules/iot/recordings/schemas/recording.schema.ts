import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RecordingDocument = HydratedDocument<Recording> & {
  createdAt: Date;
  updatedAt: Date;
};

export type RecordingMode = 'detection' | 'manual' | 'scheduled';

@Schema({ timestamps: true })
export class Recording {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  cameraId: string;

  @Prop({ required: true })
  mode: RecordingMode;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: false, trim: true })
  roomLabel?: string;

  @Prop({ required: true })
  startedAt: Date;

  @Prop({ required: true })
  durationSeconds: number;

  @Prop({ required: true })
  sizeBytes: number;

  @Prop({ required: false, trim: true })
  filePath?: string;

  @Prop({ required: false, trim: true })
  thumbnailUrl?: string;
}

export const RecordingSchema = SchemaFactory.createForClass(Recording);

RecordingSchema.index({ userId: 1, startedAt: -1 });
