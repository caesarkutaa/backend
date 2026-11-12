import { Role } from '../enums/role.enum';

/** What the JWT carries (iat/exp are added by the JWT library) */
export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

/** What gets attached to req.user after the JWT is validated */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}