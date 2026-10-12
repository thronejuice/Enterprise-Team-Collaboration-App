import { TooManyAttemptsException, RateLimitService } from '../auth/rate-limit.service';
import { FakeStore } from '../testing/fake-store';
import { MeetingsService } from './meetings.service';

const config = {
  rateLimit: { windowSeconds: 900, maxFailuresPerUser: 5, maxFailuresPerIp: 0, lockoutScheduleSeconds: [60, 300, 900] },
  limits: { maxParticipantsPerRoom: 10 },
} as never;

function setup() {
  const store = new FakeStore();
  const rateLimit = RateLimitService.withStore(store, config);
  const meeting = { id: 'm1', roomCode: '1234', status: 'ACTIVE', hostId: 'host' };
  const prisma = {
    meeting: { findFirst: jest.fn(async ({ where }: { where: { roomCode: string } }) => (where.roomCode === '1234' ? meeting : null)) },
    meetingParticipant: { findUnique: jest.fn(async () => null), create: jest.fn(async () => undefined) },
  };
  const audit = { log: jest.fn(async () => undefined) };
  const notifications = { notify: jest.fn(async () => undefined) };
  const service = new MeetingsService(prisma as never, {} as never, rateLimit, audit as never, {} as never, notifications as never, config);
  const user = { id: 'attacker', role: 'MEMBER', displayName: 'Mallory' } as never;
  return { service, user, store, notifications };
}

describe('room code rate limit survives a successful join (security review #1)', () => {
  it('wrong x4, right x1, wrong x1 -> locked, even for the right code', async () => {
    const { service, user } = setup();
    for (let i = 0; i < 4; i++) await expect(service.joinByCode(user, '0000', 'ip')).rejects.toThrow();
    await expect(service.joinByCode(user, '1234', 'ip')).resolves.toEqual({ meetingId: 'm1' }); // joining their own room
    await expect(service.joinByCode(user, '0000', 'ip')).rejects.toThrow(); // 5th wrong in the window -> lockout starts
    await expect(service.joinByCode(user, '1234', 'ip')).rejects.toBeInstanceOf(TooManyAttemptsException);
  });

  it('the counter is not cleared by success: four wrong guesses stay on the books', async () => {
    const { service, user, store } = setup();
    for (let i = 0; i < 4; i++) await service.joinByCode(user, '0000', 'ip').catch(() => undefined);
    await service.joinByCode(user, '1234', 'ip');
    expect(store.values.get('rl:fail:code-user:attacker')?.value).toBe('4');
  });
});

describe('host is told when someone joins with the room code (security review #4)', () => {
  it('notifies the host once, on the first join only', async () => {
    const { service, user, notifications } = setup();
    await service.joinByCode(user, '1234', 'ip');
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith(['host'], 'meeting.joined_by_code', expect.any(String), expect.stringContaining('Mallory'));
  });

  it('does not notify the host about their own join', async () => {
    const { service, notifications } = setup();
    await service.joinByCode({ id: 'host', role: 'HOST', displayName: 'Host' } as never, '1234', 'ip');
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
