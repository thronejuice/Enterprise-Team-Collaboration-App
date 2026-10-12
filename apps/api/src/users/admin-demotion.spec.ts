import { UsersController } from './users.controller';

describe('a demoted admin is removed from rooms they could only be in as an admin (security review #9)', () => {
  const build = (removeParticipant: jest.Mock) => {
    const findMany = jest.fn(async (_args: unknown) => [{ id: 'room-1' }, { id: 'room-2' }]);
    const prisma = { meeting: { findMany } };
    const controller = new UsersController(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, { removeParticipant } as never);
    const run = (userId: string) => (controller as unknown as { removeFromAdminOnlyRooms(id: string): Promise<void> }).removeFromAdminOnlyRooms(userId);
    return { run, findMany };
  };

  it('looks only at live rooms the user does not host and was not admitted to', async () => {
    const { run, findMany } = build(jest.fn(async () => undefined));
    await run('admin-1');
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { status: 'ACTIVE', hostId: { not: 'admin-1' }, participants: { none: { userId: 'admin-1', revokedAt: null } } },
    });
  });

  it('disconnects them from each such room and carries on if one disconnect fails', async () => {
    const removeParticipant = jest.fn(async (room: string) => {
      if (room === 'room-1') throw new Error('livekit unreachable');
    });
    const { run } = build(removeParticipant);
    await expect(run('admin-1')).resolves.toBeUndefined();
    expect(removeParticipant.mock.calls).toEqual([['room-1', 'admin-1'], ['room-2', 'admin-1']]);
  });
});
