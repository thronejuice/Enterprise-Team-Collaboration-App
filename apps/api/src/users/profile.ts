import { BadRequestException } from '@nestjs/common';
import { randomInt } from 'node:crypto';

export const NAME_MAX = 100;
export const DISPLAY_NAME_MAX = 80;
export const PHONE_MAX = 20;
export const EMPLOYEE_ID_MAX = 32;
export const DIRECTORY_PAGE_SIZE = 24;
export const USERS_PAGE_SIZE = 25;
export const TEMP_PASSWORD_LENGTH = 14;

const PHONE_PATTERN = /^[0-9+\- ]+$/;
const EMPLOYEE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
/** No 0, O, 1, l or I so temporary passwords can be read off a printout. */
const TEMP_PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class FieldError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

/** Trims; returns null for empty. Throws FieldError when longer than max. */
export function optionalText(field: string, raw: string | null | undefined, max: number): string | null {
  if (raw === null || raw === undefined) return null;
  const value = raw.trim();
  if (value.length === 0) return null;
  if (value.length > max) throw new FieldError(field, `${field} must be at most ${max} characters`);
  return value;
}

export function requiredText(field: string, raw: string | null | undefined, max: number): string {
  const value = optionalText(field, raw, max);
  if (value === null) throw new FieldError(field, `${field} is required`);
  return value;
}

export function normalizePhone(raw: string | null | undefined): string | null {
  const value = optionalText('phone', raw, PHONE_MAX);
  if (value !== null && !PHONE_PATTERN.test(value)) {
    throw new FieldError('phone', 'Phone may only contain digits, spaces, "+" and "-"');
  }
  return value;
}

/** Employee IDs are stored upper-case and are unique. */
export function normalizeEmployeeId(raw: string): string {
  const value = raw.trim();
  if (value.length === 0 || value.length > EMPLOYEE_ID_MAX || !EMPLOYEE_ID_PATTERN.test(value)) {
    throw new FieldError('employeeId', 'Employee ID must be 1–32 characters: A-Z, a-z, 0-9, "-" or "_"');
  }
  return value.toUpperCase();
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Throws a 400 for the first field error so the web form can point at the field. */
export function asBadRequest<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof FieldError) throw new BadRequestException({ statusCode: 400, message: error.message, field: error.field });
    throw error;
  }
}

/** 23:59 Asia/Bangkok (UTC+7, no DST) on the given calendar day, or "now". Must be today or later. */
export function effectiveAtFor(input: 'now' | string, now: Date): Date {
  if (input === 'now') return now;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) throw new BadRequestException('effective must be "now" or a YYYY-MM-DD date');
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) {
    throw new BadRequestException('effective is not a valid date');
  }
  if (input < bangkokDate(now)) throw new BadRequestException('The last working day cannot be in the past');
  return new Date(`${input}T23:59:00+07:00`);
}

/** YYYY-MM-DD of the instant in Asia/Bangkok. */
export function bangkokDate(instant: Date): string {
  return new Date(instant.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

export type AccountStatus = 'ACTIVE' | 'LEAVING' | 'SUSPENDED' | 'ANONYMIZED';

export function accountStatus(user: { isActive: boolean; anonymizedAt: Date | null }, hasScheduledSuspension: boolean): AccountStatus {
  if (user.anonymizedAt) return 'ANONYMIZED';
  if (!user.isActive) return 'SUSPENDED';
  return hasScheduledSuspension ? 'LEAVING' : 'ACTIVE';
}

export const avatarVersionOf = (avatarUpdatedAt: Date | null): number | null => (avatarUpdatedAt ? avatarUpdatedAt.getTime() : null);

/** Temporary password: 14 characters, no look-alikes. Uses a CSPRNG. */
export function generateTemporaryPassword(): string {
  let out = '';
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) out += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
  return out;
}

/** CSV cell: formula-injection guard for = + - @ tab CR, then RFC 4180 quoting. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const csvLine = (cells: unknown[]) => cells.map(csvCell).join(',');
export const CSV_BOM = '﻿';
