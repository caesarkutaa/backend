import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MailService } from './mail.service';
import { OrderMailerService } from './order-mailer.service';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

/** Global: any module can inject MailService */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [MailService, OrderMailerService],
  exports: [MailService],
})
export class MailModule {}