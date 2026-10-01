import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CaptureScreenshotDto {
  @IsString()
  cameraId: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  roomLabel?: string;

  // Optional override. If omitted, the camera's configured streamUrl is used.
  @IsOptional()
  @IsUrl({ require_tld: false })
  streamUrl?: string;
}
