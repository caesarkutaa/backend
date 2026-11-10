import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BrandsController } from './brands.controller';
import { BrandsService } from './brands.service';
import { Brand, BrandSchema } from './schemas/brand.schema';
import { Perfume, PerfumeSchema } from '../perfumes/schemas/perfume.schema';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Brand.name, schema: BrandSchema },
      { name: Perfume.name, schema: PerfumeSchema }, // to block deleting brands in use
    ]),
    CloudinaryModule,
  ],
  controllers: [BrandsController],
  providers: [BrandsService],
  exports: [BrandsService, MongooseModule],
})
export class BrandsModule {}