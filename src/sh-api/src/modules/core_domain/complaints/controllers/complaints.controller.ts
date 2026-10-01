import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtSubscriptionGuard } from '../../../iam/auth/guards/jwt-subscription.guard';
import { CreateComplaintDto } from '../dto/create-complaint.dto';
import { ComplaintsService } from '../services/complaints.service';

@Controller('complaints')
@UseGuards(JwtSubscriptionGuard)
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Post()
  async create(@Req() req: any, @Body() dto: CreateComplaintDto) {
    const complaint = await this.complaintsService.createForUser(String(req.user.id), {
      title: dto.title,
      message: dto.message,
    });
    return { complaint };
  }

  @Get('me')
  async listMine(@Req() req: any) {
    const complaints = await this.complaintsService.listForUser(String(req.user.id));
    return { complaints };
  }
}
