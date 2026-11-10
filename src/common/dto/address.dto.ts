import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  fullName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  street: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  city: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  state: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  country?: string;
}