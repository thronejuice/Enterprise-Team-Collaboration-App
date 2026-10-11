import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from '../config';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { AuditService } from '../audit/audit.service';
import { RateLimitService } from '../auth/rate-limit.service';
import { LiveKitService } from '../livekit/livekit.service';
import { StorageService } from '../recordings/storage.service';

@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: loadConfig },
    PrismaService,
    RedisService,
    AuditService,
    RateLimitService,
    LiveKitService,
    StorageService,
  ],
  exports: [APP_CONFIG, PrismaService, RedisService, AuditService, RateLimitService, LiveKitService, StorageService],
})
export class GlobalModule {}
