import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG, AppConfig } from '../config';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = new Redis(config.redisUrl, { maxRetriesPerRequest: 3, keyPrefix: 'app:' });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
