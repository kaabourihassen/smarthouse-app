import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../iam/auth/auth.module';
import { CamerasController } from './controllers/cameras.controller';
import { IotCamerasController } from './controllers/iot-cameras.controller';
import { ScreenshotsController } from './controllers/screenshots.controller';
import { RelayController } from './controllers/relay.controller';
import { Camera, CameraSchema } from './schemas/camera.schema';
import { Screenshot, ScreenshotSchema } from './schemas/screenshot.schema';
import { CamerasService } from './services/cameras.service';
import { MjpegRelayService } from './services/mjpeg-relay.service';
import { ScreenshotsService } from './services/screenshots.service';
import { CameraStreamGateway } from './gateways/camera-stream.gateway';
import { RecordingsModule } from '../../iot/recordings/recordings.module';
import { ComputerVisionService } from './services/computer-vision.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Camera.name, schema: CameraSchema },
      { name: Screenshot.name, schema: ScreenshotSchema },
    ]),
    forwardRef(() => RecordingsModule),
  ],
  controllers: [CamerasController, ScreenshotsController, IotCamerasController, RelayController],
  providers: [CamerasService, ScreenshotsService, MjpegRelayService, CameraStreamGateway, ComputerVisionService],
  exports: [CamerasService, MjpegRelayService, ScreenshotsService],
})
export class CamerasModule {}
