import { RateLimitStore } from '../auth/rate-limit.service';

/** In-memory stand-in for the Redis commands the rate limiter uses, with a clock tests can move. */
export class FakeStore implements RateLimitStore {
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
