import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../iam/auth/auth.module';
import { CamerasModule } from '../../iot/cameras/cameras.module';
import { RecordingsController } from './controllers/recordings.controller';
import { Recording, RecordingSchema } from './schemas/recording.schema';
import { RecordingsService } from './services/recordings.service';
import { RecordingJobsService } from './services/recording-jobs.service';

@Module({
  imports: [AuthModule, MongooseModule.forFeature([{ name: Recording.name, schema: RecordingSchema }]), forwardRef(() => CamerasModule)],
  controllers: [RecordingsController],
  providers: [RecordingsService, RecordingJobsService],
  exports: [RecordingsService, RecordingJobsService],
})
export class RecordingsModule {}
