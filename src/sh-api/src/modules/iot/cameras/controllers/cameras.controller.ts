import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { JwtSubscriptionGuard } from '../../../iam/auth/guards/jwt-subscription.guard';
import { CreateCameraDto } from '../dto/create-camera.dto';
import { UpdateCameraDto } from '../dto/update-camera.dto';
import { CamerasService } from '../services/cameras.service';
import { MjpegRelayService } from '../services/mjpeg-relay.service';

type AuthedRequest = Request & { user?: { id?: string } };

@Controller('cameras')
export class CamerasController {
  constructor(
    private readonly camerasService: CamerasService,
    private readonly relayService: MjpegRelayService,
  ) {}

  private getUserId(req: AuthedRequest): string {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return userId;
  }

  @UseGuards(JwtSubscriptionGuard)
  @Get()
  async list(@Req() req: AuthedRequest) {
    const userId = this.getUserId(req);
    return this.camerasService.listForUser(userId);
  }

  @UseGuards(JwtSubscriptionGuard)
  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateCameraDto) {
    const userId = this.getUserId(req);
    return this.camerasService.createForUser(userId, dto);
  }

  @UseGuards(JwtSubscriptionGuard)
  @Patch(':id')
  async update(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: UpdateCameraDto) {
    const userId = this.getUserId(req);
    const updated = await this.camerasService.updateForUser(userId, id, dto);
    if (!updated) throw new NotFoundException();
    return updated;
  }

  @Get(':id/stream')
  async stream(@Req() req: AuthedRequest, @Param('id') id: string, @Res() res: Response) {
    const userId = req.user?.id;

    let camera = userId ? await this.camerasService.getForUser(userId, id) : null;
    if (!camera && id && id !== 'default') {
      camera = await this.camerasService.getForUser('6a9f28113309e2383a6fea5f', id);
    }

    const streamUrl =
      (camera?.streamUrl ?? '').trim() ||
      (process.env.ESP32_STREAM_URL ?? '').trim();

    const aliases = [id, camera?.name, 'default', streamUrl].filter(Boolean) as string[];

    this.relayService.attach(id, res, {
      aliases,
      upstreamUrl: streamUrl || undefined,
    });
  }
}
