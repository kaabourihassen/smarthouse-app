import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import type { RecordingMode } from '../schemas/recording.schema';

export class CreateRecordingDto {
  @IsString()
  cameraId: string;

  @IsIn(['detection', 'manual', 'scheduled'] satisfies RecordingMode[])
  mode: RecordingMode;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  roomLabel?: string;

  @IsDateString()
  startedAt: string;

  @IsNumber()
  @Min(1)
  @Max(24 * 60 * 60)
  durationSeconds: number;

  @IsNumber()
  @Min(0)
  sizeBytes: number;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;
}
