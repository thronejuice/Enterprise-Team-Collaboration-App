import type { Prisma } from '@prisma/client';
import { avatarVersionOf } from './profile';

export const departmentSelect = { select: { id: true, name: true, isActive: true } } as const;

/** A user with the department relation loaded. */
export type UserWithDepartment = Prisma.UserGetPayload<{ include: { department: typeof departmentSelect } }>;

export const userInclude = { department: departmentSelect } as const;

export function departmentView(department: UserWithDepartment['department']) {
  return department ? { id: department.id, name: department.name, isActive: department.isActive } : null;
}

/**
 * Directory / public profile. Deliberately has no phone, employee ID, role or suspension fields:
 * the API itself must not send them to other users (the UI hiding them is not enough).
 */
export function directoryView(user: UserWithDepartment) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    firstName: user.firstName,
    lastName: user.lastName,
    jobTitle: user.jobTitle,
    department: departmentView(user.department),
    avatarVersion: avatarVersionOf(user.avatarUpdatedAt),
  };
}

/** Full profile of the signed-in user (and of an admin viewing it). */
export function profileView(user: UserWithDepartment) {
  return {
    ...directoryView(user),
    phone: user.phone,
    employeeId: user.employeeId,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    anonymizedAt: user.anonymizedAt,
  };
}
