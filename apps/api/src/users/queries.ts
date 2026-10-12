import type { Prisma } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export const SORTS: Record<string, Prisma.UserOrderByWithRelationInput> = {
  name: { displayName: 'asc' },
  '-name': { displayName: 'desc' },
  lastLogin: { lastLoginAt: 'asc' },
  '-lastLogin': { lastLoginAt: 'desc' },
  createdAt: { createdAt: 'asc' },
  '-createdAt': { createdAt: 'desc' },
};

export const STATUSES = ['ACTIVE', 'LEAVING', 'SUSPENDED', 'ANONYMIZED'] as const;
export type StatusFilter = (typeof STATUSES)[number];

/**
 * Query parameters are validated like request bodies: a repeated key (?q=a&q=b), a non-UUID id or an
 * unknown enum value answers 400 instead of reaching the database and failing with 500.
 */
export class PageQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;
}

/** Shared by the admin users table and the CSV export, so both show the same people. */
export class UserListQuery extends PageQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsIn(STATUSES)
  status?: StatusFilter;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsIn(Object.keys(SORTS))
  sort?: string;
}

export class DirectoryQuery extends PageQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;
}
