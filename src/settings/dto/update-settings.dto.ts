import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class AnnouncementDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @trim() @IsString() @MaxLength(120) text?: string;
}

export class WhatsAppDto {
  @IsOptional() @IsBoolean() enabled?: boolean;

  /** Accepts "0803 123 4567", "+234 803...", "2348031234567" → stored as 2348031234567 */
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    let digits = value.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('0')) digits = `234${digits.slice(1)}`;
    return digits;
  })
  @ValidateIf((o) => o.number !== '')
  @Matches(/^\d{10,15}$/, { message: 'Enter a valid WhatsApp number with country code' })
  number?: string;

  @IsOptional() @trim() @IsString() @MaxLength(300) message?: string;
}

export class ContactDto {
  @IsOptional() @trim() @IsString() @MaxLength(30) phone?: string;

  @IsOptional()
  @trim()
  @ValidateIf((o) => o.email !== '')
  @IsEmail({}, { message: 'Enter a valid contact email' })
  email?: string;

  @IsOptional() @trim() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @trim() @IsString() @MaxLength(60) instagram?: string;
  @IsOptional() @trim() @IsString() @MaxLength(100) businessHours?: string;
}

export class StateFeeDto {
  @trim() @IsString() @MaxLength(40) state: string;
  @Type(() => Number) @IsNumber() @Min(0) fee: number;
}

export class DeliveryDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) defaultFee?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) freeShippingMin?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => StateFeeDto)
  stateFees?: StateFeeDto[];

  @IsOptional() @trim() @IsString() @MaxLength(60) estimatedDays?: string;
}

export class UpdateSettingsDto {
  @IsOptional() @ValidateNested() @Type(() => AnnouncementDto) announcement?: AnnouncementDto;
  @IsOptional() @ValidateNested() @Type(() => WhatsAppDto) whatsapp?: WhatsAppDto;
  @IsOptional() @ValidateNested() @Type(() => ContactDto) contact?: ContactDto;
  @IsOptional() @ValidateNested() @Type(() => DeliveryDto) delivery?: DeliveryDto;
}