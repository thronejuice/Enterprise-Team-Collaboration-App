import { ForbiddenException, HttpException } from '@nestjs/common';
import { IMPORT_HEADER, ImportService } from './import.service';

/** In-memory Redis with the commands commit() uses. GETDEL is atomic, like the real one. */
class FakeRedis {
  store = new Map<string, { value: string; ttl: number }>();
  async set(key: string, value: string, _mode: string, ttl: number) {
    this.store.set(key, { value, ttl });
    return 'OK';
  }
  async ttl(key: string) {
    return this.store.get(key)?.ttl ?? -2;
  }
  async getdel(key: string) {
    const entry = this.store.get(key);
    this.store.delete(key);
    return entry?.value ?? null;
  }
}

const header = IMPORT_HEADER.join(',');
const goodCsv = `${header}\r\nnew-user@example.com,New User,MEMBER,EMP-1,,,,,\r\n`;

function setup(existingEmails: string[] = []) {
  const redis = new FakeRedis();
  const created: unknown[] = [];
  const audit = { log: jest.fn(async () => undefined) };
  const createMany = jest.fn(async ({ data }: { data: unknown[] }) => created.push(...data));
  const prisma = {
    user: { findMany: jest.fn(async () => existingEmails.map((email) => ({ email, employeeId: null }))), createMany },
    department: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({ user: { createMany } })),
  };
  const service = new ImportService(prisma as never, { client: redis } as never, audit as never);
  return { service, redis, created, audit };
}

describe('CSV import commit (L4)', () => {
  it('only the admin who made the preview can commit, and a refusal leaves the import available', async () => {
    const { service, redis, created } = setup();
    const { importId } = await service.preview('admin-1', goodCsv);

    await expect(service.commit('admin-2', importId, '1.1.1.1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(redis.store.has(`import:${importId}`)).toBe(true);
    expect(created).toHaveLength(0);

    const csv = await service.commit('admin-1', importId, '1.1.1.1');
    expect(csv).toContain('new-user@example.com');
    expect(created).toHaveLength(1);
  });

  it('a second commit of the same import finds nothing (claimed once)', async () => {
    const { service, created } = setup();
    const { importId } = await service.preview('admin-1', goodCsv);

    const results = await Promise.allSettled([service.commit('admin-1', importId, 'ip'), service.commit('admin-1', importId, 'ip')]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0].reason as HttpException).getResponse()).toMatchObject({ code: 'IMPORT_EXPIRED' });
    expect(created).toHaveLength(1); // accounts were created once
  });

  it('puts the import back with its remaining lifetime when validation fails, so the admin can retry', async () => {
    const { service, redis, created } = setup();
    const { importId } = await service.preview('admin-1', goodCsv);
    // Between preview and commit, someone else registers the same email.
    const key = `import:${importId}`;
    redis.store.get(key)!.ttl = 321;
    const taken = setup(['new-user@example.com']);
    taken.redis.store = redis.store;

    await expect(taken.service.commit('admin-1', importId, 'ip')).rejects.toMatchObject({ response: { code: 'IMPORT_INVALID' } });
    expect(redis.store.get(key)?.ttl).toBe(321);
    expect(created).toHaveLength(0);
  });

  it('does not write the temporary passwords to the audit log', async () => {
    const { service, audit } = setup();
    const { importId } = await service.preview('admin-1', goodCsv);
    const csv = await service.commit('admin-1', importId, 'ip');
    const password = csv.trim().split(/\r?\n/)[1].split(',').at(-1)!;
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain(password);
  });
});
