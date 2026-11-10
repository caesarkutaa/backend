import { Role } from '../enums/role.enum';

/** What the JWT carries */
export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

/** What gets attached to req.user after the JWT is validated */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}