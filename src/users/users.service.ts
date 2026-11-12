import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { createHash, randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { User, UserDocument } from './schemas/user.schema';
import { Role } from '../common/enums/role.enum';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

const RESET_COOLDOWN_MS = 60_000;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);
  readonly resetTokenTtlMinutes: number;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly config: ConfigService,
  ) {
    this.resetTokenTtlMinutes = Number(config.get('RESET_TOKEN_TTL_MINUTES') ?? 30);
  }

  /* ---------- Admin seed (runs on app start) ---------- */
  async onModuleInit() {
    await this.seedAdmin();
  }

  private async seedAdmin() {
    const email = this.config.get<string>('ADMIN_EMAIL')?.trim().toLowerCase();
    const password = this.config.get<string>('ADMIN_PASSWORD');

    if (!email || !password) {
      this.logger.warn('ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin seed');
      return;
    }

    const exists = await this.userModel.exists({ email });
    if (exists) return;

    await this.userModel.create({
      name: this.config.get<string>('ADMIN_NAME', 'Store Admin'),
      email,
      password: await this.hashPassword(password),
      role: Role.ADMIN,
    });
    this.logger.log(`Admin account created: ${email}`);
  }

  /* ---------- Password helpers ---------- */
  hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  verifyPassword(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }

  /* ---------- Auth support ---------- */
  async create(data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }): Promise<UserDocument> {
    const email = data.email.trim().toLowerCase();
    const exists = await this.userModel.exists({ email });
    if (exists) {
      throw new ConflictException('An account with this email already exists');
    }

    return this.userModel.create({
      ...data,
      email,
      password: await this.hashPassword(data.password),
      role: Role.CUSTOMER,
    });
  }

  findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.trim().toLowerCase() })
      .select('+password')
      .exec();
  }

  /** Used by the JWT strategy — blocked users return null and are logged out */
  async findActiveById(id: string): Promise<UserDocument | null> {
    if (!isValidObjectId(id)) return null;
    return this.userModel.findOne({ _id: id, isActive: true }).exec();
  }

  /* ---------- Forgot / reset password ---------- */

  /**
   * Creates a one-time reset token. Returns null (silently) if the email is unknown,
   * the account is blocked, or a link was sent less than a minute ago.
   */
  async createPasswordResetToken(email: string): Promise<{ user: UserDocument; token: string } | null> {
    const user = await this.userModel.findOne({ email: email.trim().toLowerCase(), isActive: true }).exec();
    if (!user) return null;

    if (
      user.passwordResetRequestedAt &&
      Date.now() - user.passwordResetRequestedAt.getTime() < RESET_COOLDOWN_MS
    ) {
      return null;
    }

    const token = randomBytes(32).toString('hex'); // 64 hex chars
    user.passwordResetTokenHash = hashToken(token);
    user.passwordResetExpires = new Date(Date.now() + this.resetTokenTtlMinutes * 60_000);
    user.passwordResetRequestedAt = new Date();
    await user.save();

    return { user, token };
  }

  findByResetToken(token: string): Promise<UserDocument | null> {
    if (!/^[a-f0-9]{64}$/i.test(token ?? '')) return Promise.resolve(null);
    return this.userModel
      .findOne({
        passwordResetTokenHash: hashToken(token),
        passwordResetExpires: { $gt: new Date() },
        isActive: true,
      })
      .select('+passwordResetTokenHash +passwordResetExpires')
      .exec();
  }

  async resetPassword(token: string, newPassword: string): Promise<UserDocument> {
    const user = await this.findByResetToken(token);
    if (!user) {
      throw new BadRequestException('This reset link is invalid or has expired. Please request a new one.');
    }

    user.password = await this.hashPassword(newPassword);
    user.passwordResetTokenHash = undefined; // one-time use
    user.passwordResetExpires = undefined;
    user.passwordChangedAt = new Date(Date.now() - 1000); // sign out every existing session
    await user.save();

    return user;
  }

  /* ---------- Profile ---------- */
  async findById(id: string): Promise<UserDocument> {
    if (!isValidObjectId(id)) throw new NotFoundException('User not found');
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserDocument> {
    const updates = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    );

    const user = await this.userModel
      .findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.userModel.findById(id).select('+password').exec();
    if (!user) throw new NotFoundException('User not found');

    const valid = await this.verifyPassword(user.password, dto.currentPassword);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from the current one');
    }

    user.password = await this.hashPassword(dto.newPassword);
    await user.save();
  }
}