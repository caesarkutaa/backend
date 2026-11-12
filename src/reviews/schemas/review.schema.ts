import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ReviewDocument = HydratedDocument<Review>;

@Schema({ _id: false })
export class AdminReply {
  @Prop({ required: true, trim: true })
  text: string;

  @Prop({ default: Date.now })
  at: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  by?: Types.ObjectId;
}
export const AdminReplySchema = SchemaFactory.createForClass(AdminReply);

@Schema({ timestamps: true })
export class Review {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Perfume', required: true })
  perfume: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  /** The delivered order that proves the purchase */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Order', required: true })
  order: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ trim: true, maxlength: 100 })
  title?: string;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  comment: string;

  /** Hidden by admin — not shown and not counted in the average */
  @Prop({ default: false })
  isHidden: boolean;

  @Prop({ trim: true })
  hiddenReason?: string;

  @Prop({ type: AdminReplySchema })
  adminReply?: AdminReply;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

ReviewSchema.index({ user: 1, perfume: 1 }, { unique: true }); // one review per perfume per customer
ReviewSchema.index({ perfume: 1, isHidden: 1, createdAt: -1 });
ReviewSchema.index({ isHidden: 1, createdAt: -1 });