import { PartialType } from '@nestjs/mapped-types';
import { CreateBankAccountDto } from './create-bank-account.dto';

/** All fields optional — send only what you want to change */
export class UpdateBankAccountDto extends PartialType(CreateBankAccountDto) {}