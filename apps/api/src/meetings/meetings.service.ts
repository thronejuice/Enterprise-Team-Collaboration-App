import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Meeting, MeetingParticipant } from '@prisma/client';
import { APP_CONFIG, AppConfig } from '../config';
import { AuditService } from '../audit/audit.service';
import { isUniqueViolation, PrismaService } from '../common/prisma.service';
import { AuthUser } from '../common/request';
import { RateLimitService, TooManyAttemptsException } from '../auth/rate-limit.service';
import { LiveKitService } from '../livekit/livekit.service';
import { RecordingsService } from '../recordings/recordings.service';
import { canAccessMeeting, canManageMeeting } from './access';
import { createWithUniqueCode, isValidRoomCode, RoomCodeExhaustedError } from './room-code';

/** Same response for unknown, ended and malformed codes so codes cannot be probed. */
const INVALID_CODE_MESSAGE = 'Room code is invalid or the meeting is not available.';

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
    private readonly recordings: RecordingsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(user: AuthUser, title: string, ip: string) {
    let meeting: Meeting;
    try {
      meeting = await createWithUniqueCode(
        (roomCode) =>
          this.prisma.meeting.create({
            data: {
              roomCode,
              title: title.trim(),
              createdById: user.id,
              participants: { create: { userId: user.id } },
            },
          }),
        isUniqueViolation,
      );
    } catch (error) {
      if (error instanceof RoomCodeExhaustedError) {
        throw new ServiceUnavailableException('No room code is available right now. Try again shortly.');
      }
      throw error;
    }
    await this.livekit.ensureRoom(meeting.id, this.livekitCapacity());
    await this.audit.log({ action: 'meeting.created', actorId: user.id, targetType: 'meeting', targetId: meeting.id, ip });
    return this.toDto(meeting, user, { isHost: true });
  }

  async joinByCode(user: AuthUser, rawCode: string, ip: string): Promise<{ meetingId: string }> {
    const limits = [this.rateLimit.userLimit('code-user', user.id), this.rateLimit.ipLimit('code-ip', ip)];
    try {
      await this.rateLimit.assertNotLocked(limits);
    } catch (error) {
      if (error instanceof TooManyAttemptsException) {
        await this.audit.log({ action: 'meeting.code_rate_limited', actorId: user.id, ip, success: false });
      }
      throw error;
    }

    const code = typeof rawCode === 'string' ? rawCode.trim() : '';
    const meeting = isValidRoomCode(code)
      ? await this.prisma.meeting.findFirst({ where: { roomCode: code, status: 'ACTIVE' } })
      : null;

    if (!meeting) {
      const lockoutSeconds = await this.rateLimit.recordFailure(limits);
      await this.audit.log({
        action: 'meeting.code_rejected',
        actorId: user.id,
        ip,
        success: false,
        metadata: { lockoutSeconds },
      });
      throw new NotFoundException(INVALID_CODE_MESSAGE);
    }

    const existing = await this.prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId: meeting.id, userId: user.id } },
    });
    if (existing?.revokedAt) {
      await this.audit.log({
        action: 'meeting.revoked_rejoin_blocked',
        actorId: user.id,
        targetType: 'meeting',
        targetId: meeting.id,
        ip,
        success: false,
      });
      throw new ForbiddenException('You were removed from this meeting and cannot rejoin.');
    }
    if (!existing) {
      await this.prisma.meetingParticipant.create({ data: { meetingId: meeting.id, userId: user.id } });
    }
    await this.rateLimit.recordSuccess([limits[0]]);
    await this.audit.log({ action: 'meeting.code_accepted', actorId: user.id, targetType: 'meeting', targetId: meeting.id, ip });
    return { meetingId: meeting.id };
  }

  async listMine(user: AuthUser) {
    const meetings = await this.prisma.meeting.findMany({
      where: {
        OR: [{ createdById: user.id }, { participants: { some: { userId: user.id, revokedAt: null } } }],
      },
      include: { createdBy: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return meetings.map((m) => this.toDto(m, user, { isHost: canManageMeeting(user, m), hostName: m.createdBy.displayName }));
  }

  async get(user: AuthUser, meetingId: string) {
    const { meeting } = await this.loadAccessible(user, meetingId);
    const host = await this.prisma.user.findUnique({ where: { id: meeting.createdById }, select: { displayName: true } });
    const activeRecording = await this.prisma.recording.findFirst({
      where: { meetingId, status: { in: ['REQUESTED', 'STARTING', 'RECORDING', 'STOPPING', 'FINALIZING'] } },
      select: { id: true, status: true, startedAt: true },
    });
    return {
      ...this.toDto(meeting, user, { isHost: canManageMeeting(user, meeting), hostName: host?.displayName }),
      activeRecording,
      maxParticipants: this.config.limits.maxParticipantsPerRoom,
    };
  }

  async issueToken(user: AuthUser, meetingId: string, ip: string) {
    const { meeting } = await this.loadAccessible(user, meetingId);
    if (meeting.status !== 'ACTIVE') throw new ConflictException('This meeting has ended.');

    // Capacity is enforced here (LiveKit's own limit is set slightly higher to leave room for the recorder).
    const connected = await this.livekit.listHumanParticipants(meeting.id);
    const others = connected.filter((p) => p.identity !== user.id);
    if (others.length >= this.config.limits.maxParticipantsPerRoom) {
      await this.audit.log({ action: 'meeting.full', actorId: user.id, targetType: 'meeting', targetId: meeting.id, ip, success: false });
      throw new ConflictException(`This meeting is full (${this.config.limits.maxParticipantsPerRoom} participants).`);
    }

    await this.livekit.ensureRoom(meeting.id, this.livekitCapacity());
    const isHost = canManageMeeting(user, meeting);
    const token = await this.livekit.issueToken({
      room: meeting.id,
      identity: user.id,
      name: user.displayName,
      metadata: { role: isHost ? 'host' : 'participant' },
    });
    await this.audit.log({ action: 'meeting.token_issued', actorId: user.id, targetType: 'meeting', targetId: meeting.id, ip });
    return { token, url: this.livekit.publicUrl, isHost };
  }

  async end(user: AuthUser, meetingId: string, ip: string) {
    const meeting = await this.loadManageable(user, meetingId);
    if (meeting.status === 'ENDED') return this.toDto(meeting, user, { isHost: true });
    const ended = await this.prisma.meeting.update({
      where: { id: meeting.id },
      data: { status: 'ENDED', endedAt: new Date() },
    });
    await this.recordings.stopAllForMeeting(meeting.id, user, ip);
    await this.livekit.deleteRoom(meeting.id);
    await this.audit.log({ action: 'meeting.ended', actorId: user.id, targetType: 'meeting', targetId: meeting.id, ip });
    return this.toDto(ended, user, { isHost: true });
  }

  async removeParticipant(user: AuthUser, meetingId: string, targetUserId: string, ip: string) {
    const meeting = await this.loadManageable(user, meetingId);
    if (targetUserId === user.id) throw new BadRequestException('You cannot remove yourself.');
    if (targetUserId === meeting.createdById) throw new BadRequestException('The meeting host cannot be removed.');
    await this.prisma.meetingParticipant.upsert({
      where: { meetingId_userId: { meetingId, userId: targetUserId } },
      create: { meetingId, userId: targetUserId, revokedAt: new Date(), revokedById: user.id },
      update: { revokedAt: new Date(), revokedById: user.id },
    });
    await this.livekit.removeParticipant(meetingId, targetUserId);
    await this.audit.log({
      action: 'meeting.participant_removed',
      actorId: user.id,
      targetType: 'meeting',
      targetId: meetingId,
      ip,
      metadata: { userId: targetUserId },
    });
  }

  async muteParticipant(user: AuthUser, meetingId: string, targetUserId: string, ip: string) {
    const meeting = await this.loadManageable(user, meetingId);
    if (meeting.status !== 'ACTIVE') throw new ConflictException('This meeting has ended.');
    const muted = await this.livekit.muteMicrophone(meetingId, targetUserId);
    if (muted > 0) {
      await this.livekit.sendToParticipant(meetingId, targetUserId, 'moderation', {
        type: 'muted_by_host',
        by: user.displayName,
      });
    }
    await this.audit.log({
      action: 'meeting.participant_muted',
      actorId: user.id,
      targetType: 'meeting',
      targetId: meetingId,
      ip,
      metadata: { userId: targetUserId, tracks: muted },
    });
    return { muted };
  }

  /** Used by the webhook: called whenever LiveKit reports a participant joining a meeting room. */
  async onParticipantJoined(meetingId: string, userId: string): Promise<'ok' | 'rejected'> {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) return 'rejected';
    const [participant, user] = await Promise.all([
      this.prisma.meetingParticipant.findUnique({ where: { meetingId_userId: { meetingId, userId } } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, role: true } }),
    ]);
    const allowed =
      meeting.status === 'ACTIVE' &&
      !!user?.isActive &&
      canAccessMeeting({ id: userId, role: user.role }, meeting, participant);
    if (!allowed) {
      // A still-valid token cannot be revoked in LiveKit, so evict anyone who should no longer be here.
      await this.livekit.removeParticipant(meetingId, userId);
      if (meeting.status === 'ENDED') await this.livekit.deleteRoom(meetingId);
      await this.audit.log({
        action: 'meeting.unauthorized_join_evicted',
        actorId: userId,
        targetType: 'meeting',
        targetId: meetingId,
        success: false,
      });
      return 'rejected';
    }
    const now = new Date();
    await this.prisma.meetingParticipant.upsert({
      where: { meetingId_userId: { meetingId, userId } },
      create: { meetingId, userId, firstJoinedAt: now, lastJoinedAt: now },
      update: { firstJoinedAt: participant?.firstJoinedAt ?? now, lastJoinedAt: now },
    });
    return 'ok';
  }

  async loadAccessible(user: AuthUser, meetingId: string): Promise<{ meeting: Meeting; participant: MeetingParticipant | null }> {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    const participant = await this.prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId, userId: user.id } },
    });
    if (!canAccessMeeting(user, meeting, participant)) throw new NotFoundException('Meeting not found');
    return { meeting, participant };
  }

  private async loadManageable(user: AuthUser, meetingId: string): Promise<Meeting> {
    const { meeting } = await this.loadAccessible(user, meetingId);
    if (!canManageMeeting(user, meeting)) throw new ForbiddenException('Only the meeting host can do this.');
    return meeting;
  }

  /** LiveKit hard cap: the app limit plus headroom for the recorder and a reconnecting duplicate. */
  private livekitCapacity(): number {
    return this.config.limits.maxParticipantsPerRoom + 2;
  }

  private toDto(meeting: Meeting, _user: AuthUser, extra: { isHost: boolean; hostName?: string }) {
    return {
      id: meeting.id,
      roomCode: meeting.roomCode,
      title: meeting.title,
      status: meeting.status,
      createdAt: meeting.createdAt,
      endedAt: meeting.endedAt,
      hostId: meeting.createdById,
      hostName: extra.hostName,
      isHost: extra.isHost,
    };
  }
}
