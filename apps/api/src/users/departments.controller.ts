import { Body, ConflictException, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { Roles } from '../auth/auth.decorators';
import { isUniqueViolation, PrismaService } from '../common/prisma.service';
import { AuthUser, ClientIp, CurrentUser } from '../common/request';

class DepartmentNameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;
}

class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Departments are never deleted (existing users refer to them); deactivate instead. */
@Controller('admin/departments')
@Roles('ADMIN')
export class DepartmentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list() {
    const rows = await this.prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: { where: { isActive: true, anonymizedAt: null } } } } },
    });
    return rows.map((d) => ({ id: d.id, name: d.name, isActive: d.isActive, activeUserCount: d._count.users }));
  }

  @Post()
  async create(@CurrentUser() admin: AuthUser, @Body() dto: DepartmentNameDto, @ClientIp() ip: string) {
    const name = dto.name.trim();
    await this.assertNameFree(name);
    try {
      const row = await this.prisma.department.create({ data: { name } });
      await this.audit.log({ action: 'department.created', actorId: admin.id, targetType: 'department', targetId: row.id, ip, metadata: { name, isActive: row.isActive } });
      return { id: row.id, name: row.name, isActive: row.isActive, activeUserCount: 0 };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException({ statusCode: 409, message: 'A department with this name already exists.', code: 'DEPARTMENT_NAME_TAKEN' });
      throw error;
    }
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDepartmentDto, @ClientIp() ip: string) {
    const existing = await this.prisma.department.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Department not found');
    const name = dto.name?.trim();
    if (name !== undefined) await this.assertNameFree(name, id);
    try {
      const row = await this.prisma.department.update({ where: { id }, data: { name, isActive: dto.isActive } });
      await this.audit.log({
        action: 'department.updated',
        actorId: admin.id,
        targetType: 'department',
        targetId: id,
        ip,
        metadata: { name: row.name, isActive: row.isActive },
      });
      return { id: row.id, name: row.name, isActive: row.isActive };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException({ statusCode: 409, message: 'A department with this name already exists.', code: 'DEPARTMENT_NAME_TAKEN' });
      throw error;
    }
  }

  /** Case-insensitive uniqueness, checked before writing so the error names the cause. */
  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const clash = await this.prisma.department.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictException({ statusCode: 409, message: 'A department with this name already exists.', code: 'DEPARTMENT_NAME_TAKEN' });
  }
}
