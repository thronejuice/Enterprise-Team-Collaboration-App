import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Roles } from '../auth/auth.decorators';

@Controller('admin/audit')
@Roles('ADMIN')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('limit') limitRaw?: string,
    @Query('before') before?: string,
    @Query('action') action?: string,
    @Query('failedOnly') failedOnly?: string,
  ) {
    const limit = Math.min(Math.max(Number.parseInt(limitRaw ?? '50', 10) || 50, 1), 200);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(before && /^\d+$/.test(before) ? { id: { lt: BigInt(before) } } : {}),
        ...(action ? { action: { startsWith: action } } : {}),
        ...(failedOnly === 'true' ? { success: false } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit,
    });
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id))];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, email: true, displayName: true },
    });
    const byId = new Map(actors.map((a) => [a.id, a]));
    return {
      items: rows.map((r) => ({
        id: r.id.toString(),
        createdAt: r.createdAt,
        action: r.action,
        success: r.success,
        actor: r.actorId ? (byId.get(r.actorId) ?? { id: r.actorId }) : null,
        targetType: r.targetType,
        targetId: r.targetId,
        ip: r.ip,
        metadata: r.metadata,
      })),
      nextBefore: rows.length === limit ? rows[rows.length - 1].id.toString() : null,
    };
  }
}
