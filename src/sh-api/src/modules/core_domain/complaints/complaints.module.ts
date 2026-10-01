import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../iam/auth/auth.module';
import { Complaint, ComplaintSchema } from './schemas/complaint.schema';
import { ComplaintsService } from './services/complaints.service';
import { ComplaintsController } from './controllers/complaints.controller';
import { OpenAiModerationService } from './services/openai-moderation.service';

@Module({
  imports: [AuthModule, MongooseModule.forFeature([{ name: Complaint.name, schema: ComplaintSchema }])],
  controllers: [ComplaintsController],
  providers: [ComplaintsService, OpenAiModerationService],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}
