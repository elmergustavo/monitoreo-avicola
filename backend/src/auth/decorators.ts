import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthenticatedUser, UserRequest } from './auth.types.js';
import type { Permission } from './permissions.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const PERMISSIONS_KEY = 'permissions';
export const ALLOW_PENDING_PASSWORD_KEY = 'allowPendingPassword';

/** Skips user authentication (health check, login, ESP32 endpoints). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Requires every listed permission. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Allows the route while the user still has to change a temporary password. */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);

/** Injects the authenticated user. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser =>
    context.switchToHttp().getRequest<UserRequest>().user,
);
