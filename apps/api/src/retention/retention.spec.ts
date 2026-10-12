import { RetentionService, retentionCutoff } from './retention.service';

const NOW = new Date('2026-10-12T00:00:00Z');

describe('retention cutoff', () => {
  it('is N days before now, and 0 means keep forever', () => {
    expect(retentionCutoff(NOW, 365)?.toISOString()).toBe('2025-10-12T00:00:00.000Z');
    expect(retentionCutoff(NOW, 0)).toBeNull();
  });
});

describe('RetentionService', () => {
  const build = (auditDays: number, recordingDays: number, rows: { id: string; objectKey: string }[][] = []) => {
    const deleteMany = jest.fn(async (_args: unknown) => ({ count: 7 }));
    const batches = [...rows];
    const prisma = {
      auditLog: { deleteMany },
      recording: {
        findMany: jest.fn(async () => batches.shift() ?? []),
        update: jest.fn(async () => undefined),
      },
    };
    const storage = { delete: jest.fn(async (_key: string) => undefined) };
    const audit = { log: jest.fn(async () => undefined) };
    const service = new RetentionService(prisma as never, storage as never, audit as never, { retention: { auditDays, recordingDays } } as never);
    return { service, deleteMany, storage, prisma, audit };
  };

  it('deletes audit rows older than the cutoff and records how many', async () => {
    const { service, deleteMany, audit } = build(365, 0);
    expect(await service.purgeAudit()).toBe(7);
    const args = deleteMany.mock.calls[0][0] as unknown as { where: { createdAt: { lt: Date } } };
    expect(args.where.createdAt.lt).toBeInstanceOf(Date);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'retention.audit_purged', metadata: { deleted: 7, olderThanDays: 365 } }));
  });

  it('keeps everything when the audit period is 0', async () => {
    const { service, deleteMany } = build(0, 0);
    expect(await service.purgeAudit()).toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('deletes recording files past retention, marks them, and goes on after a missing file', async () => {
    const { service, storage, prisma, audit } = build(0, 180, [[{ id: 'r1', objectKey: 'k1' }, { id: 'r2', objectKey: 'k2' }], []]);
    storage.delete.mockImplementationOnce(async () => {
      throw Object.assign(new Error('gone'), { $metadata: { httpStatusCode: 404 } });
    });
    expect(await service.purgeRecordings()).toBe(2);
    expect((storage.delete.mock.calls as unknown as [string][]).map((c) => c[0])).toEqual(['k1', 'k2']);
    expect(prisma.recording.update).toHaveBeenCalledTimes(2);
    expect((audit.log.mock.calls as unknown as [{ targetId: string }][]).map((c) => c[0].targetId)).toEqual(['r1', 'r2']);
  });

  it('keeps recordings when the recording period is 0', async () => {
    const { service, storage } = build(0, 0);
    expect(await service.purgeRecordings()).toBe(0);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('a failing storage delete (not 404) stops the run so the next day retries', async () => {
    const { service, storage } = build(0, 180, [[{ id: 'r1', objectKey: 'k1' }]]);
    storage.delete.mockRejectedValueOnce(new Error('s3 down'));
    await expect(service.purgeRecordings()).rejects.toThrow('s3 down');
  });
});
