import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../iam/auth/auth.module';
import { HistoryModule } from '../../core_domain/history/history.module';
import { RoomsController } from './controllers/rooms.controller';
import { Room, RoomSchema } from './schemas/room.schema';
import { RoomsService } from './services/rooms.service';

@Module({
  imports: [AuthModule, HistoryModule, MongooseModule.forFeature([{ name: Room.name, schema: RoomSchema }])],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
