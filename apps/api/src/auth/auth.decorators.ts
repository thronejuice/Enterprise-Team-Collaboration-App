import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';
export const ALLOW_MUST_CHANGE = 'allowMustChange';

/** Skip session authentication (login, health, LiveKit webhook). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restrict a controller or handler to the given global roles. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);

/** Endpoints a user with mustChangePassword may still call (everything else answers 403 PASSWORD_CHANGE_REQUIRED). */
export const AllowMustChangePassword = () => SetMetadata(ALLOW_MUST_CHANGE, true);
