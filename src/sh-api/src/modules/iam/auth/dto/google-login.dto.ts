import { IsString, MinLength } from 'class-validator';

/** Google Identity Services returns a JWT ID token in `credential`. */
export class GoogleLoginDto {
  @IsString()
  @MinLength(20)
  credential: string;
}
