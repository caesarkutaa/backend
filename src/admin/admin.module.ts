import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { Perfume, PerfumeSchema } from '../perfumes/schemas/perfume.schema';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Perfume.name, schema: PerfumeSchema },
    ]),
    OrdersModule, // for OrdersService.getAdminStats()
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}