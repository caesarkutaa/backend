import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { UsersService } from '../../users/users.service';
import { AUTH_COOKIE } from '../auth.constants';
import type { AuthUser, JwtPayload } from '../../common/interfaces/auth-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      // Cookie ONLY — no Authorization header, no token in localStorage
      jwtFromRequest: JwtStrategy.fromCookie,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  private static fromCookie(req: Request): string | null {
    return req?.cookies?.[AUTH_COOKIE] ?? null;
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.usersService.findActiveById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Session is no longer valid, please log in again');
    }

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role, // always read fresh from DB, not trusted from the token
    };
  }
}