import { Controller, Get, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtSubscriptionGuard } from '../../../iam/auth/guards/jwt-subscription.guard';
import { HistoryService } from '../services/history.service';

type AuthedRequest = Request & { user?: { id?: string } };

@UseGuards(JwtSubscriptionGuard)
@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  private getUserId(req: AuthedRequest): string {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return userId;
  }

  @Get()
  async list(@Req() req: AuthedRequest) {
    const userId = this.getUserId(req);
    return this.historyService.listForUser(userId);
  }
}
