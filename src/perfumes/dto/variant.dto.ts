import {
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class VariantDto {
  /** Send the existing _id when updating, so carts pointing at this variant keep working */
  @IsOptional()
  @IsMongoId()
  _id?: string;

  @IsNumber()
  @Min(1)
  size: number; // ml

  @IsNumber()
  @Min(0)
  price: number; // Naira

  @IsOptional()
  @IsNumber()
  @Min(0)
  compareAtPrice?: number;

  @IsInt()
  @Min(0)
  stock: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  sku?: string;
}