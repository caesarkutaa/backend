import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaystackService } from './paystack.service';
import { BankAccount, BankAccountSchema } from './schemas/bank-account.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: BankAccount.name, schema: BankAccountSchema }]),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaystackService],
  exports: [PaymentsService, PaystackService],
})
export class PaymentsModule {}