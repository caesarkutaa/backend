import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/utils/transformers';

export class CancelOrderDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  reason?: string;
}