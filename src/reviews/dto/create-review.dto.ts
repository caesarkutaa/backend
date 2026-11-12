import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Trim } from '../../common/utils/transformers';

export class CreateReviewDto {
  @IsMongoId({ message: 'Invalid perfume' })
  perfumeId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Choose a rating from 1 to 5 stars' })
  @Max(5, { message: 'Choose a rating from 1 to 5 stars' })
  rating: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  title?: string;

  @Trim()
  @IsString()
  @MinLength(10, { message: 'Please write at least 10 characters' })
  @MaxLength(2000)
  comment: string;
}