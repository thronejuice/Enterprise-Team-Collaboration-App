import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { randomUUID } from 'node:crypto';
import { isEmail } from 'class-validator';
import { UserRole } from '@prisma/client';
import { hashPassword } from '../auth/passwords';
import { AuditService } from '../audit/audit.service';
import { coded } from '../common/errors';
import { isUniqueViolation, PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { CSV_BOM, csvLine, FieldError, generateTemporaryPassword, NAME_MAX, normalizeEmployeeId, normalizePhone, optionalText, requiredText } from './profile';

export const IMPORT_HEADER = ['email', 'display_name', 'role', 'employee_id', 'first_name', 'last_name', 'job_title', 'department', 'phone'] as const;
export const IMPORT_MAX_ROWS = 500;
export const IMPORT_MAX_BYTES = 1024 * 1024;
const IMPORT_TTL_SECONDS = 15 * 60;
const HASH_CONCURRENCY = 8;

type Column = (typeof IMPORT_HEADER)[number];

export interface DepartmentLookup {
  /** Active departments keyed by lower-cased name. */
  activeByLowerName: Map<string, string>;
}

export interface ExistingUsers {
  emails: Set<string>;
  employeeIds: Set<string>;
}

export interface NormalizedRow {
  email: string;
  displayName: string;
  role: UserRole;
  employeeId: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  departmentId: string | null;
  phone: string | null;
}

export interface ValidatedRow {
  /** 1-based line number in the file (the header is line 1). */
  line: number;
  values: Record<Column, string>;
  errors: { column: Column; message: string }[];
  normalized: NormalizedRow | null;
}

export function parseImportCsv(text: string): string[][] {
  return parse(text, { bom: true, skip_empty_lines: true, relax_column_count: true }) as string[][];
}

export function headerIsValid(header: string[] | undefined): boolean {
  if (!header) return false;
  const cells = header.map((cell) => cell.trim().toLowerCase());
  return cells.length === IMPORT_HEADER.length && cells.every((cell, i) => cell === IMPORT_HEADER[i]);
}

/** Validates every data row. Duplicates inside the file: the later occurrence is the error. */
export function validateImportRows(dataRows: string[][], existing: ExistingUsers, departments: DepartmentLookup): ValidatedRow[] {
  const seenEmails = new Set<string>();
  const seenEmployeeIds = new Set<string>();

  return dataRows.map((raw, index) => {
    const values = Object.fromEntries(IMPORT_HEADER.map((column, i) => [column, (raw[i] ?? '').trim()])) as Record<Column, string>;
    const errors: ValidatedRow['errors'] = [];
    const fail = (column: Column, message: string) => errors.push({ column, message });
    const attempt = <T>(column: Column, fn: () => T, fallback: T): T => {
      try {
        return fn();
      } catch (error) {
        if (error instanceof FieldError) fail(column, error.message);
        else throw error;
        return fallback;
      }
    };

    if (raw.length !== IMPORT_HEADER.length) fail('email', `Expected ${IMPORT_HEADER.length} columns, found ${raw.length}`);

    const email = attempt('email', () => {
      const value = values.email.toLowerCase();
      if (!value || value.length > 254 || !isEmail(value)) throw new FieldError('email', 'Email is not valid');
      if (existing.emails.has(value)) throw new FieldError('email', 'Email is already used by another account');
      if (seenEmails.has(value)) throw new FieldError('email', 'Email appears more than once in this file');
      seenEmails.add(value);
      return value;
    }, '');

    const displayName = attempt('display_name', () => requiredText('Display name', values.display_name, 80), '');

    const role = attempt('role', () => {
      const upper = values.role.toUpperCase();
      if (upper !== 'ADMIN' && upper !== 'HOST' && upper !== 'MEMBER') throw new FieldError('role', 'Role must be ADMIN, HOST or MEMBER');
      return upper as UserRole;
    }, 'MEMBER' as UserRole);

    const employeeId = attempt('employee_id', () => {
      const value = normalizeEmployeeId(requiredText('Employee ID', values.employee_id, 32));
      if (existing.employeeIds.has(value)) throw new FieldError('employee_id', 'Employee ID is already used');
      if (seenEmployeeIds.has(value)) throw new FieldError('employee_id', 'Employee ID appears more than once in this file');
      seenEmployeeIds.add(value);
      return value;
    }, '');

    const firstName = attempt('first_name', () => optionalText('First name', values.first_name, NAME_MAX), null);
    const lastName = attempt('last_name', () => optionalText('Last name', values.last_name, NAME_MAX), null);
    const jobTitle = attempt('job_title', () => optionalText('Job title', values.job_title, NAME_MAX), null);
    const departmentId = attempt('department', () => {
      if (!values.department) return null;
      const id = departments.activeByLowerName.get(values.department.toLowerCase());
      if (!id) throw new FieldError('department', 'No active department has this name');
      return id;
    }, null);
    const phone = attempt('phone', () => normalizePhone(values.phone), null);

    const normalized: NormalizedRow | null =
      errors.length === 0 && email && displayName && employeeId
        ? { email, displayName, role, employeeId, firstName, lastName, jobTitle, departmentId, phone }
        : null;
    return { line: index + 2, values, errors, normalized };
  });
}

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  /** Parses and validates an uploaded file, stores the raw rows for 15 minutes, returns the per-row result. */
  async preview(text: string) {
    const rows = this.parseOrReject(text);
    const validated = await this.validate(rows);
    const importId = randomUUID();
    await this.redis.client.set(this.key(importId), JSON.stringify({ rows }), 'EX', IMPORT_TTL_SECONDS);
    return {
      importId,
      total: validated.length,
      validCount: validated.filter((r) => r.errors.length === 0).length,
      errorCount: validated.filter((r) => r.errors.length > 0).length,
      rows: validated.map((r) => ({ line: r.line, values: r.values, errors: r.errors })),
    };
  }

  /** All-or-nothing. Returns the CSV of temporary passwords; it is not stored anywhere on the server. */
  async commit(adminId: string, importId: string, ip: string): Promise<string> {
    const stored = await this.redis.client.get(this.key(importId));
    if (!stored) throw coded(HttpStatus.GONE, 'IMPORT_EXPIRED', 'This import has expired. Upload the file again.');
    const { rows } = JSON.parse(stored) as { rows: string[][] };

    // Validate again: the database may have changed since the preview.
    const validated = await this.validate(rows);
    const invalid = validated.filter((r) => r.errors.length > 0);
    if (invalid.length > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'The file has errors. Fix them and upload it again.',
          code: 'IMPORT_INVALID',
          errors: invalid.flatMap((r) => r.errors.map((e) => ({ line: r.line, column: e.column, message: e.message }))),
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const accounts = validated.map((r) => ({ id: randomUUID(), row: r.normalized!, password: generateTemporaryPassword() }));
    const hashes = await this.hashAll(accounts.map((a) => a.password));

    try {
      await this.prisma.$transaction(
        async (tx) => {
          await tx.user.createMany({
            data: accounts.map((a, i) => ({
              id: a.id,
              email: a.row.email,
              displayName: a.row.displayName,
              role: a.row.role,
              employeeId: a.row.employeeId,
              firstName: a.row.firstName,
              lastName: a.row.lastName,
              jobTitle: a.row.jobTitle,
              departmentId: a.row.departmentId,
              phone: a.row.phone,
              passwordHash: hashes[i],
              mustChangePassword: true,
            })),
          });
        },
        { timeout: 30_000 },
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw coded(HttpStatus.BAD_REQUEST, 'IMPORT_INVALID', 'The accounts changed while importing. Upload the file again.');
      }
      throw error;
    }

    await this.redis.client.del(this.key(importId));
    for (const account of accounts) {
      await this.audit.log({
        action: 'user.created',
        actorId: adminId,
        targetType: 'user',
        targetId: account.id,
        ip,
        metadata: { role: account.row.role, source: 'csv_import' },
      });
    }
    await this.audit.log({ action: 'users.imported', actorId: adminId, ip, metadata: { count: accounts.length } });

    const lines = [csvLine(['email', 'display_name', 'employee_id', 'temporary_password'])];
    for (const a of accounts) lines.push(csvLine([a.row.email, a.row.displayName, a.row.employeeId, a.password]));
    return CSV_BOM + lines.join('\r\n') + '\r\n';
  }

  template(): string {
    return CSV_BOM + csvLine([...IMPORT_HEADER]) + '\r\n';
  }

  private parseOrReject(text: string): string[][] {
    let rows: string[][];
    try {
      rows = parseImportCsv(text);
    } catch (error) {
      throw coded(HttpStatus.BAD_REQUEST, 'IMPORT_INVALID', `The file is not valid CSV: ${(error as Error).message}`);
    }
    if (!headerIsValid(rows[0])) {
      throw coded(HttpStatus.BAD_REQUEST, 'IMPORT_INVALID', `The header must be exactly: ${IMPORT_HEADER.join(', ')}`);
    }
    const dataRows = rows.slice(1);
    if (dataRows.length > IMPORT_MAX_ROWS) {
      throw coded(HttpStatus.BAD_REQUEST, 'IMPORT_INVALID', `A file can contain at most ${IMPORT_MAX_ROWS} rows.`);
    }
    return dataRows;
  }

  private async validate(dataRows: string[][]): Promise<ValidatedRow[]> {
    const emails = dataRows.map((r) => (r[0] ?? '').trim().toLowerCase()).filter(Boolean);
    const employeeIds = dataRows.map((r) => (r[3] ?? '').trim().toUpperCase()).filter(Boolean);
    const [users, departments] = await Promise.all([
      this.prisma.user.findMany({
        where: { OR: [{ email: { in: emails } }, { employeeId: { in: employeeIds } }] },
        select: { email: true, employeeId: true },
      }),
      this.prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    ]);
    return validateImportRows(
      dataRows,
      {
        emails: new Set(users.map((u) => u.email)),
        employeeIds: new Set(users.flatMap((u) => (u.employeeId ? [u.employeeId] : []))),
      },
      { activeByLowerName: new Map(departments.map((d) => [d.name.toLowerCase(), d.id])) },
    );
  }

  private async hashAll(passwords: string[]): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < passwords.length; i += HASH_CONCURRENCY) {
      out.push(...(await Promise.all(passwords.slice(i, i + HASH_CONCURRENCY).map((p) => hashPassword(p)))));
    }
    return out;
  }

  private key(importId: string): string {
    return `import:${importId}`;
  }
}
