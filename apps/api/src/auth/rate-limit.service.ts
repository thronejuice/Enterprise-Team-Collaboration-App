import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config';
import { RedisService } from '../common/redis.service';

/** Subset of ioredis used here, so tests can supply an in-memory fake. */
export interface RateLimitStore {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
}

export interface Limit {
  /** e.g. "code-user" or "login-ip" */
  scope: string;
  key: string;
  maxFailures: number;
  /** Lockout durations used for the 1st, 2nd, 3rd... lockout; the last value repeats. */
  lockoutSeconds: number[];
}

export class TooManyAttemptsException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      { statusCode: 429, message: 'Too many attempts. Please wait before trying again.', retryAfterSeconds },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export function lockoutFor(level: number, schedule: number[]): number {
  const index = Math.min(Math.max(level, 1), schedule.length) - 1;
  return schedule[index];
}

/** A limit with maxFailures 0 is disabled (e.g. RATE_LIMIT_MAX_FAILURES_PER_IP=0). */
const enabled = (limits: Limit[]) => limits.filter((l) => l.maxFailures > 0);

/** How long escalation levels are remembered after the last lockout. */
const LEVEL_MEMORY_SECONDS = 24 * 3600;

@Injectable()
export class RateLimitService {
  private readonly store: RateLimitStore;

  constructor(redis: RedisService, @Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.store = redis.client as unknown as RateLimitStore;
  }

  static withStore(store: RateLimitStore, config: AppConfig): RateLimitService {
    const instance = Object.create(RateLimitService.prototype) as RateLimitService;
    Object.assign(instance, { store, config });
    return instance;
  }

  /** Throws TooManyAttemptsException if any of the limits is currently locked. */
  async assertNotLocked(limits: Limit[]): Promise<void> {
    for (const limit of enabled(limits)) {
      const ttl = await this.store.ttl(this.lockKey(limit));
      if (ttl > 0) throw new TooManyAttemptsException(ttl);
    }
  }

  /** Records a failure; returns the lockout (seconds) that was applied, or 0. */
  async recordFailure(limits: Limit[]): Promise<number> {
    let applied = 0;
    for (const limit of enabled(limits)) {
      const failKey = this.failKey(limit);
      const count = await this.store.incr(failKey);
      if (count === 1) await this.store.expire(failKey, this.config.rateLimit.windowSeconds);
      if (count >= limit.maxFailures) {
        const levelKey = this.levelKey(limit);
        const level = await this.store.incr(levelKey);
        await this.store.expire(levelKey, LEVEL_MEMORY_SECONDS);
        const seconds = lockoutFor(level, limit.lockoutSeconds);
        await this.store.set(this.lockKey(limit), '1', 'EX', seconds);
        await this.store.del(failKey);
        applied = Math.max(applied, seconds);
      }
    }
    return applied;
  }

  /** Seconds left on the longest active lock among the limits, or 0. */
  async lockedSeconds(limits: Limit[]): Promise<number> {
    let longest = 0;
    for (const limit of enabled(limits)) longest = Math.max(longest, await this.store.ttl(this.lockKey(limit)));
    return longest;
  }

  /** Admin unlock: clears the lock, the failure counter and the escalation level. */
  async unlock(limits: Limit[]): Promise<void> {
    for (const limit of limits) await this.store.del(this.lockKey(limit), this.failKey(limit), this.levelKey(limit));
  }

  async recordSuccess(limits: Limit[]): Promise<void> {
    for (const limit of limits) {
      await this.store.del(this.failKey(limit), this.levelKey(limit));
    }
  }

  userLimit(scope: string, key: string): Limit {
    return {
      scope,
      key,
      maxFailures: this.config.rateLimit.maxFailuresPerUser,
      lockoutSeconds: this.config.rateLimit.lockoutScheduleSeconds,
    };
  }

  ipLimit(scope: string, ip: string): Limit {
    return {
      scope,
      key: ip,
      maxFailures: this.config.rateLimit.maxFailuresPerIp,
      lockoutSeconds: [this.config.rateLimit.windowSeconds],
    };
  }

  private failKey(l: Limit): string {
    return `rl:fail:${l.scope}:${l.key}`;
  }
  private levelKey(l: Limit): string {
    return `rl:level:${l.scope}:${l.key}`;
  }
  private lockKey(l: Limit): string {
    return `rl:lock:${l.scope}:${l.key}`;
  }
}
