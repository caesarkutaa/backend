import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  Concentration,
  Gender,
  Longevity,
  Sillage,
} from '../../common/enums/perfume.enum';
import { ParseJson, ToBoolean, Trim } from '../../common/utils/transformers';
import { VariantDto } from './variant.dto';
import { FragranceNotesDto } from './fragrance-notes.dto';

export class CreatePerfumeDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsMongoId({ message: 'Please select a valid brand' })
  brand: string;

  @IsMongoId({ message: 'Please select a valid category' })
  category: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  shortDescription?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsEnum(Concentration)
  concentration?: Concentration;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(60)
  fragranceFamily?: string;

  @IsOptional()
  @ParseJson(FragranceNotesDto)
  @ValidateNested()
  notes?: FragranceNotesDto;

  @IsOptional()
  @IsEnum(Longevity)
  longevity?: Longevity;

  @IsOptional()
  @IsEnum(Sillage)
  sillage?: Sillage;

  @ParseJson(VariantDto)
  @IsArray({ message: 'variants must be a JSON array' })
  @ArrayMinSize(1, { message: 'Add at least one size/price variant' })
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  variants: VariantDto[];

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}