import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DirectoryQuery, UserListQuery } from './queries';

const errorsFor = <T extends object>(cls: new () => T, plain: Record<string, unknown>) =>
  validateSync(plainToInstance(cls, plain), { whitelist: true, forbidNonWhitelisted: true }).map((e) => e.property);

describe('query validation (answers 400, never reaches the database)', () => {
  it('accepts a normal admin list query and converts page to a number', () => {
    const q = plainToInstance(UserListQuery, { q: 'hana', role: 'HOST', status: 'LEAVING', sort: '-lastLogin', page: '3', departmentId: '8b7ad4c4-3c0e-4d6b-9a52-2d6d3a0d9a11' });
    expect(validateSync(q)).toEqual([]);
    expect(q.page).toBe(3);
  });

  it('rejects a departmentId that is not a UUID', () => {
    expect(errorsFor(DirectoryQuery, { departmentId: 'abc' })).toContain('departmentId');
    expect(errorsFor(UserListQuery, { departmentId: 'abc' })).toContain('departmentId');
  });

  it('rejects a repeated parameter (?q=a&q=b arrives as an array)', () => {
    expect(errorsFor(DirectoryQuery, { q: ['a', 'b'] })).toContain('q');
    expect(errorsFor(UserListQuery, { q: ['a', 'b'] })).toContain('q');
  });

  it('rejects inherited object keys as a role', () => {
    for (const role of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(errorsFor(UserListQuery, { role })).toContain('role');
    }
  });

  it('rejects unknown status and sort values and out-of-range pages', () => {
    expect(errorsFor(UserListQuery, { status: 'DELETED' })).toContain('status');
    expect(errorsFor(UserListQuery, { sort: 'password' })).toContain('sort');
    expect(errorsFor(UserListQuery, { sort: 'constructor' })).toContain('sort');
    expect(errorsFor(UserListQuery, { page: '0' })).toContain('page');
    expect(errorsFor(UserListQuery, { page: '99999' })).toContain('page');
    expect(errorsFor(UserListQuery, { page: 'abc' })).toContain('page');
  });

  it('rejects parameters the endpoint does not know', () => {
    expect(errorsFor(DirectoryQuery, { role: 'ADMIN' })).toContain('role');
  });
});
