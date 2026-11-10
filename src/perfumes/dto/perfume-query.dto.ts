import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Concentration, Gender } from '../../common/enums/perfume.enum';
import { ToBoolean } from '../../common/utils/transformers';

export enum PerfumeSort {
  NEWEST = 'newest',
  FEATURED = 'featured',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  NAME_ASC = 'name_asc',
  BEST_SELLING = 'best_selling',
}

/**
 * Public gallery query, e.g.
 * /perfumes?brand=dior,chanel&category=woody&gender=men&minPrice=20000&maxPrice=80000&sort=price_asc
 */
export class PerfumeQueryDto extends PaginationQueryDto {
  /** Comma-separated brand slugs */
  @IsOptional()
  @IsString()
  brand?: string;

  /** Comma-separated category slugs */
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsEnum(Concentration)
  concentration?: Concentration;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  inStock?: boolean;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsEnum(PerfumeSort)
  sort: PerfumeSort = PerfumeSort.NEWEST;
}