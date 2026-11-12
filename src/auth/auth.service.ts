import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';
import { MailService } from '../mail/mail.service';
import { passwordChangedEmail, passwordResetEmail } from '../mail/templates';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from '../common/interfaces/auth-user.interface';

const FORGOT_MESSAGE =
  'If an account exists for that email, we’ve sent a link to reset your password. Check your inbox and spam folder.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly frontendUrl: string;
  private readonly isProduction: boolean;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:3000').replace(/\/+$/, '');
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
  }

  async register(dto: RegisterDto) {
    const user = await this.usersService.create(dto);
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    if (!user) throw new UnauthorizedException('Invalid email or password');

    const valid = await this.usersService.verifyPassword(user.password, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid email or password');

    if (!user.isActive) {
      throw new ForbiddenException('Your account has been deactivated. Contact support.');
    }

    return this.buildAuthResponse(user);
  }

  /* ---------- Forgot / reset password (customers AND admins) ---------- */

  /** Always returns the same message so nobody can discover which emails are registered */
  async forgotPassword(email: string) {
    const result = await this.usersService.createPasswordResetToken(email);

    if (result) {
      const url = `${this.frontendUrl}/reset-password?token=${result.token}`;
      const sent = await this.mail.send({
        to: result.user.email,
        ...passwordResetEmail(this.mail.appName, result.user.name, url, this.usersService.resetTokenTtlMinutes),
      });

      // Dev convenience: lets you test without a working email setup
      if (!sent && !this.isProduction) {
        this.logger.warn(`[dev] Password reset link for ${result.user.email}: ${url}`);
      }
    }

    return { message: FORGOT_MESSAGE };
  }

  async validateResetToken(token: string) {
    const user = await this.usersService.findByResetToken(token);
    return { valid: !!user };
  }

  async resetPassword(token: string, password: string) {
    const user = await this.usersService.resetPassword(token, password);

    void this.mail.send({
      to: user.email,
      ...passwordChangedEmail(
        this.mail.appName,
        user.name,
        `${this.frontendUrl}/login`,
        `${this.frontendUrl}/forgot-password`,
      ),
    });

    return { message: 'Your password has been reset. You can now log in with your new password.' };
  }

  private async buildAuthResponse(user: UserDocument) {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      user: user.toJSON(),
      accessToken,
    };
  }
}