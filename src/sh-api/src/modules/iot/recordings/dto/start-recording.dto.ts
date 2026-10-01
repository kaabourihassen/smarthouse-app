import { IsIn, IsOptional, IsString, IsUrl } from 'class-validator';
import type { RecordingMode } from '../schemas/recording.schema';

export class StartRecordingDto {
  @IsString()
  cameraId: string;

  @IsIn(['detection', 'manual', 'scheduled'] satisfies RecordingMode[])
  mode: RecordingMode;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  roomLabel?: string;

  // Optional override. If omitted, the camera's configured streamUrl is used.
  @IsOptional()
  @IsUrl({ require_tld: false })
  streamUrl?: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  durationSeconds?: number;
}
