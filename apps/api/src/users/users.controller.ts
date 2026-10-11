import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { isUniqueViolation, PrismaService } from '../common/prisma.service';
import { AuthUser, ClientIp, CurrentUser } from '../common/request';
import { Roles } from '../auth/auth.decorators';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../auth/passwords';
import { SessionService } from '../auth/session.service';
import { LiveKitService } from '../livekit/livekit.service';

class CreateUserDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(200)
  password: string;
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class ResetPasswordDto {
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(200)
  password: string;
}

const userSelect = { id: true, email: true, displayName: true, role: true, isActive: true, createdAt: true } as const;

@Controller('admin/users')
@Roles('ADMIN')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly livekit: LiveKitService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.prisma.user.findMany({ select: userSelect, orderBy: { createdAt: 'asc' } });
  }

  @Post()
  async create(@CurrentUser() admin: AuthUser, @Body() dto: CreateUserDto, @ClientIp() ip: string) {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email.trim().toLowerCase(),
          displayName: dto.displayName.trim(),
          role: dto.role,
          passwordHash: await hashPassword(dto.password),
        },
        select: userSelect,
      });
      await this.audit.log({ action: 'user.created', actorId: admin.id, targetType: 'user', targetId: user.id, ip, metadata: { role: user.role } });
      return user;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('A user with this email already exists.');
      throw error;
    }
  }

  @Patch(':id')
  async update(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @ClientIp() ip: string) {
    if (id === admin.id && (dto.isActive === false || (dto.role && dto.role !== 'ADMIN'))) {
      throw new BadRequestException('You cannot disable or demote your own account.');
    }
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');
    const user = await this.prisma.user.update({
      where: { id },
      data: { displayName: dto.displayName?.trim(), role: dto.role, isActive: dto.isActive },
      select: userSelect,
    });
    if (dto.isActive === false && existing.isActive) {
      await this.sessions.destroyAllForUser(id);
      await this.evictFromActiveMeetings(id);
    }
    await this.audit.log({
      action: 'user.updated',
      actorId: admin.id,
      targetType: 'user',
      targetId: id,
      ip,
      metadata: { changes: dto },
    });
    return user;
  }

  @Post(':id/reset-password')
  @HttpCode(204)
  async resetPassword(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetPasswordDto, @ClientIp() ip: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(dto.password) } });
    await this.sessions.destroyAllForUser(id);
    await this.audit.log({ action: 'user.password_reset', actorId: admin.id, targetType: 'user', targetId: id, ip });
  }

  private async evictFromActiveMeetings(userId: string): Promise<void> {
    const meetings = await this.prisma.meeting.findMany({
      where: { status: 'ACTIVE', OR: [{ createdById: userId }, { participants: { some: { userId } } }] },
      select: { id: true },
    });
    for (const meeting of meetings) {
      await this.livekit.removeParticipant(meeting.id, userId).catch(() => undefined);
    }
  }
}
