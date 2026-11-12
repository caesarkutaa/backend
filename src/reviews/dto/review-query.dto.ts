import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ReviewQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['newest', 'highest', 'lowest'])
  sort?: 'newest' | 'highest' | 'lowest';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}