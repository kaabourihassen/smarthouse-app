import { IsIn, IsString } from 'class-validator';

export const PLAN_IDS = ['basic', 'premium-plus', 'extended-pro'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export class CreateCheckoutSessionDto {
  @IsString()
  @IsIn(PLAN_IDS)
  planId: PlanId;
}
