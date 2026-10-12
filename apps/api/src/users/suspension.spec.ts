import { HttpException } from '@nestjs/common';
import { assertAdminRemains, scrubUpdatedAudit } from './suspension.service';

describe('assertAdminRemains (M2)', () => {
  const txWith = (others: number) => {
    const calls: string[] = [];
    const tx = {
      $executeRaw: jest.fn(async () => {
        calls.push('lock');
        return 0;
      }),
      user: {
        count: jest.fn(async (args: unknown) => {
          calls.push('count');
          (tx as unknown as { lastWhere: unknown }).lastWhere = args;
          return others;
        }),
      },
    };
    return { tx, calls };
  };

  it('takes the admin lock before counting', async () => {
    const { tx, calls } = txWith(1);
    await assertAdminRemains(tx as never, 'leaving');
    expect(calls).toEqual(['lock', 'count']);
  });

  it('allows the change when another usable admin remains', async () => {
    await expect(assertAdminRemains(txWith(2).tx as never, 'leaving')).resolves.toBeUndefined();
  });

  it('refuses with LAST_ADMIN when nobody else remains', async () => {
    const error = await assertAdminRemains(txWith(0).tx as never, 'leaving').catch((e) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(409);
    expect((error as HttpException).getResponse()).toMatchObject({ code: 'LAST_ADMIN' });
  });

  it('counts only active, non-anonymized admins with no pending suspension, excluding the leaving one', async () => {
    const { tx } = txWith(1);
    await assertAdminRemains(tx as never, 'leaving');
    const where = (tx.user.count.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({
      role: 'ADMIN',
      isActive: true,
      anonymizedAt: null,
      id: { not: 'leaving' },
      suspensions: { none: { status: { in: ['SCHEDULED', 'ACTIVE'] } } },
    });
  });
});

describe('scrubUpdatedAudit (L3)', () => {
  it('replaces stored personal values with field names, keeping non-personal metadata', async () => {
    const updates: { id: bigint; metadata: unknown }[] = [];
    const tx = {
      auditLog: {
        findMany: jest.fn(async () => [
          { id: 1n, metadata: { changes: { displayName: 'Hana', phone: '081-234-5678', emailFrom: 'a@x.com', emailTo: 'b@x.com', role: 'HOST' } } },
          { id: 2n, metadata: { fields: ['phone'] } }, // already in the new format
          { id: 3n, metadata: null },
        ]),
        update: jest.fn(async ({ where, data }: { where: { id: bigint }; data: { metadata: unknown } }) => {
          updates.push({ id: where.id, metadata: data.metadata });
        }),
      },
    };
    await scrubUpdatedAudit(tx as never, 'user-1');

    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe(1n);
    expect(updates[0].metadata).toEqual({ fields: ['displayName', 'phone', 'email', 'role'] });
    expect(JSON.stringify(updates[0].metadata)).not.toMatch(/Hana|081|@x\.com/);
  });
});
