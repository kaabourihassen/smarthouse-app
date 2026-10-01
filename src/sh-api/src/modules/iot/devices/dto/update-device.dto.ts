import { IsBoolean, IsNumber, IsOptional, MaxLength, MinLength, IsString, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateDeviceDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  title?: string;

  @IsOptional()
  @IsBoolean()
  on?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return Number.isNaN(num) ? 0 : num;
    }
    return value;
  })
  consumptionKwh?: number;

  /** The UI edits the numeric part; server formats it into value string based on device type. */
  @IsOptional()
  @IsNumber()
  valueNumber?: number;
}
