import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { Image, ImageSchema } from '../../common/schemas/image.schema';
import {
  Concentration,
  Gender,
  Longevity,
  Sillage,
} from '../../common/enums/perfume.enum';

export type PerfumeDocument = HydratedDocument<Perfume>;

/* ---------- Fragrance notes (pyramid) ---------- */
@Schema({ _id: false })
export class FragranceNotes {
  @Prop({ type: [String], default: [] })
  top: string[];

  @Prop({ type: [String], default: [] })
  middle: string[];

  @Prop({ type: [String], default: [] })
  base: string[];
}
export const FragranceNotesSchema = SchemaFactory.createForClass(FragranceNotes);

/* ---------- Size / price variant ---------- */
// Keeps its own _id so cart & order items can point at an exact variant
@Schema()
export class Variant {
  _id: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  size: number; // in ml, e.g. 50, 100

  @Prop({ required: true, min: 0 })
  price: number; // in Naira

  @Prop({ min: 0 })
  compareAtPrice?: number; // old price, for showing discounts

  @Prop({ required: true, min: 0, default: 0 })
  stock: number;

  @Prop({ trim: true, uppercase: true })
  sku?: string;
}
export const VariantSchema = SchemaFactory.createForClass(Variant);

/* ---------- Perfume ---------- */
@Schema({
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Perfume {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string; // used in the QR link: FRONTEND_URL/perfumes/:slug

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Brand', required: true })
  brand: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Category', required: true })
  category: Types.ObjectId;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ trim: true, maxlength: 200 })
  shortDescription?: string;

  @Prop({ type: String, enum: Gender, default: Gender.UNISEX })
  gender: Gender;

  @Prop({ type: String, enum: Concentration, default: Concentration.EDP })
  concentration: Concentration;

  @Prop({ trim: true })
  fragranceFamily?: string; // e.g. "Amber Woody"

  @Prop({ type: FragranceNotesSchema, default: () => ({}) })
  notes: FragranceNotes;

  @Prop({ type: String, enum: Longevity })
  longevity?: Longevity;

  @Prop({ type: String, enum: Sillage })
  sillage?: Sillage;

  @Prop({
    type: [VariantSchema],
    validate: {
      validator: (v: Variant[]) => Array.isArray(v) && v.length > 0,
      message: 'A perfume must have at least one size/price variant',
    },
  })
  variants: Types.DocumentArray<Variant>;

  @Prop({ type: [ImageSchema], default: [] })
  images: Image[];

  @Prop({ type: ImageSchema })
  qrCode?: Image; // generated automatically on create

  @Prop({ default: false })
  isFeatured: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0, min: 0 })
  totalSold: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const PerfumeSchema = SchemaFactory.createForClass(Perfume);

/* ---------- Indexes ---------- */
PerfumeSchema.index({ name: 'text', description: 'text', fragranceFamily: 'text' });
PerfumeSchema.index({ brand: 1, category: 1, gender: 1, isActive: 1 });
PerfumeSchema.index({ isFeatured: 1, isActive: 1 });

/* ---------- Virtuals ---------- */
PerfumeSchema.virtual('minPrice').get(function (this: Perfume) {
  if (!this.variants?.length) return 0;
  return Math.min(...this.variants.map((v) => v.price));
});

PerfumeSchema.virtual('totalStock').get(function (this: Perfume) {
  if (!this.variants?.length) return 0;
  return this.variants.reduce((sum, v) => sum + v.stock, 0);
});

PerfumeSchema.virtual('inStock').get(function (this: Perfume) {
  return this.variants?.some((v) => v.stock > 0) ?? false;
});