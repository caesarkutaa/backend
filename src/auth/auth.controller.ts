import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AUTH_COOKIE } from './auth.constants';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { user, accessToken } = await this.authService.register(dto);
    this.setAuthCookie(res, accessToken);
    return { user };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, accessToken } = await this.authService.login(dto);
    this.setAuthCookie(res, accessToken);
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE, this.baseCookieOptions());
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  /* ---------- Forgot / reset password ---------- */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  /** Lets the reset page show "link expired" before the user types a new password */
  @Get('reset-password/validate')
  validateResetToken(@Query('token') token: string) {
    return this.authService.validateResetToken(token);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.resetPassword(dto.token, dto.password);
    res.clearCookie(AUTH_COOKIE, this.baseCookieOptions()); // force a fresh login
    return result;
  }

  /* ---------- Cookie helpers ---------- */
  private baseCookieOptions(): CookieOptions {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
    };
  }

  private setAuthCookie(res: Response, token: string) {
    const days = Number(this.config.get('JWT_EXPIRES_DAYS') ?? 7);
    res.cookie(AUTH_COOKIE, token, {
      ...this.baseCookieOptions(),
      maxAge: days * 24 * 60 * 60 * 1000,
    });
  }
}