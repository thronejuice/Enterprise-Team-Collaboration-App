import { APIRequestContext, Browser, BrowserContext, expect, Page, request, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

/**
 * v0.1.1 acceptance flows (spec section 10, E2E 1–8).
 * Scenario 5 needs E2E_DATABASE_URL to move a scheduled suspension into the past; it is skipped without it.
 */
const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!;
const BASE = `https://${process.env.DEMO_HOSTNAME ?? 'comms-demo.home.arpa'}`;
const DB_URL = process.env.E2E_DATABASE_URL;
const RUN = Date.now().toString(36);
const TEMP = 'Temp-password-123';
const PASSWORD = 'Profile-password-123';
const NEXT = 'Next-password-456';

// 1×1 PNG, enough to exercise the avatar pipeline (crop, resize, WebP).
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');

const person = (tag: string, role: 'HOST' | 'MEMBER' | 'ADMIN' = 'MEMBER') => ({
  email: `${tag}-${RUN}@demo.test`,
  displayName: `${tag[0].toUpperCase()}${tag.slice(1)} ${RUN}`,
  role,
  employeeId: `E2E${RUN}${tag}`.toUpperCase(),
});

async function apiAs(email: string, password: string): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE } });
  const res = await ctx.post('/api/auth/login', { data: { email, password } });
  expect(res.status(), `login ${email}`).toBe(200);
  return ctx;
}

/** A new account's one forced password change, done through the API. */
async function completeFirstSignIn(email: string, newPassword = PASSWORD) {
  const ctx = await apiAs(email, TEMP);
  const res = await ctx.post('/api/auth/password', { data: { currentPassword: TEMP, newPassword } });
  expect(res.status(), `first password change ${email}`).toBe(204);
  await ctx.dispose();
}

async function createUser(admin: APIRequestContext, p: ReturnType<typeof person>, extra: Record<string, unknown> = {}) {
  const res = await admin.post('/api/admin/users', { data: { ...p, password: TEMP, ...extra } });
  expect(res.status(), `create ${p.email}: ${await res.text()}`).toBe(201);
  const body = await res.json();
  await completeFirstSignIn(p.email);
  return body as { id: string };
}

async function uiLogin(browser: Browser, email: string, password = PASSWORD): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  return { ctx, page };
}

