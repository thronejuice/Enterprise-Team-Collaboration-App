import { HttpException } from '@nestjs/common';
import { FakeStore } from '../testing/fake-store';
import { AuthController } from './auth.controller';
import { hashPassword } from './passwords';
import { RateLimitService } from './rate-limit.service';

const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const config = {
  rateLimit: { windowSeconds: 900, maxFailuresPerUser: 5, maxFailuresPerIp: 0, lockoutScheduleSeconds: [60] },
  cookieSecure: false,
  sessionTtlSeconds: 3600,
} as never;

async function setup() {
  const user = {
    id: 'u1', email: 'owner@example.com', displayName: 'Owner', role: 'MEMBER', isActive: true, mustChangePassword: false,
    privacyNoticeVersion: null, avatarUpdatedAt: null, passwordHash: await hashPassword('Correct-password-1'),
  };
  const prisma = { user: { findUnique: jest.fn(async () => user), update: jest.fn(async () => user) } };
  const sessions = {
    desktopSessions: jest.fn(async () => [{ key: '10.0.0.9|Windows', label: 'Chrome on Windows', ip: '10.0.0.9', desktop: true }]),
    liveDevices: jest.fn(async () => []),
    create: jest.fn(async () => 'token'),
  };
  const audit = { log: jest.fn(async () => undefined) };
  const notifications = { notify: jest.fn(async () => undefined) };
  const rateLimit = RateLimitService.withStore(new FakeStore(), config);
  const controller = new AuthController(prisma as never, sessions as never, rateLimit, audit as never, notifications as never, config);
  const login = (ua: string) =>
    controller.login({ email: 'owner@example.com', password: 'Correct-password-1' } as never, { headers: { 'user-agent': ua }, ip: '10.0.0.1', socket: {} } as never, '10.0.0.1', { cookie: jest.fn() } as never);
  return { login, notifications, audit };
}

describe('one-computer rule does not leak the owner\'s device (security review #7)', () => {
  it('refuses a second computer with a message that has no IP or device name', async () => {
    const { login } = await setup();
    const error = (await login(WIN).catch((e) => e)) as HttpException;
    expect(error.getStatus()).toBe(409);
    const body = error.getResponse() as { code: string; message: string };
    expect(body.code).toBe('DEVICE_LIMIT');
    expect(body.message).toBe('You are already signed in on another computer. Sign out there first, then try again.');
    expect(body.message).not.toMatch(/10\.0\.0\.9|Chrome|Windows/);
  });

  it('still tells the real owner (in-app) about the refused attempt, including where it came from', async () => {
    const { login, notifications } = await setup();
    await login(WIN).catch(() => undefined);
    expect(notifications.notify).toHaveBeenCalledWith(['u1'], 'login.blocked_other_computer', expect.any(String), expect.stringContaining('10.0.0.1'));
  });

  it('a phone is not limited (documented as policy, not a security control)', async () => {
    const { login } = await setup();
    await expect(login(IPHONE)).resolves.toBeDefined();
  });
});
