import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { AddToCartDto } from './add-to-cart.dto';
import { MAX_MERGE_ITEMS } from '../cart.constants';

/** Guest cart (from localStorage) sent right after login/register */
export class MergeCartDto {
  @IsArray()
  @ArrayMaxSize(MAX_MERGE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => AddToCartDto)
  items: AddToCartDto[];
}