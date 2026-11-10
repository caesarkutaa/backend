import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { Address, AddressSchema } from '../../common/schemas/address.schema';
import { Image, ImageSchema } from '../../common/schemas/image.schema';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProofStatus,
} from '../../common/enums/order.enum';

export type OrderDocument = HydratedDocument<Order>;

/* ---------- Order item (snapshot at time of purchase) ---------- */
@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Perfume', required: true })
  perfume: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  variantId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  brandName?: string;

  @Prop()
  image?: string;

  @Prop({ required: true })
  size: number; // ml

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  subtotal: number;
}
export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

/* ---------- Bank account the customer paid into (snapshot) ---------- */
@Schema({ _id: false })
export class BankAccountSnapshot {
  @Prop({ required: true })
  bankName: string;

  @Prop({ required: true })
  accountName: string;

  @Prop({ required: true })
  accountNumber: string;
}
export const BankAccountSnapshotSchema = SchemaFactory.createForClass(BankAccountSnapshot);

/* ---------- Bank transfer proof (screenshot) — full history ---------- */
@Schema()
export class PaymentProof {
  _id: Types.ObjectId;

  @Prop({ type: ImageSchema, required: true })
  image: Image;

  @Prop({ type: BankAccountSnapshotSchema, required: true })
  bankAccount: BankAccountSnapshot;

  @Prop({ required: true, trim: true })
  senderName: string;

  @Prop({ min: 0 })
  amountPaid?: number;

  @Prop({ trim: true })
  note?: string;

  @Prop({ type: String, enum: ProofStatus, default: ProofStatus.PENDING })
  status: ProofStatus;

  @Prop({ trim: true })
  rejectionReason?: string;

  @Prop({ default: Date.now })
  uploadedAt: Date;
}
export const PaymentProofSchema = SchemaFactory.createForClass(PaymentProof);

/* ---------- Timeline entry ---------- */
@Schema({ _id: false })
export class StatusHistory {
  @Prop({ required: true })
  status: string;

  @Prop()
  note?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  changedBy?: Types.ObjectId;

  @Prop({ default: Date.now })
  at: Date;
}
export const StatusHistorySchema = SchemaFactory.createForClass(StatusHistory);

/* ---------- Order ---------- */
const generateOrderNumber = () =>
  `PF-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .substring(2, 6)
    .toUpperCase()}`;

@Schema({ timestamps: true })
export class Order {
  @Prop({ required: true, unique: true, default: generateOrderNumber })
  orderNumber: string; // also the bank transfer narration

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({
    type: [OrderItemSchema],
    validate: {
      validator: (v: OrderItem[]) => Array.isArray(v) && v.length > 0,
      message: 'Order must contain at least one item',
    },
  })
  items: OrderItem[];

  @Prop({ type: AddressSchema, required: true })
  shippingAddress: Address;

  @Prop({ required: true, min: 0 })
  subtotal: number;

  @Prop({ default: 0, min: 0 })
  shippingFee: number;

  @Prop({ required: true, min: 0 })
  total: number; // Naira

  @Prop({ type: String, enum: PaymentMethod, default: PaymentMethod.BANK_TRANSFER })
  paymentMethod: PaymentMethod;

  @Prop({ type: String, enum: PaymentStatus, default: PaymentStatus.PENDING })
  paymentStatus: PaymentStatus;

  @Prop({ type: String, enum: OrderStatus, default: OrderStatus.PENDING })
  orderStatus: OrderStatus;

  /** Unpaid orders are auto-cancelled (and restocked) after this time */
  @Prop({ required: true })
  paymentDeadline: Date;

  /* ----- Paystack ----- */
  /** Every Paystack attempt gets a unique reference; all are kept so a late success still matches */
  @Prop({ type: [String], default: [], index: true })
  paymentReferences: string[];

  @Prop()
  paidReference?: string; // the reference that actually succeeded

  @Prop()
  paymentChannel?: string; // card, bank, ussd, bank_transfer...

  /* ----- Bank transfer ----- */
  @Prop({ type: [PaymentProofSchema], default: [] })
  paymentProofs: Types.DocumentArray<PaymentProof>;

  @Prop({ trim: true })
  paymentRejectionReason?: string;

  /* ----- Lifecycle ----- */
  @Prop()
  paidAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  paymentReviewedBy?: Types.ObjectId;

  @Prop()
  paymentReviewedAt?: Date;

  @Prop()
  shippedAt?: Date;

  @Prop()
  deliveredAt?: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop({ trim: true })
  cancelReason?: string;

  /** Guard so stock is never put back twice */
  @Prop({ default: false })
  stockRestored: boolean;

  @Prop({ type: [StatusHistorySchema], default: [] })
  statusHistory: StatusHistory[];

  @Prop({ trim: true })
  note?: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ user: 1, createdAt: -1 });
OrderSchema.index({ orderStatus: 1, paymentStatus: 1 });
OrderSchema.index({ paymentStatus: 1, paymentDeadline: 1 });