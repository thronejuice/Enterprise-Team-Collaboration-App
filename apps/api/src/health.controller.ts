import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/auth.decorators';
import { PrismaService } from './common/prisma.service';
import { RedisService } from './common/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    await this.redis.client.ping();
    return { status: 'ok' };
  }
}
