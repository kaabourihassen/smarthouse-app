import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CaptureScreenshotClientDto {
  @IsString()
  cameraId: string;

  @IsString()
  imageBase64: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  roomLabel?: string;
}
