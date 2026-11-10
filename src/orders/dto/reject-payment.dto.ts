import { IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from '../../common/utils/transformers';

export class RejectPaymentDto {
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string; // shown to the customer, e.g. "Amount received was ₦50,000, not ₦95,000"
}