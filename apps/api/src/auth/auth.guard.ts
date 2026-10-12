import { CanActivate, ExecutionContext, ForbiddenException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';
import { APP_CONFIG, AppConfig } from '../config';
import { PrismaService } from '../common/prisma.service';
import { AppRequest } from '../common/request';
import { ALLOW_MUST_CHANGE, IS_PUBLIC, ROLES } from './auth.decorators';
import { coded } from '../common/errors';
import { PRIVACY_NOTICE_VERSION } from '../common/privacy';
import { SessionService } from './session.service';

export const SESSION_COOKIE = 'sid';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const allowMustChange = this.reflector.getAllAndOverride<boolean>(ALLOW_MUST_CHANGE, targets) === true;

    const req = context.switchToHttp().getRequest<AppRequest>();

    // CSRF defence in depth (cookies are also SameSite=Lax): browsers always send Origin on
    // cross-site state-changing requests, so reject any that are not from the demo origin.
    const origin = req.headers.origin;
    if (!SAFE_METHODS.has(req.method) && origin && origin !== this.config.publicOrigin) {
      throw new ForbiddenException('Cross-origin request rejected');
    }

    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException();
    const session = await this.sessions.touch(token);
    if (!session) throw new UnauthorizedException();

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, displayName: true, role: true, isActive: true, mustChangePassword: true, privacyNoticeVersion: true },
    });
    if (!user || !user.isActive) {
      await this.sessions.destroy(token);
      throw new UnauthorizedException();
    }
    req.user = user;
    req.sessionToken = token;

    if (user.mustChangePassword && !allowMustChange) {
      throw coded(HttpStatus.FORBIDDEN, 'PASSWORD_CHANGE_REQUIRED', 'You must change your password before continuing.');
    }

    if (user.privacyNoticeVersion !== PRIVACY_NOTICE_VERSION && !allowMustChange) {
      throw coded(HttpStatus.FORBIDDEN, 'PRIVACY_NOTICE_REQUIRED', 'Please read and accept the privacy notice before continuing.');
    }

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(user.role)) throw new ForbiddenException();
    return true;
  }
}
