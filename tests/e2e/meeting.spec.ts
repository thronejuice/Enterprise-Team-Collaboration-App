import { APIRequestContext, Browser, BrowserContext, expect, Page, request, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!;
const BASE = `https://${process.env.DEMO_HOSTNAME ?? 'comms-demo.home.arpa'}`;
const RUN = Date.now().toString(36);
const PASSWORD = 'Demo-password-123';

const users = {
  host: { email: `host-${RUN}@demo.test`, displayName: 'Hana Host', role: 'HOST' },
  member: { email: `member-${RUN}@demo.test`, displayName: 'Mika Member', role: 'MEMBER' },
  outsider: { email: `outsider-${RUN}@demo.test`, displayName: 'Otto Outsider', role: 'MEMBER' },
} as const;

async function apiAs(email: string, password: string): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE } });
  const res = await ctx.post('/api/auth/login', { data: { email, password } });
  expect(res.status(), `login ${email}`).toBe(200);
  return ctx;
}

async function login(browser: Browser, email: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  return { ctx, page };
}

async function enterCode(page: Page, code: string) {
  for (let i = 0; i < 4; i++) await page.getByLabel(`Digit ${i + 1}`).fill(code[i]);
  await page.getByRole('button', { name: 'Continue' }).click();
}

async function joinFromPrejoin(page: Page) {
  await expect(page.getByRole('button', { name: 'Join meeting' })).toBeVisible();
  // Wait for the camera preview so we join with media.
  await expect(page.locator('video').first()).toBeVisible();
  await page.getByRole('button', { name: 'Join meeting' }).click();
  await expect(page.getByRole('button', { name: 'Leave' })).toBeVisible();
}

