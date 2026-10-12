import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { APP_CONFIG, AppConfig } from '../config';
import { AuditService } from '../audit/audit.service';
import { coded } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { AppRequest, AuthUser, ClientIp, CurrentUser, clientIp } from '../common/request';
import { AllowMustChangePassword, Public } from './auth.decorators';
import { SESSION_COOKIE } from './auth.guard';
import { dummyVerify, hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from './passwords';
import { RateLimitService, TooManyAttemptsException } from './rate-limit.service';
import { deviceKey, isDesktop, SessionService } from './session.service';

class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MaxLength(200)
  password: string;
}

class ChangePasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(200)
  newPassword: string;
}

/** Shape of the signed-in user returned by login and /auth/me. */
export function toSessionUser(user: {
  id: string;
  email: string;
  displayName: string;
  role: string;
  mustChangePassword: boolean;
  avatarUpdatedAt: Date | null;
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    avatarVersion: user.avatarUpdatedAt ? user.avatarUpdatedAt.getTime() : null,
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: AppRequest, @ClientIp() ip: string, @Res({ passthrough: true }) res: Response) {
    const email = dto.email.trim().toLowerCase();
    const limits = [this.rateLimit.userLimit('login-email', email), this.rateLimit.ipLimit('login-ip', ip)];
    try {
      await this.rateLimit.assertNotLocked(limits);
    } catch (error) {
      if (error instanceof TooManyAttemptsException) {
        await this.audit.log({ action: 'auth.login_rate_limited', ip, success: false, metadata: { email } });
      }
      throw error;
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = user ? await verifyPassword(user.passwordHash, dto.password) : await dummyVerify(dto.password);

    // Correct password on a suspended account: say so (D10). This is not a guessing failure, so it is not rate limited.
    if (user && valid && !user.isActive) {
      await this.audit.log({
        action: 'auth.login_failed',
        actorId: user.id,
        ip,
        success: false,
        metadata: { email, reason: 'suspended' },
      });
      throw coded(HttpStatus.FORBIDDEN, 'ACCOUNT_SUSPENDED', 'This account has been suspended. Please contact your administrator.');
    }

    if (!user || !valid) {
      const lockout = await this.rateLimit.recordFailure(limits);
      await this.audit.log({
        action: 'auth.login_failed',
        actorId: user?.id,
        ip,
        success: false,
        metadata: { email, reason: !user ? 'unknown_email' : 'bad_password', lockoutSeconds: lockout },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;
    // One computer at a time: a PC/notebook is refused while another computer is signed in. Phones and tablets are not limited.
    // The password was right, so this does not count as a failed attempt.
    if (isDesktop(userAgent)) {
      const key = deviceKey(ip, userAgent);
      const other = (await this.sessions.desktopSessions(user.id)).find((d) => d.key !== key);
      if (other) {
        await this.audit.log({ action: 'auth.login_failed', actorId: user.id, ip: ip, success: false, metadata: { email, reason: 'device_limit' } });
        throw coded(
          HttpStatus.CONFLICT,
          'DEVICE_LIMIT',
          `You are already signed in on ${other.label}${other.ip ? ` (${other.ip})` : ''}. Sign out there first, then try again.`,
        );
      }
    }
    await this.rateLimit.recordSuccess([limits[0]]);
    const token = await this.sessions.create(user.id, { ip: ip, userAgent });
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: this.config.sessionTtlSeconds * 1000,
    });
    await this.audit.log({ action: 'auth.login', actorId: user.id, ip });
    return { user: toSessionUser(updated) };
  }

  @Post('logout')
  @HttpCode(204)
  @AllowMustChangePassword()
  async logout(@Req() req: AppRequest, @ClientIp() ip: string, @Res({ passthrough: true }) res: Response) {
    if (req.sessionToken) await this.sessions.destroy(req.sessionToken);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    await this.audit.log({ action: 'auth.logout', actorId: req.user?.id, ip });
  }

  @Get('me')
  @AllowMustChangePassword()
  async me(@CurrentUser() user: AuthUser) {
    const full = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return { user: toSessionUser(full) };
  }

  @Post('password')
  @HttpCode(204)
  @AllowMustChangePassword()
  async changePassword(@Body() dto: ChangePasswordDto, @Req() req: AppRequest, @ClientIp() ip: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    const limits = [this.rateLimit.userLimit('password-change', user.id)];
    await this.rateLimit.assertNotLocked(limits);
    if (!(await verifyPassword(user.passwordHash, dto.currentPassword))) {
      await this.rateLimit.recordFailure(limits);
      await this.audit.log({ action: 'auth.password_change_failed', actorId: user.id, ip, success: false });
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (await verifyPassword(user.passwordHash, dto.newPassword)) {
      throw coded(HttpStatus.BAD_REQUEST, 'PASSWORD_UNCHANGED', 'The new password must be different from your current password.');
    }
    await this.rateLimit.recordSuccess(limits);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(dto.newPassword), mustChangePassword: false },
    });
    await this.sessions.destroyAllForUser(user.id, req.sessionToken);
    await this.audit.log({ action: 'auth.password_changed', actorId: user.id, ip });
  }

  @Get('sessions')
  async listSessions(@CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return { items: await this.sessions.listForUser(user.id, req.sessionToken) };
  }

  @Delete('sessions/:publicId')
  @HttpCode(204)
  async revokeSession(@Param('publicId') publicId: string, @CurrentUser() user: AuthUser, @Req() req: AppRequest, @ClientIp() ip: string) {
    const items = await this.sessions.listForUser(user.id, req.sessionToken);
    const target = items.find((s) => s.publicId === publicId);
    if (!target) throw new NotFoundException('Session not found');
    if (target.current) throw new BadRequestException('Use Sign out to end the current session.');
    await this.sessions.destroyByPublicId(user.id, publicId);
    await this.audit.log({
      action: 'auth.session_revoked',
      actorId: user.id,
      targetType: 'user',
      targetId: user.id,
      ip,
      metadata: { publicId, scope: 'one' },
    });
  }

  @Post('sessions/revoke-others')
  @HttpCode(204)
  async revokeOthers(@CurrentUser() user: AuthUser, @Req() req: AppRequest, @ClientIp() ip: string) {
    await this.sessions.destroyAllForUser(user.id, req.sessionToken);
    await this.audit.log({
      action: 'auth.session_revoked',
      actorId: user.id,
      targetType: 'user',
      targetId: user.id,
      ip,
      metadata: { scope: 'others' },
    });
  }
}
