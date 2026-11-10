import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { MAX_QUANTITY_PER_ITEM } from '../cart.constants';

export class AddToCartDto {
  @IsMongoId({ message: 'Invalid perfume' })
  perfumeId: string;

  @IsMongoId({ message: 'Please select a size' })
  variantId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY_PER_ITEM)
  quantity?: number;
}