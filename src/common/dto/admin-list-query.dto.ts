import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';
import { ToBoolean } from '../utils/transformers';

/** For admin tables: ?page=1&limit=20&search=dior&isActive=false */
export class AdminListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}