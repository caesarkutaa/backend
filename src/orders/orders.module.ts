import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdersController } from './orders.controller';
import { PaystackWebhookController } from './paystack-webhook.controller';
import { OrdersService } from './orders.service';
import { Order, OrderSchema } from './schemas/order.schema';
import { Perfume, PerfumeSchema } from '../perfumes/schemas/perfume.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { CartModule } from '../cart/cart.module';
import { PaymentsModule } from '../payments/payments.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Perfume.name, schema: PerfumeSchema },
      { name: User.name, schema: UserSchema },
    ]),
    CartModule,
    PaymentsModule,
    CloudinaryModule,
  ],
  controllers: [OrdersController, PaystackWebhookController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}