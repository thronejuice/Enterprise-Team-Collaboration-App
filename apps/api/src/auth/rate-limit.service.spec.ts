import { AppConfig } from '../config';
import { lockoutFor, RateLimitService, RateLimitStore, TooManyAttemptsException } from './rate-limit.service';

class FakeStore implements RateLimitStore {
  values = new Map<string, { value: string; expiresAt?: number }>();
  now = 0;

  private live(key: string) {
    const entry = this.values.get(key);
    if (entry && entry.expiresAt !== undefined && entry.expiresAt <= this.now) {
      this.values.delete(key);
      return undefined;
    }
    return entry;
  }
  async incr(key: string) {
    const entry = this.live(key);
    const next = (entry ? Number(entry.value) : 0) + 1;
    this.values.set(key, { value: String(next), expiresAt: entry?.expiresAt });
    return next;
  }
  async expire(key: string, seconds: number) {
    const entry = this.live(key);
    if (!entry) return 0;
    entry.expiresAt = this.now + seconds;
    return 1;
  }
  async ttl(key: string) {
    const entry = this.live(key);
    if (!entry) return -2;
    return entry.expiresAt === undefined ? -1 : entry.expiresAt - this.now;
  }
  async set(key: string, value: string, _mode: 'EX', seconds: number) {
    this.values.set(key, { value, expiresAt: this.now + seconds });
    return 'OK';
  }
  async del(...keys: string[]) {
    keys.forEach((k) => this.values.delete(k));
    return keys.length;
  }
}

const config = {
  rateLimit: { windowSeconds: 900, maxFailuresPerUser: 5, maxFailuresPerIp: 20, lockoutScheduleSeconds: [60, 300, 900] },
} as AppConfig;

describe('lockoutFor', () => {
  it('escalates and then repeats the last step', () => {
    expect([1, 2, 3, 4, 9].map((l) => lockoutFor(l, [60, 300, 900]))).toEqual([60, 300, 900, 900, 900]);
  });
});

describe('RateLimitService', () => {
  let store: FakeStore;
  let service: RateLimitService;

  beforeEach(() => {
    store = new FakeStore();
    service = RateLimitService.withStore(store, config);
  });

  it('locks a user after 5 failures with escalating delays', async () => {
    const limit = service.userLimit('code-user', 'u1');
    for (let i = 0; i < 4; i++) expect(await service.recordFailure([limit])).toBe(0);
    expect(await service.recordFailure([limit])).toBe(60);
    await expect(service.assertNotLocked([limit])).rejects.toBeInstanceOf(TooManyAttemptsException);

    store.now += 61;
    await expect(service.assertNotLocked([limit])).resolves.toBeUndefined();
    for (let i = 0; i < 4; i++) await service.recordFailure([limit]);
    expect(await service.recordFailure([limit])).toBe(300);

    store.now += 301;
    for (let i = 0; i < 4; i++) await service.recordFailure([limit]);
    expect(await service.recordFailure([limit])).toBe(900);
  });

  it('forgets failures outside the window', async () => {
    const limit = service.userLimit('code-user', 'u1');
    for (let i = 0; i < 4; i++) await service.recordFailure([limit]);
    store.now += 901;
    expect(await service.recordFailure([limit])).toBe(0);
  });

  it('resets escalation after a success', async () => {
    const limit = service.userLimit('code-user', 'u1');
    for (let i = 0; i < 5; i++) await service.recordFailure([limit]);
    store.now += 61;
    await service.recordSuccess([limit]);
    for (let i = 0; i < 4; i++) await service.recordFailure([limit]);
    expect(await service.recordFailure([limit])).toBe(60);
  });

  it('locks an IP for the whole window after 20 failures from different users', async () => {
    const ip = service.ipLimit('code-ip', '10.0.0.5');
    for (let i = 0; i < 19; i++) {
      expect(await service.recordFailure([service.userLimit('code-user', `u${i}`), ip])).toBe(0);
    }
    expect(await service.recordFailure([service.userLimit('code-user', 'u99'), ip])).toBe(900);
    await expect(service.assertNotLocked([ip])).rejects.toMatchObject({ retryAfterSeconds: 900 });
  });

  it('treats maxFailures 0 as disabled', async () => {
    const off = { ...service.ipLimit('code-ip', '10.0.0.5'), maxFailures: 0 };
    for (let i = 0; i < 50; i++) expect(await service.recordFailure([off])).toBe(0);
    await expect(service.assertNotLocked([off])).resolves.toBeUndefined();
  });
});

describe('admin unlock (security review #3)', () => {
  it('reports the remaining lock and clears lock, counter and escalation level', async () => {
    const store = new FakeStore();
    const service = RateLimitService.withStore(store, config);
    const limit = service.userLimit('login-email', 'victim@example.com');

    expect(await service.lockedSeconds([limit])).toBeLessThanOrEqual(0);
    for (let i = 0; i < 5; i++) await service.recordFailure([limit]);
    expect(await service.lockedSeconds([limit])).toBe(60);

    await service.unlock([limit]);
    expect(await service.lockedSeconds([limit])).toBeLessThanOrEqual(0);
    await expect(service.assertNotLocked([limit])).resolves.toBeUndefined();
    // Escalation starts over: the next lockout is the first (60 s), not the second (300 s).
    for (let i = 0; i < 4; i++) await service.recordFailure([limit]);
    expect(await service.recordFailure([limit])).toBe(60);
  });

  it('a disabled limit (0 failures) never reports a lock', async () => {
    const service = RateLimitService.withStore(new FakeStore(), config);
    const ipLimit = { ...service.ipLimit('login-ip', '1.2.3.4'), maxFailures: 0 };
    expect(await service.lockedSeconds([ipLimit])).toBe(0);
  });
});
