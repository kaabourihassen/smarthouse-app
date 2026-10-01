import { IsBoolean, IsIn, IsNumber, MaxLength, MinLength, IsString, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import type { DeviceType } from '../schemas/device.schema';

export class CreateDeviceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  room: string;

  @IsString()
  @IsIn(['lighting', 'airConditioning', 'heating', 'fan'] satisfies ReadonlyArray<DeviceType>)
  type: DeviceType;

  @IsBoolean()
  on: boolean;

  @IsNumber()
  @Min(0)
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return Number.isNaN(num) ? 0 : num;
    }
    return value;
  })
  consumptionKwh: number;

  @IsNumber()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return Number.isNaN(num) ? 0 : num;
    }
    return value;
  })
  valueNumber: number;
}