async function signedInHome(browser: Browser, email: string, password = PASSWORD) {
  const session = await uiLogin(browser, email, password);
  await expect(session.page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  return session;
}

test.describe.serial('profile, directory and offboarding', () => {
  let admin: APIRequestContext;
  const hana = person('hana', 'HOST');
  const mika = person('mika');
  const otto = person('otto');
  const ivy = person('ivy');
  let hanaId = '';
  let mikaId = '';

  test.beforeAll(async () => {
    admin = await apiAs(ADMIN_EMAIL, ADMIN_PASSWORD);
    hanaId = (await createUser(admin, hana)).id;
    mikaId = (await createUser(admin, mika)).id;
    await createUser(admin, otto);
    await createUser(admin, ivy);
  });

  test.afterAll(async () => {
    await admin.dispose();
  });

  // E2E 1 — forced change on first sign-in.
  test('1. new user is forced to change the password, then reaches Home', async ({ browser }) => {
    // Created but not yet signed in: the first sign-in must go through the UI.
    const second = person('second');
    const created = await admin.post('/api/admin/users', { data: { ...second, password: TEMP } });
    expect(created.status()).toBe(201);
    const { ctx, page } = await uiLogin(browser, second.email, TEMP);
    await expect(page).toHaveURL(/\/change-password/);
    await page.getByLabel('Current password').fill(TEMP);
    await page.getByLabel('New password (min. 10 characters)').fill(PASSWORD);
    await page.getByLabel('Confirm new password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
    await ctx.close();
  });

  // E2E 2 — profile edit and avatar, visible in the sidebar and in another user's Directory.
  test('2. user edits display name and photo; the change shows in the sidebar and the Directory', async ({ browser }) => {
    const { ctx, page } = await signedInHome(browser, mika.email);
    await page.getByRole('link', { name: 'My profile' }).click();
    await page.getByLabel('Display name').fill(`Mika Renamed ${RUN}`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Profile saved')).toBeVisible();
    await page.getByLabel('Upload photo').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG_1X1 });
    await expect(page.getByText('Photo updated')).toBeVisible();
    await expect(page.getByRole('link', { name: 'My profile' }).locator('img')).toBeVisible();

    const other = await signedInHome(browser, otto.email);
    await other.page.getByRole('link', { name: 'People' }).click();
    await other.page.getByLabel('Search by name or email').fill(`Mika Renamed ${RUN}`);
    await expect(other.page.getByText(`Mika Renamed ${RUN}`)).toBeVisible();
    await other.ctx.close();
    await ctx.close();
  });

  // E2E 3 — the Directory response never carries private fields.
  test('3. Directory response has no phone or employee ID', async () => {
    const ctx = await apiAs(otto.email, PASSWORD);
    const res = await ctx.get(`/api/directory?q=${encodeURIComponent(RUN)}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { items: Record<string, unknown>[] };
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(item).not.toHaveProperty('phone');
      expect(item).not.toHaveProperty('employeeId');
      expect(item).not.toHaveProperty('role');
      expect(item).not.toHaveProperty('isActive');
    }
    await ctx.dispose();
  });

  // E2E 4 — suspend a host now: room handed over, session ends, login says suspended.
  test('4. suspending an active host hands the room over and signs them out', async ({ browser }) => {
    const hostSession = await signedInHome(browser, hana.email);
    const created = await hostSession.page.request.post('/api/meetings', { data: { title: `Handover ${RUN}` } });
    expect(created.status()).toBe(201);
    const meeting = (await created.json()) as { id: string; roomCode: string };
    const memberSession = await signedInHome(browser, mika.email);
    await memberSession.page.request.post('/api/meetings/join', { data: { roomCode: meeting.roomCode } });

    const adminUi = await signedInHome(browser, ADMIN_EMAIL, ADMIN_PASSWORD);
    await adminUi.page.getByRole('link', { name: 'Users' }).click();
    await adminUi.page.getByLabel('Search').fill(hana.email);
    await adminUi.page.getByRole('link', { name: hana.displayName }).click();
    await adminUi.page.getByRole('button', { name: 'Suspend…' }).click();
    const dialog = adminUi.page.getByRole('dialog');
    // Scenario 2 renamed Mika, so search for the current name.
    await dialog.getByLabel('Hand over rooms and recordings to (optional)').fill(`Mika Renamed ${RUN}`);
    await dialog.getByRole('button', { name: `Mika Renamed ${RUN}` }).click();
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Suspend now' }).click();
    await expect(adminUi.page.getByText(/was suspended and disconnected/)).toBeVisible();

    const handedOver = await memberSession.page.request.get(`/api/meetings/${meeting.id}`);
    expect((await handedOver.json()).isHost).toBe(true);

    await hostSession.page.reload();
    await expect(hostSession.page).toHaveURL(/\/login/);
    await hostSession.page.getByLabel('Work email').fill(hana.email);
    await hostSession.page.getByLabel('Password').fill(PASSWORD);
    await hostSession.page.getByRole('button', { name: 'Sign in' }).click();
    await expect(hostSession.page.getByText('This account has been suspended. Please contact your administrator.')).toBeVisible();

    for (const s of [hostSession, memberSession, adminUi]) await s.ctx.close();
  });

  // E2E 5 — scheduled suspension is applied by the job within about a minute.
  test('5. a scheduled suspension is applied by the job within a minute', async () => {
    test.skip(!DB_URL, 'Set E2E_DATABASE_URL to a database the test runner can reach.');
    const ivyId = (await (await admin.get(`/api/admin/users?q=${encodeURIComponent(ivy.email)}`)).json()).items[0].id as string;
    const tomorrow = new Date(Date.now() + 7 * 3600_000 + 86_400_000).toISOString().slice(0, 10);
    const scheduled = await admin.post(`/api/admin/users/${ivyId}/suspend`, { data: { reason: 'LONG_LEAVE', effective: tomorrow } });
    expect(scheduled.status()).toBe(201);

    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    try {
      await db.query(`UPDATE user_suspensions SET effective_at = now() - interval '1 minute' WHERE user_id = $1 AND status = 'SCHEDULED'`, [ivyId]);
      await expect
        .poll(async () => (await (await admin.get(`/api/admin/users/${ivyId}`)).json()).status, { timeout: 90_000, intervals: [5_000] })
        .toBe('SUSPENDED');
    } finally {
      await db.end();
    }
  });

  // E2E 6 — reactivate, then the user must change the temporary password.
  test('6. reactivated user signs in and must change the password first', async ({ browser }) => {
    const ivyId = (await (await admin.get(`/api/admin/users?q=${encodeURIComponent(ivy.email)}`)).json()).items[0].id as string;
    const reactivated = await admin.post(`/api/admin/users/${ivyId}/reactivate`, { data: { password: NEXT } });
    expect(reactivated.status()).toBe(204);
    const { ctx, page } = await uiLogin(browser, ivy.email, NEXT);
    await expect(page).toHaveURL(/\/change-password/);
    await ctx.close();
  });

  // E2E 7 — CSV import: a bad row blocks the import, fixing the file imports, and the temporary password works.
  test('7. CSV import blocks on a bad row, then imports and the temporary password signs in', async ({ browser }) => {
    const ok1 = person('csvone');
    const ok2 = person('csvtwo');
    const bad = { ...person('csvbad'), email: 'not-an-email' };
    const csv = (rows: typeof ok1[]) =>
      ['email,display_name,role,employee_id,first_name,last_name,job_title,department,phone', ...rows.map((r) => `${r.email},${r.displayName},${r.role},${r.employeeId},,,,,`)].join('\n');
    const dir = process.env.E2E_RESULTS_DIR ?? 'results';
    const badPath = `${dir}/import-bad.csv`;
    const goodPath = `${dir}/import-good.csv`;
    const { writeFileSync } = await import('node:fs');
    writeFileSync(badPath, csv([ok1, ok2, bad]));
    writeFileSync(goodPath, csv([ok1, ok2]));

    const adminUi = await signedInHome(browser, ADMIN_EMAIL, ADMIN_PASSWORD);
    await adminUi.page.goto('/admin/users/import');
    await adminUi.page.getByLabel('CSV file').setInputFiles(badPath);
    await adminUi.page.getByRole('button', { name: 'Preview' }).click();
    await expect(adminUi.page.getByText('1 with errors')).toBeVisible();
    await expect(adminUi.page.getByRole('button', { name: /^Import/ })).toBeDisabled();

    await adminUi.page.getByLabel('CSV file').setInputFiles(goodPath);
    await adminUi.page.getByRole('button', { name: 'Preview' }).click();
    await expect(adminUi.page.getByText('2 valid')).toBeVisible();
    adminUi.page.once('dialog', (d) => d.accept());
    const [download] = await Promise.all([adminUi.page.waitForEvent('download'), adminUi.page.getByRole('button', { name: /^Import 2 users/ }).click()]);
    const passwordFile = await download.path();
    const lines = readFileSync(passwordFile, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
    const row = lines.find((l) => l.startsWith(ok1.email))!;
    const tempPassword = row.split(',').at(-1)!;
    expect(tempPassword).toHaveLength(14);

    const { ctx, page } = await uiLogin(browser, ok1.email, tempPassword);
    await expect(page).toHaveURL(/\/change-password/);
    await ctx.close();
    await adminUi.ctx.close();
  });

  // E2E 8 — sign out another device from /profile; that device is sent to /login.
  test('8. signing out another device from My profile sends it to login', async ({ browser }) => {
    // A dedicated user, so the only sessions are the two this test opens.
    const nina = person('nina');
    await createUser(admin, nina);
    // First-sign-in left one API session open; drop it so only this test's sessions remain.
    const keeper = await apiAs(nina.email, PASSWORD);
    expect((await keeper.post('/api/auth/sessions/revoke-others')).status()).toBe(204);
    expect((await keeper.post('/api/auth/logout')).status()).toBe(204);
    await keeper.dispose();
    const device = await signedInHome(browser, nina.email);
    const mine = await signedInHome(browser, nina.email);
    await mine.page.goto('/profile');
    await expect(mine.page.getByText('This device')).toBeVisible();
    // Only the other device has a Sign out button inside <main>; this device is marked "This device".
    await mine.page.getByRole('main').getByRole('button', { name: 'Sign out', exact: true }).click();
    await device.page.reload();
    await expect(device.page).toHaveURL(/\/login/);
    await device.ctx.close();
    await mine.ctx.close();
  });

  // E2E 9 — the release dialog opens once per version and stays closed after it is dismissed.
  test('9. the What\'s new dialog opens once and is remembered', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } }); // nothing seen yet
    const page = await ctx.newPage();
    await page.goto('/login');
    await page.getByLabel('Work email').fill(otto.email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: /What's new in \d+\.\d+\.\d+/ })).toBeVisible();
    await expect(dialog.getByText('My profile')).toBeVisible();
    await dialog.getByRole('button', { name: 'Got it' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await ctx.close();
  });
});
