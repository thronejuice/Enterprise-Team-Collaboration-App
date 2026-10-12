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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Prisma } from '@prisma/client';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import type {} from 'multer'; // brings Express.Multer.File into scope
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';
import { AuthUser, ClientIp, CurrentUser } from '../common/request';
import { AVATAR_MAX_BYTES, AvatarService } from './avatar.service';
import { DIRECTORY_PAGE_SIZE, DISPLAY_NAME_MAX, normalizePhone, requiredText } from './profile';
import { directoryView, profileView, userInclude } from './views';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(DISPLAY_NAME_MAX)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;
}

/** Self-service profile, avatar, People directory and department list (any signed-in user). */
@Controller()
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly avatars: AvatarService,
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
    const row = await this.prisma.user.update({ where: { id: user.id }, data, include: userInclude });
    const fields = Object.keys(data);
    if (fields.length > 0) await this.audit.log({ action: 'profile.updated', actorId: user.id, targetType: 'user', targetId: user.id, ip, metadata: { fields } });
    return profileView(row);
  }

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } }))
  async uploadMyAvatar(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined, @ClientIp() ip: string) {
    if (!file) throw new BadRequestException('Attach an image in the "file" field.');
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
  async directory(@Query('q') q?: string, @Query('departmentId') departmentId?: string, @Query('page') pageRaw?: string) {
    const page = Math.max(Number.parseInt(pageRaw ?? '1', 10) || 1, 1);
    const term = q?.trim();
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
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return bytes;
  }

  /** Active departments, for dropdowns and the directory filter. */
  @Get('departments')
  async activeDepartments() {
    return this.prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }
}
