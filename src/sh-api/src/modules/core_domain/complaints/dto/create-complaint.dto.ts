import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateComplaintDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  message: string;
}
