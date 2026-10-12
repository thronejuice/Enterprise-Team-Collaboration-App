import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Meeting, Recording, RecordingStatus } from '@prisma/client';
import { EgressInfo, EncodedFileOutput, EncodedFileType, EncodingOptionsPreset } from 'livekit-server-sdk';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, AppConfig } from '../config';
import { AuditService } from '../audit/audit.service';
import { isUniqueViolation, PrismaService } from '../common/prisma.service';
import { AuthUser } from '../common/request';
import { isNotFound, LiveKitService } from '../livekit/livekit.service';
import { canManageMeeting, canViewRecordings } from '../meetings/access';
import { IN_FLIGHT_STATUSES, nextStatus, statusFromEgress, TERMINAL_STATUSES } from './recording-state';
import { StorageService } from './storage.service';

/** Arbitrary constant key for the advisory lock that serialises "start recording" across API instances. */
const START_LOCK_KEY = 72_011;
/** How long a recording may stay FINALIZING while we wait for the object to appear in storage. */
const FINALIZE_GRACE_MS = 5 * 60_000;
/** A REQUESTED row without an egress job after this long means the start call never completed. */
const REQUESTED_TIMEOUT_MS = 2 * 60_000;

const nsToDate = (ns: bigint | undefined) => (ns && ns > 0n ? new Date(Number(ns / 1_000_000n)) : undefined);
const nsToMs = (ns: bigint | undefined) => (ns && ns > 0n ? Number(ns / 1_000_000n) : undefined);

type RecordingWithMeeting = Recording & { meeting: Meeting; requestedBy?: { displayName: string } };

