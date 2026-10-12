import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
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
import { SuspensionReason, UserRole } from '@prisma/client';
import { SORTS, StatusFilter, UserListQuery } from './queries';
import type { Prisma } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import type {} from 'multer'; // brings Express.Multer.File into scope
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Roles } from '../auth/auth.decorators';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../auth/passwords';
import { SessionService } from '../auth/session.service';
import { coded } from '../common/errors';
import { isUniqueViolation, PrismaService } from '../common/prisma.service';
import { AuthUser, ClientIp, CurrentUser } from '../common/request';
import { AvatarService } from './avatar.service';
import { ImportService, IMPORT_MAX_BYTES } from './import.service';
import { accountStatus, asBadRequest, avatarVersionOf, CSV_BOM, csvLine, NAME_MAX, normalizeEmail, normalizeEmployeeId, normalizePhone, optionalText, requiredText, USERS_PAGE_SIZE } from './profile';
import { assertAdminRemains, SuspensionService } from './suspension.service';
import { departmentView, profileView, userInclude, UserWithDepartment } from './views';

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

  @IsString()
  @MaxLength(32)
  employeeId: string;

  @IsOptional()
  @IsString()
  @MaxLength(NAME_MAX)
  firstName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(NAME_MAX)
  lastName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(NAME_MAX)
  jobTitle?: string | null;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(NAME_MAX)
  firstName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(NAME_MAX)
  lastName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(NAME_MAX)
  jobTitle?: string | null;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  employeeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

class ResetPasswordDto {
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(200)
  password: string;
}

class SuspendDto {
  @IsEnum(SuspensionReason)
  reason: SuspensionReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** "now", or the last working day as YYYY-MM-DD (checked in detail by effectiveAtFor). */
  @Matches(/^(now|\d{4}-\d{2}-\d{2})$/, { message: 'effective must be "now" or a YYYY-MM-DD date' })
  effective: 'now' | string;

  @IsOptional()
  @IsUUID()
  handoverToId?: string;
}

