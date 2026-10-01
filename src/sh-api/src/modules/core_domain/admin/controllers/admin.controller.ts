import { BadRequestException, Controller, Delete, Get, NotFoundException, Param, Patch, Body, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../iam/auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../../iam/auth/guards/admin.guard';
import { UsersService } from '../../../iam/users/services/users.service';
import { DevicesService } from '../../../iot/devices/services/devices.service';
import { SubscriptionsService } from '../../../billing_domain/subscriptions/services/subscriptions.service';
import { ComplaintsService } from '../../../core_domain/complaints/services/complaints.service';
import { SessionsService } from '../../../iam/auth/services/sessions.service';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UpdateComplaintStatusDto } from '../dto/update-complaint-status.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly usersService: UsersService,
    private readonly devicesService: DevicesService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly complaintsService: ComplaintsService,
    private readonly sessionsService: SessionsService,
  ) {}

  @Get('users')
  async listUsers() {
    const users = await this.usersService.listAllSafeUsers();
    return { users };
  }

  @Patch('users/:id')
  async updateUser(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    if (dto.role === undefined && dto.banned === undefined) {
      throw new BadRequestException('No updates provided');
    }

    if (String(req.user.id) === String(id)) {
      if (dto.role !== undefined) {
        throw new BadRequestException('Cannot change your own role');
      }
      if (dto.banned !== undefined) {
        throw new BadRequestException('Cannot ban/unban your own account');
      }
    }

    let user: any = null;
    if (dto.role !== undefined) {
      user = await this.usersService.updateRole(id, dto.role);
    }
    if (dto.banned !== undefined) {
      // If banning: revoke sessions so the user gets logged out immediately.
      if (dto.banned) {
        try {
          await this.sessionsService.revokeAllForUser(id);
        } catch {
          // Ignore session cleanup errors.
        }
      }
      user = await this.usersService.setBanned(id, dto.banned);
    }

    return { user };
  }

  @Delete('users/:id')
  async deleteUser(@Req() req: any, @Param('id') id: string) {
    if (String(req.user.id) === String(id)) {
      throw new BadRequestException('Cannot delete your own account');
    }

    // Best-effort cleanup (non-blocking if a downstream cleanup fails).
    try {
      await this.sessionsService.revokeAllForUser(id);
    } catch {
      // Ignore session cleanup errors.
    }
    try {
      await this.devicesService.deleteAllForUser(id);
    } catch {
      // Ignore device cleanup errors.
    }
    try {
      await this.subscriptionsService.deleteAllForUser(id);
    } catch {
      // Ignore subscription cleanup errors.
    }
    try {
      await this.complaintsService.deleteAllForUser(id);
    } catch {
      // Ignore complaint cleanup errors.
    }

    await this.usersService.deleteById(id);
    return { ok: true };
  }

  @Get('complaints')
  async listComplaints() {
    const complaints = await this.complaintsService.listAll();
    const userIds = Array.from(new Set(complaints.map((c) => c.userId).filter(Boolean)));
    const users = await Promise.all(userIds.map((id) => this.usersService.findById(id)));
    const emailByUserId = new Map<string, string>();
    users.forEach((u) => {
      if (!u) return;
      emailByUserId.set(String(u.id), u.email);
    });

    return {
      complaints: complaints.map((c) => ({
        ...c,
        userEmail: emailByUserId.get(c.userId),
      })),
    };
  }

  @Patch('complaints/:id')
  async updateComplaintStatus(@Param('id') id: string, @Body() dto: UpdateComplaintStatusDto) {
    const complaint = await this.complaintsService.updateStatus(id, dto.status);
    return { complaint };
  }

  @Get('readings/:userId')
  async readingsByUser(@Param('userId') userId: string) {
    const userDoc = await this.usersService.findById(userId);
    if (!userDoc) throw new NotFoundException('User not found');

    const user = this.usersService.toSafeUser(userDoc);
    const devices = await this.devicesService.listForUser(userId, { seedDefaults: false });
    return { user, devices };
  }

  @Get('readings/:userId/devices/:deviceId/timeline')
  async deviceTimeline(
    @Param('userId') userId: string,
    @Param('deviceId') deviceId: string,
    @Query('limit') limit?: string,
  ) {
    const userDoc = await this.usersService.findById(userId);
    if (!userDoc) throw new NotFoundException('User not found');

    const points = await this.devicesService.listTimelineForDevice(userId, deviceId, Number(limit) || 50);
    return { points };
  }

  @Get('subscriptions')
  async listSubscriptions() {
    const subs = await this.subscriptionsService.listLatestPerUser();
    const userIds = Array.from(
      new Set(
        subs
          .map((s) => String((s as any).userId ?? ''))
          .filter(Boolean),
      ),
    );

    const users = await Promise.all(userIds.map((id) => this.usersService.findById(id)));
    const userById = new Map<string, any>();
    users.forEach((u) => {
      if (!u) return;
      userById.set(String(u.id), this.usersService.toSafeUser(u));
    });

    return {
      subscriptions: subs.map((s) => {
        const rawUserId = String((s as any).userId ?? '');
        const membersLen = Array.isArray((s as any).members) ? (s as any).members.length : 0;
        const members = Array.isArray((s as any).members)
          ? (s as any).members.map((m: any) => ({
              fullName: String(m?.fullName ?? ''),
              email: String(m?.email ?? ''),
              role: String(m?.role ?? ''),
              isActive: Boolean(m?.isActive ?? true),
              addedAt: new Date(m?.addedAt ?? Date.now()).toISOString(),
            }))
          : [];

        return {
          id: String((s as any)._id ?? (s as any).id),
          userId: rawUserId,
          user: userById.get(rawUserId),
          status: (s as any).status,
          planId: (s as any).planId,
          priceId: (s as any).priceId,
          currentPeriodEnd: (s as any).currentPeriodEnd,
          cancelAtPeriodEnd: (s as any).cancelAtPeriodEnd,
          // Include the subscription owner as a member of the "house".
          membersCount: 1 + membersLen,
          members,
          createdAt: (s as any).createdAt,
        };
      }),
    };
  }
}
