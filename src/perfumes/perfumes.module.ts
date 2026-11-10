import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PerfumesController } from './perfumes.controller';
import { PerfumesService } from './perfumes.service';
import { Perfume, PerfumeSchema } from './schemas/perfume.schema';
import { Brand, BrandSchema } from '../brands/schemas/brand.schema';
import { Category, CategorySchema } from '../categories/schemas/category.schema';
import { Cart, CartSchema } from '../cart/schemas/cart.schema';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { QrCodeModule } from '../qr-code/qr-code.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Perfume.name, schema: PerfumeSchema },
      { name: Brand.name, schema: BrandSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Cart.name, schema: CartSchema }, // to clean carts on delete
    ]),
    CloudinaryModule,
    QrCodeModule,
  ],
  controllers: [PerfumesController],
  providers: [PerfumesService],
  exports: [PerfumesService, MongooseModule],
})
export class PerfumesModule {}