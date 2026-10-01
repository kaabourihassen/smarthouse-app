import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { JwtSubscriptionGuard } from '../../../iam/auth/guards/jwt-subscription.guard';
import { NotificationsService } from '../services/notifications.service';

type AuthedRequest = Request & { user?: { id?: string } };

@UseGuards(JwtSubscriptionGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  private getUserId(req: AuthedRequest): string {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return userId;
  }

  @Get()
  async list(@Req() req: AuthedRequest) {
    const userId = this.getUserId(req);
    return this.notificationsService.listForUser(userId);
  }

  @Post('read-all')
  async markAllAsRead(@Req() req: AuthedRequest) {
    const userId = this.getUserId(req);
    return this.notificationsService.markAllAsRead(userId);
  }

  @Patch(':id/read')
  async markRead(@Req() req: AuthedRequest, @Param('id') id: string) {
    const userId = this.getUserId(req);
    const updated = await this.notificationsService.markRead(userId, id);
    if (!updated) throw new NotFoundException();
    return updated;
  }

  /** Dev-only helper to trigger a real-time notification (for testing websocket + toast). */
  @Post('dev/push')
  async devPush(@Req() req: AuthedRequest) {
    const isProd = this.configService.get('NODE_ENV') === 'production';
    if (isProd) throw new NotFoundException();

    const userId = this.getUserId(req);
    return this.notificationsService.createForUser(userId, {
      type: 'alerts',
      tone: 'warning',
      icon: 'bolt',
      title: 'Test notification',
      message: `Generated at ${new Date().toISOString()}`,
      urgent: false,
    });
  }
}
