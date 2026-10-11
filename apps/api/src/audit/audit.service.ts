import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

export interface AuditEntry {
  action: string;
  actorId?: string | null;
  targetType?: string;
  targetId?: string;
  ip?: string;
  success?: boolean;
  metadata?: Record<string, unknown>;
}

/** Security/audit events. Never pass tokens, passwords or secrets in metadata. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          actorId: entry.actorId ?? null,
          targetType: entry.targetType,
          targetId: entry.targetId,
          ip: entry.ip,
          success: entry.success ?? true,
          metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error) {
      // Auditing must not break the request; still surface it in the container log.
      this.logger.error(`Failed to write audit entry ${entry.action}: ${(error as Error).message}`);
    }
  }
}
