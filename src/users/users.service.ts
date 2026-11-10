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
import * as argon2 from 'argon2';
import { User, UserDocument } from './schemas/user.schema';
import { Role } from '../common/enums/role.enum';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly config: ConfigService,
  ) {}

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
      role: Role.CUSTOMER, // public registration can never create admins
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