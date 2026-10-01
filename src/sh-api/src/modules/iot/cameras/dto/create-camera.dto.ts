import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import type { CameraStatus } from '../schemas/camera.schema';

export class CreateCameraDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  roomKey?: string;

  @IsOptional()
  @IsString()
  roomLabel?: string;

  @IsOptional()
  @IsIn(['online', 'offline'] satisfies CameraStatus[])
  status?: CameraStatus;

  @IsOptional()
  @IsBoolean()
  detectionEnabled?: boolean;

  @IsOptional()
  @IsString()
  streamUrl?: string;

  @IsOptional()
  @IsString()
  qualityLabel?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5000)
  storageTotalGb?: number;
}
