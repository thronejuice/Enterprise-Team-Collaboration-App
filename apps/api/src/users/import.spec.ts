import { headerIsValid, IMPORT_HEADER, parseImportCsv, validateImportRows } from './import.service';

const header = IMPORT_HEADER.join(',');
const existing = { emails: new Set(['taken@example.com']), employeeIds: new Set(['E-1']) };
const departments = { activeByLowerName: new Map([['engineering', 'dept-eng']]) };
const row = (overrides: Partial<Record<(typeof IMPORT_HEADER)[number], string>> = {}) => {
  const base: Record<string, string> = {
    email: 'new@example.com',
    display_name: 'New Person',
    role: 'member',
    employee_id: 'e-200',
    first_name: 'New',
    last_name: 'Person',
    job_title: 'Engineer',
    department: 'ENGINEERING',
    phone: '+66 81 000 0000',
  };
  return IMPORT_HEADER.map((c) => overrides[c] ?? base[c]);
};

describe('import CSV', () => {
  it('accepts a BOM from Excel and requires the exact header', () => {
    const rows = parseImportCsv(`﻿${header}\r\n${row().join(',')}\r\n`);
    expect(headerIsValid(rows[0])).toBe(true);
    expect(headerIsValid(['email', 'display_name'])).toBe(false);
    expect(headerIsValid(['display_name', 'email', ...IMPORT_HEADER.slice(2)])).toBe(false);
  });

  it('normalises a valid row (lower-case email, upper-case employee ID, department ID)', () => {
    const [result] = validateImportRows([row()], existing, departments);
    expect(result.errors).toEqual([]);
    expect(result.line).toBe(2);
    expect(result.normalized).toMatchObject({ email: 'new@example.com', role: 'MEMBER', employeeId: 'E-200', departmentId: 'dept-eng' });
  });

  it('reports every bad field of a row with its column', () => {
    const [result] = validateImportRows(
      [row({ email: 'nope', role: 'BOSS', employee_id: 'E-1', department: 'Sales', phone: 'abc' })],
      existing,
      departments,
    );
    expect(result.normalized).toBeNull();
    expect(result.errors.map((e) => e.column).sort()).toEqual(['department', 'email', 'employee_id', 'phone', 'role']);
  });

  it('rejects emails and employee IDs already in the database', () => {
    const [result] = validateImportRows([row({ email: 'taken@example.com' })], existing, departments);
    expect(result.errors[0]).toMatchObject({ column: 'email' });
  });

  it('flags duplicates inside the file on the later row only, case-insensitively', () => {
    const results = validateImportRows(
      [row({ email: 'dup@example.com', employee_id: 'X-1' }), row({ email: 'DUP@example.com', employee_id: 'x-1' })],
      existing,
      departments,
    );
    expect(results[0].errors).toEqual([]);
    expect(results[1].errors.map((e) => e.column).sort()).toEqual(['email', 'employee_id']);
  });

  it('requires a display name and an employee ID', () => {
    const [result] = validateImportRows([row({ display_name: '', employee_id: '' })], existing, departments);
    expect(result.errors.map((e) => e.column).sort()).toEqual(['display_name', 'employee_id']);
  });
});
