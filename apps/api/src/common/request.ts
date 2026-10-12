import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '@prisma/client';

export type AuthUser = Pick<User, 'id' | 'email' | 'displayName' | 'role' | 'isActive' | 'mustChangePassword'>;

export interface AppRequest extends Request {
  user?: AuthUser;
  sessionToken?: string;
}

export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  return req.user as AuthUser;
});

export const ClientIp = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  return clientIp(ctx.switchToHttp().getRequest<Request>());
});
