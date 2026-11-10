import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
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
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken } = await this.authService.register(dto);
    this.setAuthCookie(res, accessToken);
    return { user }; // token lives ONLY in the httpOnly cookie
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

  /** Frontend calls this on load to know who is logged in (it can't read the cookie) */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  /* ---------- Cookie helpers ---------- */
  private baseCookieOptions(): CookieOptions {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    return {
      httpOnly: true, // JavaScript can't read it -> safe from XSS
      secure: isProd, // HTTPS only in production
      sameSite: 'lax', // blocks cross-site POSTs (CSRF) — works because of the Next.js proxy below
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