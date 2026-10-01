import { IsIn } from 'class-validator';

export class UpdateComplaintStatusDto {
  @IsIn(['open', 'resolved'])
  status: 'open' | 'resolved';
}
