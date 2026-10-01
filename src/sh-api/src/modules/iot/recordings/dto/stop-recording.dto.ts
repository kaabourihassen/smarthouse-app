import { IsString } from 'class-validator';

export class StopRecordingDto {
  @IsString()
  sessionId: string;
}
