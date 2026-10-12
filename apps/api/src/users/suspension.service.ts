import { BadRequestException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Prisma, SuspensionReason, UserSuspension } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../auth/passwords';
import { SessionService } from '../auth/session.service';
import { AuditService } from '../audit/audit.service';
import { coded } from '../common/errors';
import { isUniqueViolation, PrismaService } from '../common/prisma.service';
import { AuthUser } from '../common/request';
import { LiveKitService } from '../livekit/livekit.service';
import { AvatarService } from './avatar.service';
import { effectiveAtFor } from './profile';

type Tx = Prisma.TransactionClient;
const OPEN_STATUSES = ['SCHEDULED', 'ACTIVE'] as const;

export interface SuspendInput {
  reason: SuspensionReason;
  note?: string;
  effective: 'now' | string;
  handoverToId?: string;
}

interface AppliedEffects {
  recipientId: string;
  /** Why the recipient is not the one the admin picked (or the creator): recorded in audit. */
  fallbackReason: string | null;
  transferredMeetingIds: string[];
  /** ACTIVE rooms the user is in or hosts, to evict them from LiveKit after commit. */
  activeRoomIds: string[];
}

/** Offboarding: suspend (now or on the last working day), handover of rooms, cancel, reactivate, anonymize. */
@Injectable()
export class SuspensionService {
  private readonly logger = new Logger(SuspensionService.name);
  private processingScheduled = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly livekit: LiveKitService,
    private readonly audit: AuditService,
    private readonly avatars: AvatarService,
  ) {}

  async offboardingSummary(userId: string) {
    const [activeMeetings, endedMeetings, meetingsWithRecordings] = await Promise.all([
      this.prisma.meeting.count({ where: { hostId: userId, status: 'ACTIVE' } }),
      this.prisma.meeting.count({ where: { hostId: userId, status: 'ENDED' } }),
      this.prisma.meeting.count({ where: { hostId: userId, recordings: { some: { deletedAt: null } } } }),
    ]);
    return { activeMeetings, endedMeetings, meetingsWithRecordings };
  }

  async suspend(admin: AuthUser, userId: string, dto: SuspendInput, ip: string) {
    if (userId === admin.id) throw new BadRequestException('You cannot suspend your own account.');
    const now = new Date();
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException('User not found');
    if (target.anonymizedAt) throw coded(HttpStatus.CONFLICT, 'ANONYMIZED', 'This account has been anonymized.');
    const open = await this.prisma.userSuspension.findFirst({ where: { userId, status: { in: [...OPEN_STATUSES] } } });
    if (open || !target.isActive) throw coded(HttpStatus.CONFLICT, 'ALREADY_SUSPENDED', 'This account is already suspended or scheduled.');

    const note = dto.note?.trim() || null;
    if (dto.reason === 'OTHER' && !note) throw new BadRequestException({ statusCode: 400, message: 'A note is required when the reason is Other', field: 'note' });

    const immediate = dto.effective === 'now';
    const effectiveAt = effectiveAtFor(dto.effective, now);
    if (target.role === 'ADMIN') await this.assertNotLastAdmin(userId);
    if (dto.handoverToId && !(await this.isEligibleRecipient(this.prisma, dto.handoverToId, userId))) {
      throw coded(HttpStatus.BAD_REQUEST, 'HANDOVER_INVALID', 'The selected handover user is not active or is being suspended.');
    }

    let row: UserSuspension;
    let applied: AppliedEffects | null = null;
    try {
      ({ row, applied } = await this.prisma.$transaction(async (tx) => {
        const created = await tx.userSuspension.create({
          data: {
            userId,
            reason: dto.reason,
            note,
            status: immediate ? 'ACTIVE' : 'SCHEDULED',
            effectiveAt,
            handoverToId: dto.handoverToId ?? null,
            createdById: admin.id,
            appliedAt: immediate ? now : null,
          },
        });
        return { row: created, applied: immediate ? await this.applyEffects(tx, created) : null };
      }));
    } catch (error) {
      if (isUniqueViolation(error)) throw coded(HttpStatus.CONFLICT, 'ALREADY_SUSPENDED', 'This account is already suspended or scheduled.');
      throw error;
    }

    if (applied) {
      await this.afterApply(row, applied, admin.id, ip);
    } else {
      await this.audit.log({
        action: 'user.suspension_scheduled',
        actorId: admin.id,
        targetType: 'user',
        targetId: userId,
        ip,
        metadata: { reason: dto.reason, effectiveAt, handoverToId: dto.handoverToId ?? null, suspensionId: row.id },
      });
    }
    return this.prisma.userSuspension.findUniqueOrThrow({ where: { id: row.id } });
  }

  async cancel(admin: AuthUser, userId: string, ip: string) {
    const scheduled = await this.prisma.userSuspension.findFirst({ where: { userId, status: 'SCHEDULED' } });
    if (!scheduled) throw coded(HttpStatus.CONFLICT, 'NOT_SUSPENDED', 'There is no scheduled suspension to cancel.');
    const now = new Date();
    const claimed = await this.prisma.userSuspension.updateMany({
      where: { id: scheduled.id, status: 'SCHEDULED' },
      data: { status: 'CANCELLED', cancelledAt: now, cancelledById: admin.id },
    });
    if (claimed.count === 0) throw coded(HttpStatus.CONFLICT, 'NOT_SUSPENDED', 'There is no scheduled suspension to cancel.');
    await this.audit.log({
      action: 'user.suspension_cancelled',
      actorId: admin.id,
      targetType: 'user',
      targetId: userId,
      ip,
      metadata: { suspensionId: scheduled.id },
    });
  }

  async reactivate(admin: AuthUser, userId: string, input: { password: string; note?: string }, ip: string) {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException('User not found');
    if (target.anonymizedAt) throw coded(HttpStatus.CONFLICT, 'ANONYMIZED', 'Anonymized accounts cannot be reactivated.');
    if (target.isActive) throw coded(HttpStatus.CONFLICT, 'NOT_SUSPENDED', 'This account is not suspended.');

    const passwordHash = await hashPassword(input.password);
    const applied = await this.prisma.userSuspension.findFirst({ where: { userId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { isActive: true, mustChangePassword: true, passwordHash } });
      if (applied) {
        await tx.userSuspension.update({
          where: { id: applied.id },
          data: { status: 'LIFTED', liftedAt: now, liftedById: admin.id, liftNote: input.note?.trim() || null },
        });
      }
    });
    // Rooms and recordings that were handed over stay with the new host (no automatic transfer back).
    await this.audit.log({
      action: 'user.reactivated',
      actorId: admin.id,
      targetType: 'user',
      targetId: userId,
      ip,
      metadata: { suspensionId: applied?.id ?? null },
    });
  }

  async anonymize(admin: AuthUser, userId: string, confirmEmail: string, ip: string) {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException('User not found');
    if (target.anonymizedAt) throw coded(HttpStatus.CONFLICT, 'ANONYMIZED', 'This account has already been anonymized.');
    const applied = await this.prisma.userSuspension.findFirst({ where: { userId, status: 'ACTIVE' } });
    if (target.isActive || !applied) throw coded(HttpStatus.CONFLICT, 'NOT_SUSPENDED', 'Only suspended accounts can be anonymized.');
    if (confirmEmail.trim().toLowerCase() !== target.email) {
      throw coded(HttpStatus.BAD_REQUEST, 'CONFIRMATION_MISMATCH', 'The email you typed does not match this account.');
    }

    await this.avatars.remove(target.avatarKey);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          ...anonymizedProfile(userId),
          passwordHash: await hashPassword(randomBytes(32).toString('base64url')),
          anonymizedAt: now,
        },
      });
      // The reason category stays; free-text notes are personal data.
      await tx.userSuspension.updateMany({ where: { userId }, data: { note: null, liftNote: null } });
    });
    await this.sessions.destroyAllForUser(userId);
    await this.audit.log({ action: 'user.anonymized', actorId: admin.id, targetType: 'user', targetId: userId, ip });
  }

  /** Runs every minute: applies SCHEDULED suspensions whose effective time has passed. Each one is its own transaction. */
  @Interval(60_000)
  async applyDueSuspensions(): Promise<void> {
    if (this.processingScheduled) return;
    this.processingScheduled = true;
    try {
      const due = await this.prisma.userSuspension.findMany({
        where: { status: 'SCHEDULED', effectiveAt: { lte: new Date() } },
        select: { id: true },
      });
      for (const { id } of due) {
        try {
          await this.applyScheduled(id);
        } catch (error) {
          // Left SCHEDULED: the next run retries it.
          this.logger.error(`Scheduled suspension ${id} failed: ${(error as Error).message}`);
        }
      }
    } finally {
      this.processingScheduled = false;
    }
  }

  private async applyScheduled(id: string): Promise<void> {
    const now = new Date();
    const result = await this.prisma.$transaction(
      async (tx) => {
        // The claim: only one run can move SCHEDULED → ACTIVE, so re-running this is harmless.
        const claimed = await tx.userSuspension.updateMany({
          where: { id, status: 'SCHEDULED', effectiveAt: { lte: now } },
          data: { status: 'ACTIVE', appliedAt: now },
        });
        if (claimed.count === 0) return null;
        const row = await tx.userSuspension.findUniqueOrThrow({ where: { id } });
        return { row, applied: await this.applyEffects(tx, row) };
      },
      { timeout: 15_000 },
    );
    if (result) await this.afterApply(result.row, result.applied, null, undefined);
  }

  /** Everything that happens when a suspension takes effect, inside the caller's transaction. */
  private async applyEffects(tx: Tx, suspension: Pick<UserSuspension, 'userId' | 'handoverToId' | 'createdById'>): Promise<AppliedEffects> {
    const { recipientId, fallbackReason } = await this.resolveRecipient(tx, suspension);
    const rooms = await tx.meeting.findMany({
      where: { status: 'ACTIVE', OR: [{ hostId: suspension.userId }, { participants: { some: { userId: suspension.userId } } }] },
      select: { id: true },
    });
    const hosted = await tx.meeting.findMany({ where: { hostId: suspension.userId }, select: { id: true } });
    if (hosted.length > 0) {
      await tx.meeting.updateMany({ where: { hostId: suspension.userId }, data: { hostId: recipientId } });
    }
    await tx.user.update({ where: { id: suspension.userId }, data: { isActive: false } });
    return {
      recipientId,
      fallbackReason,
      transferredMeetingIds: hosted.map((m) => m.id),
      activeRoomIds: rooms.map((m) => m.id),
    };
  }

  /** Runs after commit: sign out, evict from live rooms, write audit. Rooms themselves stay open. */
  private async afterApply(row: UserSuspension, applied: AppliedEffects, actorId: string | null, ip: string | undefined): Promise<void> {
    await this.sessions.destroyAllForUser(row.userId);
    for (const roomId of applied.activeRoomIds) {
      await this.livekit.removeParticipant(roomId, row.userId).catch((error: Error) => {
        this.logger.warn(`Could not evict ${row.userId} from ${roomId}: ${error.message}`);
      });
    }
    await this.audit.log({
      action: 'user.suspended',
      actorId,
      targetType: 'user',
      targetId: row.userId,
      ip,
      metadata: {
        reason: row.reason,
        suspensionId: row.id,
        handoverToId: applied.recipientId,
        meetingsTransferred: applied.transferredMeetingIds.length,
        fallbackReason: applied.fallbackReason,
      },
    });
    for (const meetingId of applied.transferredMeetingIds) {
      await this.audit.log({
        action: 'meeting.host_transferred',
        actorId,
        targetType: 'meeting',
        targetId: meetingId,
        ip,
        metadata: { from: row.userId, to: applied.recipientId, fallbackReason: applied.fallbackReason },
      });
    }
  }

  /**
   * Chosen handover → creator (if the handover is not usable) → oldest active admin.
   * Re-checked at the moment the suspension takes effect, not when it was scheduled.
   */
  private async resolveRecipient(
    tx: Tx,
    suspension: Pick<UserSuspension, 'userId' | 'handoverToId' | 'createdById'>,
  ): Promise<{ recipientId: string; fallbackReason: string | null }> {
    if (suspension.handoverToId && (await this.isEligibleRecipient(tx, suspension.handoverToId, suspension.userId))) {
      return { recipientId: suspension.handoverToId, fallbackReason: null };
    }
    const handoverFallback = suspension.handoverToId ? 'handover_unavailable' : null;
    if (await this.isEligibleRecipient(tx, suspension.createdById, suspension.userId)) {
      return { recipientId: suspension.createdById, fallbackReason: handoverFallback };
    }
    const oldestAdmin = await tx.user.findFirst({
      where: { role: 'ADMIN', isActive: true, anonymizedAt: null, id: { not: suspension.userId } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!oldestAdmin) throw new Error('No active administrator can receive the handover');
    return { recipientId: oldestAdmin.id, fallbackReason: 'creator_unavailable' };
  }

  private async isEligibleRecipient(db: Tx | PrismaService, userId: string, suspendedUserId: string): Promise<boolean> {
    if (userId === suspendedUserId) return false;
    const user = await db.user.findUnique({ where: { id: userId }, select: { isActive: true, anonymizedAt: true } });
    if (!user || !user.isActive || user.anonymizedAt) return false;
    const pending = await db.userSuspension.count({ where: { userId, status: { in: [...OPEN_STATUSES] } } });
    return pending === 0;
  }

  /** Refuses to suspend the last admin who is not already leaving. Counts pending suspensions as leaving. */
  private async assertNotLastAdmin(userId: string): Promise<void> {
    const others = await this.prisma.user.count({
      where: {
        role: 'ADMIN',
        isActive: true,
        anonymizedAt: null,
        id: { not: userId },
        suspensions: { none: { status: { in: [...OPEN_STATUSES] } } },
      },
    });
    if (others === 0) throw coded(HttpStatus.CONFLICT, 'LAST_ADMIN', 'The last active administrator cannot be suspended.');
  }
}

/** Values that replace personal data when an account is anonymized (F8 table). */
export function anonymizedProfile(userId: string) {
  return {
    email: `anonymized-${userId}@anonymized.invalid`,
    displayName: `Former user #${userId.slice(0, 4).toUpperCase()}`,
    firstName: null,
    lastName: null,
    phone: null,
    employeeId: null,
    jobTitle: null,
    departmentId: null,
    avatarKey: null,
    avatarUpdatedAt: null,
  };
}
