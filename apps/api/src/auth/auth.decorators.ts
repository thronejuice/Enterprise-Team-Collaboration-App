import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';

/** Skip session authentication (login, health, LiveKit webhook). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restrict a controller or handler to the given global roles. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);