test('meeting, screen share, recording and access control end to end', async ({ browser }) => {
  // --- Admin creates accounts (one through the UI) ---------------------------------------
  const admin = await apiAs(ADMIN_EMAIL, ADMIN_PASSWORD);
  for (const key of ['member', 'outsider'] as const) {
    const res = await admin.post('/api/admin/users', { data: { ...users[key], password: PASSWORD } });
    expect(res.status()).toBe(201);
  }
  const adminUi = await browser.newContext();
  const adminPage = await adminUi.newPage();
  await adminPage.goto('/login');
  await adminPage.getByLabel('Work email').fill(ADMIN_EMAIL);
  await adminPage.getByLabel('Password').fill(ADMIN_PASSWORD);
  await adminPage.getByRole('button', { name: 'Sign in' }).click();
  await expect(adminPage.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  await adminPage.getByRole('link', { name: 'Users' }).click();
  await adminPage.getByRole('button', { name: 'Create user' }).first().click();
  const dialog = adminPage.getByRole('dialog');
  await dialog.getByLabel('Display name').fill(users.host.displayName);
  await dialog.getByLabel('Email').fill(users.host.email);
  await dialog.getByLabel('Role').selectOption('HOST');
  await dialog.getByLabel(/Initial password/).fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Create user' }).click();
  await expect(adminPage.getByText(users.host.email, { exact: true })).toBeVisible();
  await adminUi.close();

  // --- Members cannot create meetings ------------------------------------------------------
  const memberApi = await apiAs(users.member.email, PASSWORD);
  expect((await memberApi.post('/api/meetings', { data: { title: 'nope' } })).status()).toBe(403);

  // --- Host creates a meeting --------------------------------------------------------------
  const host = await login(browser, users.host.email);
  await host.page.getByLabel('Meeting title').fill(`E2E review ${RUN}`);
  await host.page.getByRole('button', { name: 'Create meeting' }).click();
  const codeText = await host.page.locator('span.tnum').filter({ hasText: /^\d{4}$/ }).first().textContent();
  const roomCode = codeText!.trim();
  expect(roomCode).toMatch(/^\d{4}$/);
  await host.page.getByRole('link', { name: 'Enter meeting' }).click();
  await joinFromPrejoin(host.page);

  // --- Member joins with the code ----------------------------------------------------------
  const member = await login(browser, users.member.email);
  await enterCode(member.page, roomCode);
  await expect(member.page.getByRole('button', { name: 'Join meeting' })).toBeVisible();
  await member.page.waitForTimeout(1500);
  await member.page.screenshot({ path: 'results/ui-prejoin.png' });
  await joinFromPrejoin(member.page);
  const meetingId = member.page.url().split('/meetings/')[1];

  // RTC-01 / RTC-05: both see each other with live video.
  for (const p of [host.page, member.page]) {
    await expect(p.getByText(/2\/10/)).toBeVisible();
    await expect(p.locator('video')).toHaveCount(2);
  }
  // Remote video actually decodes frames (media flows, not just signaling).
  await expect
    .poll(async () => member.page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0 && v.readyState >= 2).length), { timeout: 30_000 })
    .toBe(2);

  // --- Screen share (RTC-06) ---------------------------------------------------------------
  const slide = await host.ctx.newPage();
  await slide.setContent(
    `<html><head><title>Shared Content Slide</title></head><body style="margin:0;background:#fff;display:grid;place-items:center;height:100vh"><h1 style="font:bold 96px sans-serif;color:#111">QUARTERLY PLAN ${RUN}</h1></body></html>`,
  );
  await host.page.bringToFront();
  await host.page.getByRole('button', { name: 'Share screen' }).click();
  await expect(member.page.getByText(/is presenting/)).toBeVisible();
  await expect.poll(async () => member.page.locator('video').count()).toBe(3);
  await member.page.screenshot({ path: 'results/ui-room-screenshare.png' });

  // --- Recording (REC-01..09) --------------------------------------------------------------
  await host.page.getByRole('button', { name: 'Start recording' }).click();
  await expect(member.page.getByText('REC', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(host.page.getByRole('button', { name: 'Stop recording' })).toBeVisible({ timeout: 60_000 });
  await host.page.getByRole('button', { name: 'Participants', exact: true }).click();
  await host.page.waitForTimeout(2_000);
  await host.page.screenshot({ path: 'results/ui-room-host-recording.png' });
  await host.page.getByRole('button', { name: 'Participants', exact: true }).click();
  await host.page.waitForTimeout(13_000);
  await host.page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(member.page.getByText('REC', { exact: true })).toBeHidden({ timeout: 60_000 });

  const recordings = await expect
    .poll(
      async () => {
        const list = (await (await memberApi.get(`/api/meetings/${meetingId}/recordings`)).json()) as { id: string; status: string }[];
        return list[0]?.status;
      },
      { timeout: 120_000, intervals: [2000] },
    )
    .toBe('COMPLETED')
    .then(async () => (await (await memberApi.get(`/api/meetings/${meetingId}/recordings`)).json()) as { id: string; fileSize: number; durationMs: number }[]);
  const rec = recordings[0];
  expect(rec.fileSize).toBeGreaterThan(50_000);
  const viewer = await member.ctx.newPage();
  await viewer.goto(`/recordings/${rec.id}`);
  await expect(viewer.getByRole('link', { name: 'Download MP4' })).toBeVisible();
  await viewer.waitForTimeout(1500);
  await viewer.screenshot({ path: 'results/ui-recording.png' });
  await viewer.close();

  // Authorized download through the API (Range supported), then inspect streams.
  const ranged = await memberApi.get(`/api/recordings/${rec.id}/file`, { headers: { Range: 'bytes=0-99' } });
  expect(ranged.status()).toBe(206);
  const file = await memberApi.get(`/api/recordings/${rec.id}/file?download=1`);
  expect(file.status()).toBe(200);
  const outPath = `results/recording-${RUN}.mp4`;
  writeFileSync(outPath, await file.body());
  console.log(`Recording saved to tests/e2e/${outPath} (${rec.fileSize} bytes, ${rec.durationMs} ms)`);

  // REC-10: someone who never joined cannot list or download it.
  const outsiderApi = await apiAs(users.outsider.email, PASSWORD);
  expect((await outsiderApi.get(`/api/recordings/${rec.id}/file`)).status()).toBe(403);
  expect((await outsiderApi.get(`/api/recordings/${rec.id}`)).status()).toBe(403);
  const outsiderList = (await (await outsiderApi.get('/api/recordings')).json()) as unknown[];
  expect(outsiderList).toHaveLength(0);

  // --- Host mutes and removes the member (ROOM-09) ------------------------------------------
  await host.page.getByRole('button', { name: 'Stop sharing screen' }).click();
  await host.page.getByRole('button', { name: 'Participants', exact: true }).click();
  await host.page.getByRole('button', { name: `Mute ${users.member.displayName}` }).click();
  await expect(member.page.getByText(/muted your microphone/)).toBeVisible();
  await host.page.getByRole('button', { name: `Remove ${users.member.displayName}` }).click();
  await host.page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(member.page.getByText('You were removed from this meeting')).toBeVisible();
  // Removed participant cannot get back in, even with the correct code.
  const rejoin = await memberApi.post('/api/meetings/join', { data: { roomCode } });
  expect(rejoin.status()).toBe(403);
  expect((await memberApi.post(`/api/meetings/${meetingId}/token`)).status()).toBe(404);

  // --- Wrong codes are rate limited (ROOM-04/05) ---------------------------------------------
  const wrong = roomCode === '0000' ? '0001' : '0000';
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) statuses.push((await outsiderApi.post('/api/meetings/join', { data: { roomCode: wrong } })).status());
  expect(statuses.slice(0, 4).every((s) => s === 404 || s === 403)).toBe(true);
  expect(statuses[5]).toBe(429);

  // --- Host ends the meeting (ROOM-08) -------------------------------------------------------
  await host.page.getByRole('button', { name: 'End meeting' }).click();
  await host.page.getByRole('dialog').getByRole('button', { name: 'End meeting' }).click();
  await expect(host.page.getByText('The meeting has ended')).toBeVisible();
  const ended = (await (await admin.get(`/api/meetings/${meetingId}`)).json()) as { status: string };
  expect(ended.status).toBe('ENDED');

  await host.ctx.close();
  await member.ctx.close();
});

