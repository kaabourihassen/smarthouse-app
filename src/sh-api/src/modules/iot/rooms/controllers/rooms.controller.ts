import { Body, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtSubscriptionGuard } from '../../../iam/auth/guards/jwt-subscription.guard';
import { CreateRoomDto } from '../dto/create-room.dto';
import { RoomsService } from '../services/rooms.service';

type AuthedRequest = Request & { user?: { id?: string; firstName?: string; lastName?: string } };

@UseGuards(JwtSubscriptionGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  private getUserId(req: AuthedRequest): string {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return userId;
  }

  @Get()
  async list(@Req() req: AuthedRequest) {
    const userId = this.getUserId(req);
    return this.roomsService.listForUser(userId);
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateRoomDto) {
    const userId = this.getUserId(req);
    const actorName = req.user?.firstName && req.user?.lastName ? `${req.user.firstName} ${req.user.lastName}` : undefined;
    const room = await this.roomsService.createForUser(userId, dto.name, actorName);
    return room;
  }
}
