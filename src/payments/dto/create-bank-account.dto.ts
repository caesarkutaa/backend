import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ToBoolean, Trim } from '../../common/utils/transformers';

export class CreateBankAccountDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Bank name is required' })
  @MaxLength(80)
  bankName: string;

  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Account name is required' })
  @MaxLength(100)
  accountName: string;

  @Trim()
  @Matches(/^\d{10}$/, { message: 'Account number must be exactly 10 digits' })
  accountNumber: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}