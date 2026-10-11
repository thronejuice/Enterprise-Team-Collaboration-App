import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { APP_CONFIG, AppConfig } from '../config';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';
import { AppRequest, AuthUser, ClientIp, CurrentUser } from '../common/request';
import { Public } from './auth.decorators';
import { SESSION_COOKIE } from './auth.guard';
import { dummyVerify, hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from './passwords';
import { RateLimitService, TooManyAttemptsException } from './rate-limit.service';
import { SessionService } from './session.service';

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

export function toPublicUser(user: AuthUser) {
  return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
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
  async login(@Body() dto: LoginDto, @ClientIp() ip: string, @Res({ passthrough: true }) res: Response) {
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
    if (!user || !valid || !user.isActive) {
      const lockout = await this.rateLimit.recordFailure(limits);
      await this.audit.log({
        action: 'auth.login_failed',
        actorId: user?.id,
        ip,
        success: false,
        metadata: { email, reason: !user ? 'unknown_email' : !valid ? 'bad_password' : 'disabled', lockoutSeconds: lockout },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.rateLimit.recordSuccess([limits[0]]);
    const token = await this.sessions.create(user.id);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: this.config.sessionTtlSeconds * 1000,
    });
    await this.audit.log({ action: 'auth.login', actorId: user.id, ip });
    return { user: toPublicUser(user) };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: AppRequest, @ClientIp() ip: string, @Res({ passthrough: true }) res: Response) {
    if (req.sessionToken) await this.sessions.destroy(req.sessionToken);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    await this.audit.log({ action: 'auth.logout', actorId: req.user?.id, ip });
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { user: toPublicUser(user) };
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(@Body() dto: ChangePasswordDto, @Req() req: AppRequest, @ClientIp() ip: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    const limits = [this.rateLimit.userLimit('password-change', user.id)];
    await this.rateLimit.assertNotLocked(limits);
    if (!(await verifyPassword(user.passwordHash, dto.currentPassword))) {
      await this.rateLimit.recordFailure(limits);
      await this.audit.log({ action: 'auth.password_change_failed', actorId: user.id, ip, success: false });
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.rateLimit.recordSuccess(limits);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(dto.newPassword) } });
    await this.sessions.destroyAllForUser(user.id, req.sessionToken);
    await this.audit.log({ action: 'auth.password_changed', actorId: user.id, ip });
  }
}