@Injectable()
export class RecordingsService {
  private readonly logger = new Logger(RecordingsService.name);
  private reconciling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async start(user: AuthUser, meetingId: string, ip: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (!canManageMeeting(user, meeting)) throw new ForbiddenException('Only the meeting host can record.');
    if (meeting.status !== 'ACTIVE') throw new ConflictException('This meeting has ended.');
    const present = await this.livekit.listHumanParticipants(meetingId);
    if (present.length === 0) throw new ConflictException('Nobody is connected to the meeting yet.');

    let recording: Recording;
    try {
      recording = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(${START_LOCK_KEY})`;
        const inFlight = await tx.recording.count({ where: { status: { in: IN_FLIGHT_STATUSES }, deletedAt: null } });
        if (inFlight >= this.config.limits.maxConcurrentRecordings) {
          throw new ConflictException('Another recording is already in progress. Stop it before starting a new one.');
        }
        const id = randomUUID();
        return tx.recording.create({
          data: { id, meetingId, requestedById: user.id, objectKey: `meetings/${meetingId}/${id}.mp4` },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('This meeting is already being recorded.');
      throw error;
    }

    try {
      const preset = EncodingOptionsPreset[this.config.recording.preset as keyof typeof EncodingOptionsPreset];
      const info = await this.livekit.egress.startRoomCompositeEgress(
        meetingId,
        new EncodedFileOutput({ fileType: EncodedFileType.MP4, filepath: recording.objectKey }),
        { layout: this.config.recording.layout, encodingOptions: preset ?? EncodingOptionsPreset.H264_720P_30 },
      );
      recording = await this.prisma.recording.update({
        where: { id: recording.id },
        data: { egressJobId: info.egressId, status: nextStatus('REQUESTED', statusFromEgress(info.status)) ?? 'STARTING' },
      });
    } catch (error) {
      const message = (error as Error).message || 'Egress did not accept the request';
      await this.prisma.recording.update({
        where: { id: recording.id },
        data: { status: 'FAILED', errorMessage: `Could not start recording: ${message}`, endedAt: new Date() },
      });
      await this.audit.log({
        action: 'recording.start_failed',
        actorId: user.id,
        targetType: 'recording',
        targetId: recording.id,
        ip,
        success: false,
        metadata: { meetingId, error: message },
      });
      throw new ServiceUnavailableException(`Could not start recording: ${message}`);
    }

    await this.audit.log({
      action: 'recording.started',
      actorId: user.id,
      targetType: 'recording',
      targetId: recording.id,
      ip,
      metadata: { meetingId, egressId: recording.egressJobId },
    });
    return this.toDto({ ...recording, meeting }, user);
  }

  async stop(user: AuthUser, recordingId: string, ip: string) {
    const recording = await this.loadWithMeeting(recordingId);
    if (!canManageMeeting(user, recording.meeting)) throw new ForbiddenException('Only the meeting host can stop recording.');
    const updated = await this.stopOne(recording);
    await this.audit.log({
      action: 'recording.stopped',
      actorId: user.id,
      targetType: 'recording',
      targetId: recording.id,
      ip,
      metadata: { meetingId: recording.meetingId },
    });
    return this.toDto({ ...updated, meeting: recording.meeting }, user);
  }

  async stopAllForMeeting(meetingId: string, user: AuthUser, ip: string): Promise<void> {
    const active = await this.prisma.recording.findMany({
      where: { meetingId, status: { in: IN_FLIGHT_STATUSES } },
      include: { meeting: true },
    });
    for (const recording of active) {
      await this.stopOne(recording).catch((e) => this.logger.warn(`stop ${recording.id}: ${(e as Error).message}`));
      await this.audit.log({
        action: 'recording.stopped',
        actorId: user.id,
        targetType: 'recording',
        targetId: recording.id,
        ip,
        metadata: { meetingId, reason: 'meeting_ended' },
      });
    }
  }

  private async stopOne(recording: Recording): Promise<Recording> {
    if (!['REQUESTED', 'STARTING', 'RECORDING'].includes(recording.status)) return recording;
    if (!recording.egressJobId) {
      return this.prisma.recording.update({
        where: { id: recording.id },
        data: { status: 'FAILED', errorMessage: 'Stopped before the recorder started.', endedAt: new Date() },
      });
    }
    try {
      const info = await this.livekit.egress.stopEgress(recording.egressJobId);
      return (await this.applyEgressInfo(info)) ?? recording;
    } catch (error) {
      // The egress may have already finished (e.g. room closed); let reconciliation settle the state.
      if (!isNotFound(error) && !/cannot be stopped|already|not active/i.test((error as Error).message)) throw error;
      return this.prisma.recording.update({ where: { id: recording.id }, data: { status: 'STOPPING' } });
    }
  }

  /** Applies an Egress status update from a webhook, a stop call or reconciliation. */
  async applyEgressInfo(info: EgressInfo): Promise<Recording | null> {
    let recording = await this.prisma.recording.findUnique({ where: { egressJobId: info.egressId } });
    // The webhook for a fresh egress can beat the start() call that stores its id.
    for (let attempt = 0; !recording && attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 300));
      recording = await this.prisma.recording.findUnique({ where: { egressJobId: info.egressId } });
    }
    if (!recording) {
      this.logger.warn(`Egress ${info.egressId} does not match any recording`);
      return null;
    }

    const target = statusFromEgress(info.status);
    const next = nextStatus(recording.status, target);
    if (!next) return recording;

    const file = info.fileResults[0];
    const updated = await this.prisma.recording.update({
      where: { id: recording.id },
      data: {
        status: next,
        startedAt: recording.startedAt ?? nsToDate(info.startedAt) ?? (next === 'RECORDING' ? new Date() : undefined),
        endedAt: next === 'FINALIZING' || next === 'FAILED' ? (nsToDate(info.endedAt) ?? new Date()) : undefined,
        durationMs: file ? (nsToMs(file.duration) ?? recording.durationMs) : recording.durationMs,
        objectKey: file?.filename ? file.filename : recording.objectKey,
        errorMessage: next === 'FAILED' ? info.error || 'Recording failed' : undefined,
      },
    });

    if (next === 'FAILED') {
      await this.audit.log({
        action: 'recording.failed',
        targetType: 'recording',
        targetId: recording.id,
        success: false,
        metadata: { meetingId: recording.meetingId, error: info.error },
      });
    }
    if (next === 'FINALIZING') return this.verifyOutput(updated);
    return updated;
  }

  /** A recording is only COMPLETED once its file exists in storage and is non-empty. */
  private async verifyOutput(recording: Recording): Promise<Recording> {
    let size: number | null = null;
    try {
      size = await this.storage.size(recording.objectKey);
    } catch (error) {
      this.logger.warn(`Storage check for ${recording.id} failed: ${(error as Error).message}`);
    }
    if (size && size > 0) {
      const done = await this.prisma.recording.update({
        where: { id: recording.id },
        data: { status: 'COMPLETED', fileSize: BigInt(size) },
      });
      await this.audit.log({
        action: 'recording.completed',
        targetType: 'recording',
        targetId: recording.id,
        metadata: { meetingId: recording.meetingId, fileSize: size, durationMs: recording.durationMs },
      });
      return done;
    }
    const since = (recording.endedAt ?? recording.updatedAt).getTime();
    if (Date.now() - since > FINALIZE_GRACE_MS) {
      const failed = await this.prisma.recording.update({
        where: { id: recording.id },
        data: { status: 'FAILED', errorMessage: 'The recorder finished but no output file was found in storage.' },
      });
      await this.audit.log({
        action: 'recording.failed',
        targetType: 'recording',
        targetId: recording.id,
        success: false,
        metadata: { meetingId: recording.meetingId, error: 'output_missing' },
      });
      return failed;
    }
    return recording;
  }

  /** Recovers from missed webhooks and API restarts. */
  @Interval(15_000)
  async reconcile(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const pending = await this.prisma.recording.findMany({ where: { status: { in: IN_FLIGHT_STATUSES } } });
      for (const recording of pending) {
        try {
          if (recording.status === 'FINALIZING') {
            await this.verifyOutput(recording);
          } else if (!recording.egressJobId) {
            if (Date.now() - recording.createdAt.getTime() > REQUESTED_TIMEOUT_MS) {
              await this.prisma.recording.update({
                where: { id: recording.id },
                data: { status: 'FAILED', errorMessage: 'The recorder never started.', endedAt: new Date() },
              });
            }
          } else {
            const [info] = await this.livekit.egress.listEgress({ egressId: recording.egressJobId });
            if (info) await this.applyEgressInfo(info);
          }
        } catch (error) {
          this.logger.warn(`Reconcile ${recording.id}: ${(error as Error).message}`);
        }
      }
    } finally {
      this.reconciling = false;
    }
  }

  async list(user: AuthUser, meetingId?: string) {
    const recordings = await this.prisma.recording.findMany({
      where: {
        deletedAt: null,
        ...(meetingId ? { meetingId } : {}),
        ...(user.role === 'ADMIN'
          ? {}
          : {
              meeting: {
                OR: [
                  { hostId: user.id },
                  { participants: { some: { userId: user.id, revokedAt: null, firstJoinedAt: { not: null } } } },
                ],
              },
            }),
      },
      include: { meeting: true, requestedBy: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return recordings.map((r) => this.toDto(r, user));
  }

  async get(user: AuthUser, recordingId: string, ip: string) {
    const recording = await this.loadViewable(user, recordingId, ip);
    return this.toDto(recording, user);
  }

  async loadViewable(user: AuthUser, recordingId: string, ip: string): Promise<RecordingWithMeeting> {
    const recording = await this.loadWithMeeting(recordingId);
    const participant = await this.prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId: recording.meetingId, userId: user.id } },
    });
    if (!canViewRecordings(user, recording.meeting, participant)) {
      await this.audit.log({
        action: 'recording.access_denied',
        actorId: user.id,
        targetType: 'recording',
        targetId: recording.id,
        ip,
        success: false,
      });
      throw new ForbiddenException('You do not have access to this recording.');
    }
    return recording;
  }

  async delete(user: AuthUser, recordingId: string, ip: string): Promise<void> {
    const recording = await this.loadWithMeeting(recordingId);
    if (!canManageMeeting(user, recording.meeting)) throw new ForbiddenException('Only the meeting host can delete recordings.');
    if (!TERMINAL_STATUSES.includes(recording.status)) {
      throw new ConflictException('Stop the recording and wait for it to finish before deleting it.');
    }
    await this.storage.delete(recording.objectKey).catch((error) => {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status !== 404) throw error;
    });
    await this.prisma.recording.update({ where: { id: recording.id }, data: { deletedAt: new Date(), deletedById: user.id } });
    await this.audit.log({
      action: 'recording.deleted',
      actorId: user.id,
      targetType: 'recording',
      targetId: recording.id,
      ip,
      metadata: { meetingId: recording.meetingId, objectKey: recording.objectKey },
    });
  }

  private async loadWithMeeting(recordingId: string): Promise<RecordingWithMeeting> {
    const recording = await this.prisma.recording.findUnique({
      where: { id: recordingId },
      include: { meeting: true, requestedBy: { select: { displayName: true } } },
    });
    if (!recording || recording.deletedAt) throw new NotFoundException('Recording not found');
    return recording;
  }

  toDto(r: RecordingWithMeeting, user: AuthUser) {
    return {
      id: r.id,
      meetingId: r.meetingId,
      meetingTitle: r.meeting.title,
      roomCode: r.meeting.roomCode,
      status: r.status as RecordingStatus,
      requestedBy: r.requestedBy?.displayName,
      createdAt: r.createdAt,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      durationMs: r.durationMs,
      fileSize: r.fileSize === null ? null : Number(r.fileSize),
      errorMessage: r.errorMessage,
      canManage: canManageMeeting(user, r.meeting),
    };
  }
}
