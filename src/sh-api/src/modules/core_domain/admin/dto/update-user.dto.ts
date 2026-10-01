import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Role } from '../../../core_domain/common/enums/role.enum';

export class UpdateUserDto {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsBoolean()
  banned?: boolean;
}
