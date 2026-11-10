import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AddressDto } from '../../common/dto/address.dto';
import { PaymentMethod } from '../../common/enums/order.enum';
import { Trim } from '../../common/utils/transformers';

export class CheckoutDto {
  @IsOptional()
  @IsEnum(PaymentMethod, { message: 'Payment method must be paystack or bank_transfer' })
  paymentMethod?: PaymentMethod;

  /** Omit to use the address saved on the customer's profile */
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  shippingAddress?: AddressDto;

  @IsOptional()
  @IsBoolean()
  saveAddress?: boolean;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}