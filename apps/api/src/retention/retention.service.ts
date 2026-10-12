import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { APP_CONFIG, AppConfig } from '../config';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';
import { TERMINAL_STATUSES } from '../recordings/recording-state';
import { StorageService } from '../recordings/storage.service';

const DAY_MS = 86_400_000;
const BATCH = 100;

/** Rows created before this instant are past retention. Pure so the boundary can be tested. */
export function retentionCutoff(now: Date, days: number): Date | null {
  return days > 0 ? new Date(now.getTime() - days * DAY_MS) : null;
}

/** Daily purge of audit rows and recording files past the configured age (PDPA: keep data no longer than needed). */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Interval(DAY_MS)
  async run(): Promise<void> {
    try {
      await this.purgeAudit();
    } catch (error) {
      this.logger.error(`Audit purge failed: ${(error as Error).message}`);
    }
    try {
      await this.purgeRecordings();
    } catch (error) {
      this.logger.error(`Recording purge failed: ${(error as Error).message}`);
    }
  }

  async purgeAudit(): Promise<number> {
    const cutoff = retentionCutoff(new Date(), this.config.retention.auditDays);
    if (!cutoff) return 0;
    const res = await this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    if (res.count > 0) {
      await this.audit.log({ action: 'retention.audit_purged', actorId: null, metadata: { deleted: res.count, olderThanDays: this.config.retention.auditDays } });
    }
    return res.count;
  }

  async purgeRecordings(): Promise<number> {
    const cutoff = retentionCutoff(new Date(), this.config.retention.recordingDays);
    if (!cutoff) return 0;
    let purged = 0;
    for (;;) {
      const batch = await this.prisma.recording.findMany({
        where: { deletedAt: null, status: { in: [...TERMINAL_STATUSES] }, createdAt: { lt: cutoff } },
        take: BATCH,
        select: { id: true, objectKey: true },
      });
      if (batch.length === 0) break;
      for (const recording of batch) {
        await this.storage.delete(recording.objectKey).catch((error) => {
          const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
          if (status !== 404) throw error;
        });
        await this.prisma.recording.update({ where: { id: recording.id }, data: { deletedAt: new Date() } });
        await this.audit.log({ action: 'recording.retention_deleted', actorId: null, targetType: 'recording', targetId: recording.id, metadata: { olderThanDays: this.config.retention.recordingDays } });
        purged++;
      }
    }
    return purged;
  }
}
