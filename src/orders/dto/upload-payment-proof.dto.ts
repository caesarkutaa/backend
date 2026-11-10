import { Type } from 'class-transformer';
import {
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../common/utils/transformers';

/** Sent as form-data together with the "proof" image file */
export class UploadPaymentProofDto {
  @IsMongoId({ message: 'Please select the account you paid into' })
  bankAccountId: string;

  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Enter the name on the account you paid from' })
  @MaxLength(100)
  senderName: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountPaid?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}