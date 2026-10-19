import type { Request } from 'express';
import type { Permission } from './permissions.js';

export interface AccessTokenPayload {
  /** User id */
  sub: string;
  /** Session id */
  sid: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  sessionId: string;
  mustChangePassword: boolean;
  role: { id: string; key: string; name: string };
  permissions: Permission[];
}

export interface UserRequest extends Request {
  user: AuthenticatedUser;
}
