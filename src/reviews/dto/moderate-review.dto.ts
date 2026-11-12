import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/utils/transformers';

export class ModerateReviewDto {
  @IsBoolean()
  isHidden: boolean;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  reason?: string;
}