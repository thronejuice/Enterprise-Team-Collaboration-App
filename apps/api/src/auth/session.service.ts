import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { APP_CONFIG, AppConfig } from '../config';
import { RedisService } from '../common/redis.service';

interface SessionData {
  userId: string;
  createdAt: string;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Opaque session tokens stored (hashed) in Redis so they can be revoked immediately. */
@Injectable()
export class SessionService {
  constructor(
    private readonly redis: RedisService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const id = hash(token);
    const data: SessionData = { userId, createdAt: new Date().toISOString() };
    await this.redis.client
      .multi()
      .set(`sess:${id}`, JSON.stringify(data), 'EX', this.config.sessionTtlSeconds)
      .sadd(`user-sess:${userId}`, id)
      .expire(`user-sess:${userId}`, this.config.sessionTtlSeconds)
      .exec();
    return token;
  }

  /** Returns the session and slides its expiry, or null if unknown/expired. */
  async touch(token: string): Promise<SessionData | null> {
    const key = `sess:${hash(token)}`;
    const raw = await this.redis.client.get(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as SessionData;
    await this.redis.client
      .multi()
      .expire(key, this.config.sessionTtlSeconds)
      .expire(`user-sess:${data.userId}`, this.config.sessionTtlSeconds)
      .exec();
    return data;
  }

  async destroy(token: string): Promise<void> {
    const id = hash(token);
    const raw = await this.redis.client.get(`sess:${id}`);
    await this.redis.client.del(`sess:${id}`);
    if (raw) await this.redis.client.srem(`user-sess:${(JSON.parse(raw) as SessionData).userId}`, id);
  }

  async destroyAllForUser(userId: string, exceptToken?: string): Promise<void> {
    const keep = exceptToken ? hash(exceptToken) : undefined;
    const ids = await this.redis.client.smembers(`user-sess:${userId}`);
    const drop = ids.filter((id) => id !== keep);
    if (drop.length > 0) {
      await this.redis.client.del(...drop.map((id) => `sess:${id}`));
      await this.redis.client.srem(`user-sess:${userId}`, ...drop);
    }
  }
}
