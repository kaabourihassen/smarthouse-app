import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtSubscriptionGuard } from '../../../iam/auth/guards/jwt-subscription.guard';
import { CreateDeviceDto } from '../dto/create-device.dto';
import { UpdateDeviceDto } from '../dto/update-device.dto';
import { DevicesService } from '../services/devices.service';

type AuthedRequest = Request & { user?: { id?: string; firstName?: string; lastName?: string } };

@UseGuards(JwtSubscriptionGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  private getUserId(req: AuthedRequest): string {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return userId;
  }

  @Get()
  async list(@Req() req: AuthedRequest) {
    const userId = this.getUserId(req);
    return this.devicesService.listForUser(userId);
  }

  @Get(':id/timeline')
  async timeline(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    const userId = this.getUserId(req);
    const points = await this.devicesService.listTimelineForDevice(userId, id, Number(limit) || 60);
    return { points };
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateDeviceDto) {
    const userId = this.getUserId(req);
    const actorName = req.user?.firstName && req.user?.lastName ? `${req.user.firstName} ${req.user.lastName}` : undefined;
    return this.devicesService.createForUser(userId, dto, actorName);
  }

  @Patch(':id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateDeviceDto,
  ) {
    const userId = this.getUserId(req);
    const actorName = req.user?.firstName && req.user?.lastName ? `${req.user.firstName} ${req.user.lastName}` : undefined;

    const updated = await this.devicesService.updateForUser(userId, id, dto, actorName);
    if (!updated) throw new NotFoundException();
    return updated;
  }

  @Delete(':id')
  async delete(@Req() req: AuthedRequest, @Param('id') id: string) {
    const userId = this.getUserId(req);
    const actorName = req.user?.firstName && req.user?.lastName ? `${req.user.firstName} ${req.user.lastName}` : undefined;

    const deleted = await this.devicesService.deleteForUser(userId, id, actorName);
    if (!deleted) throw new NotFoundException();
    return { ok: true };
  }
}
