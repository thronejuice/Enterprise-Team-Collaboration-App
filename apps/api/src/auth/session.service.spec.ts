import { SessionService } from './session.service';

/** Minimal in-memory Redis with the options session.service uses (EX, KEEPTTL, XX). */
class FakeRedis {
  data = new Map<string, { value: string; ttl: number | null }>();
  sets = new Map<string, Set<string>>();
  /** Runs once, right after the next GET returns: simulates a revoke landing between GET and EXEC. */
  afterNextGet?: () => void;

  async get(key: string) {
    const value = this.data.get(key)?.value ?? null;
    const hook = this.afterNextGet;
    this.afterNextGet = undefined;
    hook?.();
    return value;
  }
  async set(key: string, value: string, ...opts: (string | number)[]) {
    return this.applySet(key, value, opts);
  }
  private applySet(key: string, value: string, opts: (string | number)[]) {
    const existing = this.data.get(key);
    if (opts.includes('XX') && !existing) return null;
    const ex = opts.indexOf('EX');
    const ttl = ex >= 0 ? Number(opts[ex + 1]) : opts.includes('KEEPTTL') ? (existing?.ttl ?? null) : null;
    this.data.set(key, { value, ttl });
    return 'OK';
  }
  async del(...keys: string[]) {
    keys.forEach((k) => this.data.delete(k));
  }
  async smembers(key: string) {
    return [...(this.sets.get(key) ?? [])];
  }
  async srem(key: string, ...members: string[]) {
    members.forEach((m) => this.sets.get(key)?.delete(m));
  }
  multi() {
    const ops: (() => unknown)[] = [];
    const chain = {
      expire: (key: string, seconds: number) => {
        ops.push(() => {
          const e = this.data.get(key);
          if (e) e.ttl = seconds;
        });
        return chain;
      },
      set: (key: string, value: string, ...opts: (string | number)[]) => {
        ops.push(() => this.applySet(key, value, opts));
        return chain;
      },
      sadd: (key: string, member: string) => {
        ops.push(() => {
          const s = this.sets.get(key) ?? new Set<string>();
          s.add(member);
          this.sets.set(key, s);
        });
        return chain;
      },
      exec: async () => ops.map((op) => [null, op()]),
    };
    return chain;
  }
}

const config = { sessionTtlSeconds: 3600 } as never;

function setup() {
  const redis = new FakeRedis();
  const service = new SessionService({ client: redis } as never, config);
  return { redis, service };
}

describe('session service: revoked sessions stay revoked', () => {
  it('touch does not recreate a session that was deleted between GET and EXEC', async () => {
    const { redis, service } = setup();
    const token = await service.create('user-1', { ip: '1.2.3.4', userAgent: 'x' });
    // Make lastSeenAt old enough that touch() writes the session back.
    const key = [...redis.data.keys()].find((k) => k.startsWith('sess:'))!;
    const stale = JSON.parse(redis.data.get(key)!.value);
    stale.lastSeenAt = new Date(Date.now() - 5 * 60_000).toISOString();
    redis.data.set(key, { value: JSON.stringify(stale), ttl: 3600 });

    redis.afterNextGet = () => redis.data.delete(key); // revoke lands after the read
    await service.touch(token);

    expect(redis.data.has(key)).toBe(false);
  });

  it('listForUser does not recreate a legacy session that was revoked while it was being listed', async () => {
    const { redis, service } = setup();
    const key = 'sess:legacy';
    redis.data.set(key, { value: JSON.stringify({ userId: 'user-1', createdAt: new Date().toISOString() }), ttl: 3600 });
    redis.sets.set('user-sess:user-1', new Set(['legacy']));

    redis.afterNextGet = () => redis.data.delete(key);
    await service.listForUser('user-1');

    expect(redis.data.has(key)).toBe(false);
  });

  it('a normal touch keeps the session and its TTL', async () => {
    const { redis, service } = setup();
    const token = await service.create('user-1');
    const key = [...redis.data.keys()].find((k) => k.startsWith('sess:'))!;
    const stale = JSON.parse(redis.data.get(key)!.value);
    stale.lastSeenAt = new Date(Date.now() - 5 * 60_000).toISOString();
    redis.data.set(key, { value: JSON.stringify(stale), ttl: 3600 });

    await service.touch(token);

    expect(redis.data.get(key)?.ttl).toBe(3600);
    expect(JSON.parse(redis.data.get(key)!.value).lastSeenAt > stale.lastSeenAt).toBe(true);
  });
});
