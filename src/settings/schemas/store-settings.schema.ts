import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StoreSettingsDocument = HydratedDocument<StoreSettings>;

@Schema({ _id: false })
export class StateFee {
  @Prop({ required: true, trim: true })
  state: string;

  @Prop({ required: true, min: 0 })
  fee: number;
}
export const StateFeeSchema = SchemaFactory.createForClass(StateFee);

@Schema({ _id: false })
export class AnnouncementSettings {
  @Prop({ default: true })
  enabled: boolean;

  @Prop({ default: 'Free delivery on every order · 100% authentic', trim: true })
  text: string;
}
export const AnnouncementSettingsSchema = SchemaFactory.createForClass(AnnouncementSettings);

@Schema({ _id: false })
export class WhatsAppSettings {
  @Prop({ default: false })
  enabled: boolean;

  /** International format, digits only, e.g. 2348031234567 */
  @Prop({ trim: true })
  number?: string;

  @Prop({ default: 'Hello! I have a question about your perfumes.', trim: true })
  message: string;
}
export const WhatsAppSettingsSchema = SchemaFactory.createForClass(WhatsAppSettings);

@Schema({ _id: false })
export class ContactSettings {
  @Prop({ trim: true }) phone?: string;
  @Prop({ trim: true, lowercase: true }) email?: string;
  @Prop({ trim: true }) address?: string;
  @Prop({ trim: true }) instagram?: string;
  @Prop({ trim: true }) businessHours?: string;
}
export const ContactSettingsSchema = SchemaFactory.createForClass(ContactSettings);

@Schema({ _id: false })
export class DeliverySettings {
  /** Fee for any state without a custom fee */
  @Prop({ default: 0, min: 0 })
  defaultFee: number;

  /** 0 = off. Orders at or above this subtotal ship free */
  @Prop({ default: 0, min: 0 })
  freeShippingMin: number;

  @Prop({ type: [StateFeeSchema], default: [] })
  stateFees: StateFee[];

  @Prop({ default: '2–5 working days', trim: true })
  estimatedDays: string;
}
export const DeliverySettingsSchema = SchemaFactory.createForClass(DeliverySettings);

/** Single document (key = "main") holding store-wide settings */
@Schema({ timestamps: true, collection: 'store_settings' })
export class StoreSettings {
  @Prop({ required: true, unique: true, default: 'main' })
  key: string;

  @Prop({ type: AnnouncementSettingsSchema, default: () => ({}) })
  announcement: AnnouncementSettings;

  @Prop({ type: WhatsAppSettingsSchema, default: () => ({}) })
  whatsapp: WhatsAppSettings;

  @Prop({ type: ContactSettingsSchema, default: () => ({}) })
  contact: ContactSettings;

  @Prop({ type: DeliverySettingsSchema, default: () => ({}) })
  delivery: DeliverySettings;
}

export const StoreSettingsSchema = SchemaFactory.createForClass(StoreSettings);