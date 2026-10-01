import { Body, Controller, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../iam/auth/guards/jwt-auth.guard';
import { BillingService } from '../services/billing.service';
import { CreateCheckoutSessionDto } from '../dto/create-checkout-session.dto';
import { SyncCheckoutSessionDto } from '../dto/sync-checkout-session.dto';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @UseGuards(JwtAuthGuard)
  @Post('checkout-session')
  async createCheckoutSession(@Req() req: Request, @Body() dto: CreateCheckoutSessionDto) {
    const userId = (req.user as { id?: string } | undefined)?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }

    return this.billingService.createSubscriptionCheckoutSession(userId, dto.planId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sync-checkout-session')
  async syncCheckoutSession(@Req() req: Request, @Body() dto: SyncCheckoutSessionDto) {
    const userId = (req.user as { id?: string } | undefined)?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }

    return this.billingService.syncCheckoutSession(userId, dto.sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('cancel-subscription')
  async cancelSubscription(@Req() req: Request) {
    const userId = (req.user as { id?: string } | undefined)?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }

    return this.billingService.cancelSubscription(userId);
  }
}
