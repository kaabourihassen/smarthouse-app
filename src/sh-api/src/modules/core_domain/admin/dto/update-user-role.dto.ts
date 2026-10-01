import { IsEnum } from 'class-validator';
import { Role } from '../../../core_domain/common/enums/role.enum';

export class UpdateUserRoleDto {
  @IsEnum(Role)
  role: Role;
}
