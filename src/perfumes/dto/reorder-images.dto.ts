import { ArrayMinSize, IsArray, IsString } from 'class-validator';

/** The first publicId becomes the main/cover image */
export class ReorderImagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  publicIds: string[];
}