import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BankAccountDocument = HydratedDocument<BankAccount>;

@Schema({ timestamps: true })
export class BankAccount {
  @Prop({ required: true, trim: true })
  bankName: string; // e.g. GTBank, Access Bank, Opay

  @Prop({ required: true, trim: true })
  accountName: string; // e.g. Perfume Store Ltd

  @Prop({ required: true, trim: true })
  accountNumber: string; // 10-digit NUBAN

  @Prop({ trim: true })
  note?: string; // e.g. "Preferred for transfers above ₦100k"

  @Prop({ default: true })
  isActive: boolean; // inactive accounts are hidden from customers
}

export const BankAccountSchema = SchemaFactory.createForClass(BankAccount);

// The same account can't be added twice
BankAccountSchema.index({ bankName: 1, accountNumber: 1 }, { unique: true });