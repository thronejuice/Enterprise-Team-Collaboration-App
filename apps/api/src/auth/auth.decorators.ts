import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';
export const ALLOW_MUST_CHANGE = 'allowMustChange';

/** Skip session authentication (login, health, LiveKit webhook). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restrict a controller or handler to the given global roles. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);

/**
 * Endpoints a user may still call before finishing onboarding: changing the password (403 PASSWORD_CHANGE_REQUIRED)
 * or accepting the privacy notice (403 PRIVACY_NOTICE_REQUIRED). Everything else is refused until both are done.
 */
export const AllowMustChangePassword = () => SetMetadata(ALLOW_MUST_CHANGE, true);
