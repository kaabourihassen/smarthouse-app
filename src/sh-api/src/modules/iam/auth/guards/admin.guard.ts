import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '../../../core_domain/common/enums/role.enum';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req?.user as { role?: string } | undefined;

    if (!user || user.role !== Role.Admin) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
