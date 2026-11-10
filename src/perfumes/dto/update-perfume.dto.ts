import { PartialType } from '@nestjs/mapped-types';
import { CreatePerfumeDto } from './create-perfume.dto';

/** Images are managed through their own endpoints; slug is locked after creation */
export class UpdatePerfumeDto extends PartialType(CreatePerfumeDto) {}