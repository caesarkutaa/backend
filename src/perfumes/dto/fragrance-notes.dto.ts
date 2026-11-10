import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString } from 'class-validator';

const cleanList = () =>
  Transform(({ value }) =>
    Array.isArray(value)
      ? value
          .map((item) => (typeof item === 'string' ? item.trim() : item))
          .filter(Boolean)
      : value,
  );

export class FragranceNotesDto {
  @IsOptional()
  @cleanList()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  top?: string[];

  @IsOptional()
  @cleanList()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  middle?: string[];

  @IsOptional()
  @cleanList()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  base?: string[];
}