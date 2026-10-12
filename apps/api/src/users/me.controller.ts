import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Prisma } from '@prisma/client';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Response } from 'express';
import type {} from 'multer'; // brings Express.Multer.File into scope
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';
import { AuthUser, ClientIp, CurrentUser } from '../common/request';
import { RateLimitService } from '../auth/rate-limit.service';
import { AVATAR_MAX_BYTES, AvatarService } from './avatar.service';
import { DirectoryQuery } from './queries';
import { PRIVACY_NOTICE_VERSION } from '../common/privacy';
import { DIRECTORY_PAGE_SIZE, DISPLAY_NAME_MAX, normalizePhone, requiredText } from './profile';
import { directoryView, profileView, userInclude } from './views';

const AVATAR_ATTEMPTS = 10;
const AVATAR_LOCKOUT_SECONDS = 10 * 60;

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(DISPLAY_NAME_MAX)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  /** Own department, chosen from the active list. null clears it. */
  @IsOptional()
  @IsUUID()
  departmentId?: string | null;
}

/** Self-service profile, avatar, People directory and department list (any signed-in user). */
@Controller()
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly avatars: AvatarService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get('me/profile')
  async myProfile(@CurrentUser() user: AuthUser) {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: userInclude });
    return profileView(row);
  }

  /** Only displayName and phone. Any other key is rejected by the global ValidationPipe (400). */
  @Patch('me/profile')
  async updateMyProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto, @ClientIp() ip: string) {
    const data: Prisma.UserUpdateInput = {};
    try {
      if (dto.displayName !== undefined) data.displayName = requiredText('Display name', dto.displayName, DISPLAY_NAME_MAX);
      if (dto.phone !== undefined) data.phone = normalizePhone(dto.phone);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    if (dto.departmentId !== undefined) {
      if (dto.departmentId) {
        const department = await this.prisma.department.findUnique({ where: { id: dto.departmentId }, select: { isActive: true } });
        if (!department?.isActive) throw new BadRequestException('Choose an active department.');
      }
      data.department = dto.departmentId ? { connect: { id: dto.departmentId } } : { disconnect: true };
    }
    const row = await this.prisma.user.update({ where: { id: user.id }, data, include: userInclude });
    const fields = Object.keys(data);
    if (fields.length > 0) await this.audit.log({ action: 'profile.updated', actorId: user.id, targetType: 'user', targetId: user.id, ip, metadata: { fields } });
    return profileView(row);
  }

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 0, parts: 1 } }))
  async uploadMyAvatar(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined, @ClientIp() ip: string) {
    if (!file) throw new BadRequestException('Attach an image in the "file" field.');
    // Every attempt counts (valid or not): 10 per rate-limit window, then a 10 minute lock.
    const limit = { scope: 'avatar-user', key: user.id, maxFailures: AVATAR_ATTEMPTS, lockoutSeconds: [AVATAR_LOCKOUT_SECONDS] };
    await this.rateLimit.assertNotLocked([limit]);
    await this.rateLimit.recordFailure([limit]);
    const normalized = await this.avatars.normalize(file.buffer);
    const key = await this.avatars.upload(user.id, normalized);
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { avatarKey: true } });
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { avatarKey: key, avatarUpdatedAt: new Date() } });
    await this.avatars.remove(before.avatarKey);
    await this.audit.log({ action: 'profile.avatar_updated', actorId: user.id, targetType: 'user', targetId: user.id, ip });
    return { avatarVersion: updated.avatarUpdatedAt?.getTime() ?? null };
  }

  @Delete('me/avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMyAvatar(@CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { avatarKey: true } });
    await this.prisma.user.update({ where: { id: user.id }, data: { avatarKey: null, avatarUpdatedAt: null } });
    await this.avatars.remove(before.avatarKey);
    await this.audit.log({ action: 'profile.avatar_removed', actorId: user.id, targetType: 'user', targetId: user.id, ip });
  }

  /** Active, non-anonymized accounts only. Phone, employee ID, role and suspension state are never included. */
  @Get('directory')
  async directory(@Query() query: DirectoryQuery) {
    const { departmentId } = query;
    const page = query.page ?? 1;
    const term = query.q?.trim();
    const where: Prisma.UserWhereInput = {
      isActive: true,
      anonymizedAt: null,
      ...(departmentId ? { departmentId } : {}),
      ...(term
        ? {
            OR: [
              { displayName: { contains: term, mode: 'insensitive' } },
              { firstName: { contains: term, mode: 'insensitive' } },
              { lastName: { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: userInclude,
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * DIRECTORY_PAGE_SIZE,
        take: DIRECTORY_PAGE_SIZE,
      }),
    ]);
    return { items: rows.map(directoryView), total, page, pageSize: DIRECTORY_PAGE_SIZE };
  }

  @Get('users/:id')
  async publicProfile(@Param('id', ParseUUIDPipe) id: string) {
    const row = await this.prisma.user.findFirst({ where: { id, isActive: true, anonymizedAt: null }, include: userInclude });
    if (!row) throw new NotFoundException('User not found');
    return directoryView(row);
  }

  /** Avatar bytes go through the API only (the bucket is private). Cached privately for a day; ?v= busts the cache. */
  @Get('users/:id/avatar')
  async avatar(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const user = await this.prisma.user.findFirst({ where: { id, isActive: true, anonymizedAt: null }, select: { avatarKey: true } });
    const bytes = user?.avatarKey ? await this.avatars.read(user.avatarKey) : null;
    if (!bytes) throw new NotFoundException('No avatar');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    // A raw Buffer would be serialised as JSON; StreamableFile sends the image bytes.
    return new StreamableFile(bytes, { type: 'image/webp' });
  }

  /** PDPA access request: everything the system holds about the signed-in user, as one JSON file. */
  @Get('me/data-export')
  async myDataExport(@CurrentUser() user: AuthUser, @ClientIp() ip: string, @Res({ passthrough: true }) res: Response) {
    const [profile, hosted, participations, recordings, notifications, audit] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: userInclude }),
      this.prisma.meeting.findMany({ where: { createdById: user.id }, select: { id: true, title: true, status: true, createdAt: true, endedAt: true } }),
      this.prisma.meetingParticipant.findMany({
        where: { userId: user.id },
        select: { admittedAt: true, firstJoinedAt: true, lastJoinedAt: true, revokedAt: true, meeting: { select: { id: true, title: true, createdAt: true } } },
      }),
      this.prisma.recording.findMany({ where: { requestedById: user.id }, select: { id: true, status: true, createdAt: true, deletedAt: true } }),
      this.prisma.notification.findMany({ where: { userId: user.id }, select: { kind: true, title: true, body: true, createdAt: true, readAt: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.auditLog.findMany({
        where: { OR: [{ actorId: user.id }, { targetType: 'user', targetId: user.id }] },
        select: { createdAt: true, action: true, success: true, metadata: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const exported = {
      exportedAt: new Date().toISOString(),
      profile: profileView(profile),
      privacyNoticeAcceptedVersion: profile.privacyNoticeVersion,
      currentPrivacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      meetingsCreated: hosted,
      meetingsJoined: participations.map((p) => ({ ...p.meeting, ...{ admittedAt: p.admittedAt, firstJoinedAt: p.firstJoinedAt, lastJoinedAt: p.lastJoinedAt, revokedAt: p.revokedAt } })),
      recordingsRequested: recordings,
      notifications,
      activityLog: audit,
    };
    await this.audit.log({ action: 'me.data_exported', actorId: user.id, targetType: 'user', targetId: user.id, ip });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    return JSON.stringify(exported, null, 2);
  }

  /** Active departments, for dropdowns and the directory filter. */
  @Get('departments')
  async activeDepartments() {
    return this.prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }
}
