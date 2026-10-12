import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  it('a failed insert is logged and never thrown to the action that caused it', async () => {
    const prisma = { notification: { createMany: jest.fn(async () => { throw new Error('db down'); }) } };
    const service = new NotificationsService(prisma as never);
    await expect(service.notify(['u1'], 'password.changed', 'T', 'B')).resolves.toBeUndefined();
  });

  it('does nothing for an empty recipient list', async () => {
    const createMany = jest.fn();
    await new NotificationsService({ notification: { createMany } } as never).notify([], 'password.changed', 'T', 'B');
    expect(createMany).not.toHaveBeenCalled();
  });

  it('creates one row per recipient', async () => {
    const createMany = jest.fn(async () => ({ count: 2 }));
    await new NotificationsService({ notification: { createMany } } as never).notify(['a', 'b'], 'session.revoked', 'T', 'B');
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'a', kind: 'session.revoked', title: 'T', body: 'B' },
        { userId: 'b', kind: 'session.revoked', title: 'T', body: 'B' },
      ],
    });
  });
});
