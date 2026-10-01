import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ComplaintDocument = HydratedDocument<Complaint> & {
  createdAt: Date;
  updatedAt: Date;
};

export type ComplaintStatus = 'open' | 'resolved';

@Schema({ timestamps: true })
export class Complaint {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, trim: true, maxlength: 120 })
  title: string;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  message: string;

  @Prop({ required: true, default: 'open' })
  status: ComplaintStatus;
}

export const ComplaintSchema = SchemaFactory.createForClass(Complaint);
ComplaintSchema.index({ status: 1, createdAt: -1 });
