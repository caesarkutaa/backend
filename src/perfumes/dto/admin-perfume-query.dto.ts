import { IsBoolean, IsMongoId, IsOptional } from 'class-validator';
import { AdminListQueryDto } from '../../common/dto/admin-list-query.dto';
import { ToBoolean } from '../../common/utils/transformers';

export class AdminPerfumeQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsMongoId()
  brand?: string;

  @IsOptional()
  @IsMongoId()
  category?: string;

  /** Show perfumes that have any variant at or below the low-stock threshold */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  lowStock?: boolean;
}