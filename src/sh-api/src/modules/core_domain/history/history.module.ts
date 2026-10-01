import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../iam/auth/auth.module';
import { HistoryController } from './controllers/history.controller';
import { HistoryService } from './services/history.service';
import { HistoryEvent, HistoryEventSchema } from './schemas/history-event.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: HistoryEvent.name, schema: HistoryEventSchema }]),
  ],
  controllers: [HistoryController],
  providers: [HistoryService],
  exports: [HistoryService],
})
export class HistoryModule {}
