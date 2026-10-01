import { IsEmail, MaxLength } from 'class-validator';

export class AddSubscriptionMemberDto {
  @IsEmail()
  @MaxLength(254)
  email: string;
}
