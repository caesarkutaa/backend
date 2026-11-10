import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { MAX_QUANTITY_PER_ITEM } from '../cart.constants';

export class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1 (use DELETE to remove the item)' })
  @Max(MAX_QUANTITY_PER_ITEM)
  quantity: number;
}