class ReactivateDto {
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(200)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class AnonymizeDto {
  @IsString()
  @MaxLength(254)
  confirmEmail: string;
}

class CommitImportDto {
  @IsUUID()
  importId: string;
}

/** Filters shared by the table and the CSV export, so both show the same people. */
export function buildUserWhere(filters: Pick<UserListQuery, 'q' | 'role' | 'status' | 'departmentId'>): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [];
  const q = filters.q?.trim();
  if (q) {
    and.push({
      OR: [
        { displayName: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { employeeId: { contains: q.toUpperCase() } },
      ],
    });
  }
  if (filters.role) and.push({ role: filters.role });
  if (filters.departmentId) and.push({ departmentId: filters.departmentId });
  if (filters.status) and.push(statusWhere(filters.status));
  return and.length ? { AND: and } : {};
}

function statusWhere(status: StatusFilter): Prisma.UserWhereInput {
  switch (status) {
    case 'ANONYMIZED':
      return { anonymizedAt: { not: null } };
    case 'SUSPENDED':
      return { isActive: false, anonymizedAt: null };
    case 'LEAVING':
      return { isActive: true, anonymizedAt: null, suspensions: { some: { status: 'SCHEDULED' } } };
    case 'ACTIVE':
      return { isActive: true, anonymizedAt: null, suspensions: { none: { status: 'SCHEDULED' } } };
  }
}

const openSuspensionSelect = {
  where: { status: { in: ['SCHEDULED', 'ACTIVE'] as ('SCHEDULED' | 'ACTIVE')[] } },
  orderBy: { createdAt: 'desc' },
  take: 1,
  select: { reason: true, status: true, effectiveAt: true },
} as const;

@Controller('admin/users')
@Roles('ADMIN')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly avatars: AvatarService,
    private readonly suspensions: SuspensionService,
    private readonly imports: ImportService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  async list(@Query() query: UserListQuery) {
    const page = query.page ?? 1;
    const where = buildUserWhere(query);
    const orderBy = SORTS[query.sort ?? 'createdAt'];
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy,
        skip: (page - 1) * USERS_PAGE_SIZE,
        take: USERS_PAGE_SIZE,
        include: { ...userInclude, suspensions: openSuspensionSelect },
      }),
    ]);
    return { items: rows.map(adminRow), total, page, pageSize: USERS_PAGE_SIZE };
  }

  // Static routes first: the parameterised `:id` routes below would otherwise swallow them.

  @Get('export.csv')
  async exportCsv(
    @Query() query: UserListQuery,
    @CurrentUser() admin: AuthUser,
    @ClientIp() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.prisma.user.findMany({
      where: buildUserWhere(query),
      orderBy: SORTS[query.sort ?? 'createdAt'],
      include: { ...userInclude, suspensions: openSuspensionSelect },
    });
    const header = ['employee_id', 'email', 'display_name', 'first_name', 'last_name', 'job_title', 'department', 'phone', 'role', 'status', 'suspension_reason', 'effective_at', 'last_login_at', 'created_at'];
    const lines = [csvLine(header)];
    for (const user of rows) {
      const open = user.suspensions[0];
      lines.push(
        csvLine([
          user.employeeId,
          user.email,
          user.displayName,
          user.firstName,
          user.lastName,
          user.jobTitle,
          user.department?.name,
          user.phone,
          user.role,
          accountStatus(user, user.suspensions.some((s) => s.status === 'SCHEDULED')),
          open?.reason,
          open?.effectiveAt,
          user.lastLoginAt,
          user.createdAt,
        ]),
      );
    }
    await this.notifications.notify(
      await this.notifications.otherAdminIds(admin.id),
      'admin.data_exported',
      'User data exported',
      `${admin.displayName} exported the user list.`,
    );
    await this.audit.log({ action: 'users.exported', actorId: admin.id, ip, metadata: { filters: { q: query.q, role: query.role, status: query.status, departmentId: query.departmentId, sort: query.sort }, rows: rows.length } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    return CSV_BOM + lines.join('\r\n') + '\r\n';
  }

  @Get('import/template.csv')
  template(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="users-import-template.csv"');
    return this.imports.template();
  }

  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: IMPORT_MAX_BYTES, files: 1, fields: 0, parts: 1 } }))
  async previewImport(@CurrentUser() admin: AuthUser, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Attach a CSV file in the "file" field.');
    return this.imports.preview(admin.id, file.buffer.toString('utf8'));
  }

  @Post('import/commit')
  @HttpCode(HttpStatus.OK)
  async commitImport(@Body() dto: CommitImportDto, @CurrentUser() admin: AuthUser, @ClientIp() ip: string, @Res({ passthrough: true }) res: Response) {
    const csv = await this.imports.commit(admin.id, dto.importId, ip);
    await this.notifications.notify(
      await this.notifications.otherAdminIds(admin.id),
      'admin.users_imported',
      'Users imported',
      `${admin.displayName} imported users from a CSV file.`,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="temporary-passwords.csv"');
    res.setHeader('Cache-Control', 'no-store');
    return csv;
  }

  @Post()
  async create(@CurrentUser() admin: AuthUser, @Body() dto: CreateUserDto, @ClientIp() ip: string) {
    const fields = asBadRequest(() => ({
      email: normalizeEmail(dto.email),
      displayName: requiredText('displayName', dto.displayName, 80),
      employeeId: normalizeEmployeeId(requiredText('employeeId', dto.employeeId, 32)),
      firstName: optionalText('firstName', dto.firstName, NAME_MAX),
      lastName: optionalText('lastName', dto.lastName, NAME_MAX),
      jobTitle: optionalText('jobTitle', dto.jobTitle, NAME_MAX),
      phone: normalizePhone(dto.phone),
    }));
    await this.assertDepartmentUsable(dto.departmentId);
    const passwordHash = await hashPassword(dto.password);
    try {
      const user = await this.prisma.user.create({
        data: {
          ...fields,
          role: dto.role,
          departmentId: dto.departmentId ?? null,
          passwordHash,
          mustChangePassword: true,
        },
        include: userInclude,
      });
      await this.audit.log({ action: 'user.created', actorId: admin.id, targetType: 'user', targetId: user.id, ip, metadata: { role: user.role, source: 'admin' } });
      return profileView(user);
    } catch (error) {
      if (isUniqueViolation(error)) throw await this.uniqueConflict(fields.email, fields.employeeId);
      throw error;
    }
  }

  @Get(':id')
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { ...userInclude, suspensions: { orderBy: { createdAt: 'desc' } } },
    });
    if (!user) throw new NotFoundException('User not found');
    const current = user.suspensions.find((s) => s.status === 'SCHEDULED' || s.status === 'ACTIVE') ?? null;
    return {
      ...profileView(user),
      status: accountStatus(user, user.suspensions.some((s) => s.status === 'SCHEDULED')),
      currentSuspension: current,
      suspensionHistory: user.suspensions,
    };
  }

  @Patch(':id')
  async update(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @ClientIp() ip: string) {
    if (id === admin.id && dto.role && dto.role !== 'ADMIN') {
      throw new BadRequestException('You cannot demote your own account.');
    }
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');
    if (existing.anonymizedAt) throw coded(HttpStatus.CONFLICT, 'ANONYMIZED', 'Anonymized accounts cannot be edited.');
    await this.assertDepartmentUsable(dto.departmentId);

    const data: Prisma.UserUpdateInput = {};
    // Audit keeps WHICH fields changed, not their personal values (PDPA); role, department and the email change are not that kind of data.
    const fields: string[] = [];
    const auditValues: Record<string, unknown> = {};
    asBadRequest(() => {
      if (dto.displayName !== undefined) data.displayName = requiredText('displayName', dto.displayName, 80);
      if (dto.firstName !== undefined) data.firstName = optionalText('firstName', dto.firstName, NAME_MAX);
      if (dto.lastName !== undefined) data.lastName = optionalText('lastName', dto.lastName, NAME_MAX);
      if (dto.jobTitle !== undefined) data.jobTitle = optionalText('jobTitle', dto.jobTitle, NAME_MAX);
      if (dto.phone !== undefined) data.phone = normalizePhone(dto.phone);
      if (dto.employeeId !== undefined) data.employeeId = normalizeEmployeeId(requiredText('employeeId', dto.employeeId, 32));
    });
    if (dto.departmentId !== undefined) {
      data.department = dto.departmentId ? { connect: { id: dto.departmentId } } : { disconnect: true };
      fields.push('departmentId');
      auditValues.departmentId = dto.departmentId;
    }
    if (dto.role !== undefined) {
      data.role = dto.role;
      fields.push('role');
      auditValues.role = dto.role;
    }
    if (dto.email !== undefined) {
      const email = normalizeEmail(dto.email);
      if (email !== existing.email) {
        data.email = email;
        fields.push('email');
        auditValues.emailFrom = existing.email;
        auditValues.emailTo = email;
      }
    }
    for (const key of ['displayName', 'firstName', 'lastName', 'jobTitle', 'phone', 'employeeId'] as const) {
      if (key in data) fields.push(key);
    }

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        // Demoting an admin can leave the system without one: serialise and re-check under the admin lock.
        if (existing.role === 'ADMIN' && dto.role !== undefined && dto.role !== 'ADMIN') await assertAdminRemains(tx, id);
        return tx.user.update({ where: { id }, data, include: userInclude });
      });
      if (fields.length > 0) {
        await this.audit.log({ action: 'user.updated', actorId: admin.id, targetType: 'user', targetId: id, ip, metadata: { fields, ...auditValues } });
      }
      return profileView(user);
    } catch (error) {
      if (isUniqueViolation(error)) throw await this.uniqueConflict(data.email as string | undefined, data.employeeId as string | undefined);
      throw error;
    }
  }

  @Delete(':id/avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeAvatar(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ClientIp() ip: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.user.update({ where: { id }, data: { avatarKey: null, avatarUpdatedAt: null } });
    await this.avatars.remove(user.avatarKey);
    await this.audit.log({ action: 'profile.avatar_removed', actorId: admin.id, targetType: 'user', targetId: id, ip });
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetPasswordDto, @ClientIp() ip: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');
    if (existing.anonymizedAt) throw coded(HttpStatus.CONFLICT, 'ANONYMIZED', 'Anonymized accounts cannot be edited.');
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(dto.password), mustChangePassword: true } });
    await this.sessions.destroyAllForUser(id);
    await this.audit.log({ action: 'user.password_reset', actorId: admin.id, targetType: 'user', targetId: id, ip });
  }

  @Get(':id/offboarding-summary')
  async offboardingSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.suspensions.offboardingSummary(id);
  }

  @Post(':id/suspend')
  async suspend(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SuspendDto, @ClientIp() ip: string) {
    return this.suspensions.suspend(admin, id, dto, ip);
  }

  @Post(':id/suspension/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelSuspension(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ClientIp() ip: string) {
    await this.suspensions.cancel(admin, id, ip);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reactivate(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReactivateDto, @ClientIp() ip: string) {
    await this.suspensions.reactivate(admin, id, dto, ip);
  }

  @Post(':id/anonymize')
  @HttpCode(HttpStatus.NO_CONTENT)
  async anonymize(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AnonymizeDto, @ClientIp() ip: string) {
    await this.suspensions.anonymize(admin, id, dto.confirmEmail, ip);
  }

  @Get(':id/sessions')
  async listSessions(@Param('id', ParseUUIDPipe) id: string) {
    return { items: await this.sessions.listForUser(id) };
  }

  @Delete(':id/sessions/:publicId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('publicId') publicId: string, @ClientIp() ip: string) {
    const found = await this.sessions.destroyByPublicId(id, publicId);
    if (!found) throw new NotFoundException('Session not found');
    await this.audit.log({ action: 'auth.session_revoked', actorId: admin.id, targetType: 'user', targetId: id, ip, metadata: { publicId, scope: 'one' } });
    await this.notifications.notify([id], 'session.revoked', 'A device was signed out', 'An administrator signed one of your devices out.');
  }

  @Post(':id/sessions/revoke-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAllSessions(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ClientIp() ip: string) {
    await this.sessions.destroyAllForUser(id);
    await this.audit.log({ action: 'auth.session_revoked', actorId: admin.id, targetType: 'user', targetId: id, ip, metadata: { scope: 'all' } });
    await this.notifications.notify([id], 'session.revoked', 'Signed out everywhere', 'An administrator signed out all of your devices.');
  }

  private async assertDepartmentUsable(departmentId: string | null | undefined): Promise<void> {
    if (!departmentId) return;
    const department = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!department || !department.isActive) throw new BadRequestException('Choose an active department.');
  }

  private async uniqueConflict(email?: string, employeeId?: string) {
    if (employeeId && (await this.prisma.user.findUnique({ where: { employeeId } }))) {
      return coded(HttpStatus.CONFLICT, 'EMPLOYEE_ID_TAKEN', 'This employee ID is already used by another account.');
    }
    if (email) return coded(HttpStatus.CONFLICT, 'EMAIL_TAKEN', 'A user with this email already exists.');
    return new ConflictException('This value is already used by another account.');
  }
}

/** Table row for /admin/users. */
function adminRow(user: UserWithDepartment & { suspensions: { status: string; effectiveAt: Date; reason: string }[] }) {
  const scheduled = user.suspensions.find((s) => s.status === 'SCHEDULED');
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    firstName: user.firstName,
    lastName: user.lastName,
    employeeId: user.employeeId,
    department: departmentView(user.department),
    role: user.role,
    status: accountStatus(user, !!scheduled),
    effectiveAt: scheduled?.effectiveAt ?? null,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    avatarVersion: avatarVersionOf(user.avatarUpdatedAt),
  };
}
