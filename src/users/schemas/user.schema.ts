import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { Role } from '../../common/enums/role.enum';
import { Address, AddressSchema } from '../../common/schemas/address.schema';

export type UserDocument = HydratedDocument<User>;

@Schema({
  timestamps: true,
  toJSON: {
    transform: (_doc, ret: Record<string, any>) => {
      delete ret.password;
      delete ret.passwordResetTokenHash;
      delete ret.passwordResetExpires;
      delete ret.__v;
      return ret;
    },
  },
})
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  password: string; // argon2 hash

  @Prop({ type: String, enum: Role, default: Role.CUSTOMER })
  role: Role;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ type: AddressSchema })
  address?: Address;

  /** false = blocked */
  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  blockedAt?: Date;

  @Prop({ trim: true })
  blockedReason?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  blockedBy?: Types.ObjectId;

  /* ---------- Password reset ---------- */
  /** SHA-256 of the emailed token — the raw token is never stored */
  @Prop({ select: false, index: true })
  passwordResetTokenHash?: string;

  @Prop({ select: false })
  passwordResetExpires?: Date;

  /** Used for a short cooldown between reset emails */
  @Prop()
  passwordResetRequestedAt?: Date;

  /** Any login token issued before this time is rejected */
  @Prop()
  passwordChangedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ role: 1, isActive: 1, createdAt: -1 });