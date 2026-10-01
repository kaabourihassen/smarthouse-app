import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ScreenshotDocument = HydratedDocument<Screenshot> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class Screenshot {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  cameraId: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: false, trim: true })
  roomLabel?: string;

  @Prop({ required: true })
  capturedAt: Date;

  @Prop({ required: true })
  sizeBytes: number;

  @Prop({ required: true, trim: true })
  filePath: string;

  @Prop({ required: false })
  aiScore?: number;

  @Prop({ required: false, trim: true })
  aiClass?: string;

  @Prop({ required: false })
  isHuman?: boolean;

  @Prop({ required: false })
  imageBase64?: string;
}

export const ScreenshotSchema = SchemaFactory.createForClass(Screenshot);

ScreenshotSchema.index({ userId: 1, cameraId: 1, capturedAt: -1 });