test('room codes stay unique across concurrently created meetings (ROOM-01/02/03)', async () => {
  const admin = await apiAs(ADMIN_EMAIL, ADMIN_PASSWORD);
  const results = await Promise.all(
    Array.from({ length: 30 }, (_, i) => admin.post('/api/meetings', { data: { title: `Concurrency ${RUN} #${i}` } })),
  );
  const meetings = await Promise.all(results.map(async (r) => {
    expect(r.status()).toBe(201);
    return (await r.json()) as { id: string; roomCode: string };
  }));
  for (const m of meetings) expect(m.roomCode).toMatch(/^\d{4}$/);
  expect(new Set(meetings.map((m) => m.roomCode)).size).toBe(meetings.length);
  console.log(`codes: ${meetings.map((m) => m.roomCode).join(' ')}`);
  for (const m of meetings) expect((await admin.post(`/api/meetings/${m.id}/end`)).status()).toBe(200);
});

test('connection test page passes from a LAN client, audit log records events', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/login');
  await page.getByLabel('Work email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  await page.getByRole('link', { name: 'Connection test' }).click();
  await page.getByRole('button', { name: 'Run test' }).click();
  await expect(page.getByLabel('passed')).toHaveCount(3 + 6, { timeout: 120_000 }); // 3 browser capability checks + 6 server checks
  await page.screenshot({ path: 'results/ui-diagnostics.png', fullPage: true });

  await page.getByRole('link', { name: 'Audit log' }).click();
  await page.getByLabel('Exact action prefix').fill('meeting.code_rejected');
  await expect(page.getByText('meeting.code_rejected').first()).toBeVisible();
  await page.getByLabel('Exact action prefix').fill('recording.');
  await expect(page.getByText('recording.completed').first()).toBeVisible();
  await expect(page.getByText('recording.access_denied').first()).toBeVisible();
  await page.screenshot({ path: 'results/ui-audit.png' });
  await ctx.close();
});
