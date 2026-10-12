import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { UAParser } from 'ua-parser-js';
import { APP_CONFIG, AppConfig } from '../config';
import { RedisService } from '../common/redis.service';

export interface SessionData {
  userId: string;
  createdAt: string;
  /** Random identifier shown in the UI/API instead of the token hash. Missing on sessions created before 0.1.1. */
  publicId?: string;
  ip?: string;
  /** Raw User-Agent, truncated. Only the parsed label is ever returned to clients. */
  userAgent?: string;
  lastSeenAt?: string;
}

export interface SessionMeta {
  ip: string;
  userAgent?: string;
}

export interface SessionInfo {
  publicId: string;
  deviceLabel: string;
  ip: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
  current: boolean;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const newPublicId = () => randomBytes(16).toString('base64url');
/** lastSeenAt is written at most once per minute per session. */
const LAST_SEEN_RESOLUTION_MS = 60_000;

/** "Chrome on Windows", "Safari on iOS", or "Unknown device" when there is nothing to parse. */
export function deviceLabel(userAgent?: string): string {
  if (!userAgent) return 'Unknown device';
  const result = new UAParser(userAgent).getResult();
  const browser = result.browser.name;
  const os = result.os.name;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? 'Unknown device';
}

/** Opaque session tokens stored (hashed) in Redis so they can be revoked immediately. */
@Injectable()
export class SessionService {
  constructor(
    private readonly redis: RedisService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(userId: string, meta?: SessionMeta): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const id = hash(token);
    const now = new Date().toISOString();
    const data: SessionData = {
      userId,
      createdAt: now,
      publicId: newPublicId(),
      ip: meta?.ip,
      userAgent: meta?.userAgent?.slice(0, 256),
      lastSeenAt: now,
    };
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
    const multi = this.redis.client.multi().expire(key, this.config.sessionTtlSeconds).expire(`user-sess:${data.userId}`, this.config.sessionTtlSeconds);
    const seen = data.lastSeenAt ? Date.parse(data.lastSeenAt) : 0;
    if (Date.now() - seen >= LAST_SEEN_RESOLUTION_MS) {
      data.lastSeenAt = new Date().toISOString();
      // XX: only update a session that still exists, so a concurrent revoke cannot be undone (and never loses its TTL)
      multi.set(key, JSON.stringify(data), 'KEEPTTL', 'XX');
    }
    await multi.exec();
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

  /** Live sessions of a user. Index entries whose session key already expired are removed on the way. */
  async listForUser(userId: string, currentToken?: string): Promise<SessionInfo[]> {
    const current = currentToken ? hash(currentToken) : undefined;
    const ids = await this.redis.client.smembers(`user-sess:${userId}`);
    const items: SessionInfo[] = [];
    for (const id of ids) {
      const raw = await this.redis.client.get(`sess:${id}`);
      if (!raw) {
        await this.redis.client.srem(`user-sess:${userId}`, id);
        continue;
      }
      const data = JSON.parse(raw) as SessionData;
      if (!data.publicId) {
        // Sessions from before 0.1.1 get a stable public id the first time they are listed.
        data.publicId = newPublicId();
        await this.redis.client.set(`sess:${id}`, JSON.stringify(data), 'KEEPTTL', 'XX');
      }
      items.push({
        publicId: data.publicId,
        deviceLabel: deviceLabel(data.userAgent),
        ip: data.ip ?? null,
        createdAt: data.createdAt ?? null,
        lastSeenAt: data.lastSeenAt ?? null,
        current: id === current,
      });
    }
    return items.sort((a, b) => (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''));
  }

  /** Signs out one session by its public id. Returns false if the user has no such live session. */
  async destroyByPublicId(userId: string, publicId: string): Promise<boolean> {
    const ids = await this.redis.client.smembers(`user-sess:${userId}`);
    for (const id of ids) {
      const raw = await this.redis.client.get(`sess:${id}`);
      if (!raw) continue;
      if ((JSON.parse(raw) as SessionData).publicId !== publicId) continue;
      await this.redis.client.del(`sess:${id}`);
      await this.redis.client.srem(`user-sess:${userId}`, id);
      return true;
    }
    return false;
  }
}
