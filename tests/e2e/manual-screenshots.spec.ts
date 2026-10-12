import { APIRequestContext, Browser, BrowserContext, expect, Page, request, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

/**
 * Takes the screenshots used by docs/USER-MANUAL.md from a demo database with invented people.
 * Every step is allowed to fail on its own: the failures are listed at the end so the run still produces what it can.
 */
const BASE = `https://${process.env.DEMO_HOSTNAME ?? 'comms-demo.home.arpa'}`;
const ADMIN_EMAIL = 'admin@acme-demo.example';
const ADMIN_PASSWORD = 'Demo-Admin-2026!';
const TEMP = 'Welcome-2026-Temp';
const PW = 'Acme-Demo-2026!';
const OUT = 'results/manual';
const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

const failures: string[] = [];
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    failures.push(`${name}: ${(error as Error).message.split('\n')[0]}`);
    console.log(`STEP FAILED ${name}`);
  }
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

async function apiAs(email: string, password: string): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE, 'User-Agent': PHONE } });
  const res = await ctx.post('/api/auth/login', { data: { email, password } });
  expect(res.status(), `login ${email}: ${await res.text()}`).toBe(200);
  return ctx;
}

async function onboard(email: string, password = TEMP) {
  const ctx = await apiAs(email, password);
  expect((await ctx.post('/api/auth/password', { data: { currentPassword: password, newPassword: PW } })).status()).toBe(204);
  expect((await ctx.post('/api/auth/privacy-notice')).status()).toBe(201);
  await ctx.dispose();
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** A browser that has already seen the "What's new" dialog, like a returning user. */
async function userContext(browser: Browser, userAgent?: string): Promise<BrowserContext> {
  return browser.newContext({
    userAgent,
    storageState: { cookies: [], origins: [{ origin: BASE, localStorage: [{ name: 'nexus:whats-new-seen', value: '0.1.1' }] }] },
  });
}

/** A square avatar drawn in the browser, so no photo of a real person is needed. */
async function avatarPng(page: Page, initials: string, color: string): Promise<Buffer> {
  const b64 = await page.evaluate(
    ([text, bg]) => {
      const c = document.createElement('canvas');
      c.width = c.height = 400;
      const x = c.getContext('2d')!;
      x.fillStyle = bg;
      x.fillRect(0, 0, 400, 400);
      x.fillStyle = '#fff';
      x.font = 'bold 170px sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(text, 200, 215);
      return c.toDataURL('image/png').split(',')[1];
    },
    [initials, color],
  );
  return Buffer.from(b64, 'base64');
}

test('manual screenshots', async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  let adminApi!: APIRequestContext;
  const ids: Record<string, string> = {};
  const departments: Record<string, string> = {};

  // ---- 1. First sign-in of the administrator ------------------------------------------------
  const adminCtx = await browser.newContext(); // nothing seen yet: the What's new dialog will appear
  const admin = await adminCtx.newPage();
  await step('admin first sign-in', async () => {
    await admin.goto('/login');
    await shot(admin, '01-login');
    await admin.getByLabel('Work email').fill(ADMIN_EMAIL);
    await admin.getByLabel('Password').fill(ADMIN_PASSWORD);
    await admin.getByRole('button', { name: 'Sign in' }).click();
    await expect(admin).toHaveURL(/privacy-notice/);
    await shot(admin, '02-privacy-notice');
    await admin.getByRole('button', { name: 'I have read and accept' }).click();
    await expect(admin.getByRole('dialog').getByRole('heading', { name: /What's new/ })).toBeVisible();
    await shot(admin, '03-whats-new');
    await admin.getByRole('button', { name: 'Got it' }).click();
    await expect(admin.getByRole('heading', { name: /Welcome/ })).toBeVisible();
    await shot(admin, '04-home-admin');
  });
  adminApi = await apiAs(ADMIN_EMAIL, ADMIN_PASSWORD);

  // ---- 2. Departments ------------------------------------------------------------------------
  await step('departments', async () => {
    await admin.goto('/admin/departments');
    await expect(admin.getByText('No departments yet')).toBeVisible();
    await shot(admin, '05-departments-empty');
    await admin.getByRole('button', { name: 'Add department' }).first().click();
    await admin.getByLabel(/Name \(1/).fill('Finance');
    await shot(admin, '06-department-add');
    await admin.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
    await expect(admin.getByRole('cell', { name: 'Finance' })).toBeVisible();
    for (const name of ['Human Resources', 'Information Technology', 'Sales']) {
      expect((await adminApi.post('/api/admin/departments', { data: { name } })).status()).toBe(201);
    }
    const list = (await (await adminApi.get('/api/admin/departments')).json()) as { id: string; name: string }[];
    for (const d of list) departments[d.name] = d.id;
    await admin.reload();
    await expect(admin.getByRole('cell', { name: 'Sales' })).toBeVisible();
    await shot(admin, '07-departments');
  });

  // ---- 3. Users: create one in the UI, the rest through the API -------------------------------
  const people = [
    { key: 'somchai', name: 'Somchai Prasert', first: 'Somchai', last: 'Prasert', role: 'HOST', dept: 'Information Technology', emp: 'EMP-1001', title: 'IT Manager' },
    { key: 'malee', name: 'Malee Suksan', first: 'Malee', last: 'Suksan', role: 'MEMBER', dept: 'Finance', emp: 'EMP-1002', title: 'Accountant' },
    { key: 'anan', name: 'Anan Wongsa', first: 'Anan', last: 'Wongsa', role: 'MEMBER', dept: 'Sales', emp: 'EMP-1003', title: 'Sales Executive' },
    { key: 'pim', name: 'Pimchanok Rattana', first: 'Pimchanok', last: 'Rattana', role: 'MEMBER', dept: 'Human Resources', emp: 'EMP-1004', title: 'HR Officer' },
    { key: 'krit', name: 'Krit Thongdee', first: 'Krit', last: 'Thongdee', role: 'MEMBER', dept: 'Information Technology', emp: 'EMP-1005', title: 'Developer' },
    { key: 'lisa', name: 'Lisa Chaiyo', first: 'Lisa', last: 'Chaiyo', role: 'MEMBER', dept: 'Sales', emp: 'EMP-1006', title: 'Sales Coordinator' },
  ];
  const emailOf = (key: string) => `${key}@acme-demo.example`;
  await step('create user modal', async () => {
    await admin.goto('/admin/users');
    await admin.getByRole('button', { name: 'Create user' }).first().click();
    const dialog = admin.getByRole('dialog');
    const p = people[0];
    await dialog.getByLabel('First name').fill(p.first);
    await dialog.getByLabel('Last name').fill(p.last);
    await dialog.getByLabel('Display name').fill(p.name);
    await dialog.getByLabel('Email').fill(emailOf(p.key));
    await dialog.getByLabel('Employee ID').fill(p.emp);
    await dialog.getByLabel('Job title').fill(p.title);
    await dialog.getByLabel('Department').selectOption({ label: p.dept });
    await dialog.getByLabel('Role').selectOption(p.role);
    await dialog.getByLabel(/Initial password/).fill(TEMP);
    await shot(admin, '08-user-create');
    await dialog.getByRole('button', { name: 'Create user' }).click();
    await expect(dialog).toBeHidden();
  });
  for (const p of people.slice(1)) {
    await step(`create ${p.key}`, async () => {
      const res = await adminApi.post('/api/admin/users', {
        data: { email: emailOf(p.key), displayName: p.name, firstName: p.first, lastName: p.last, role: p.role, password: TEMP, employeeId: p.emp, jobTitle: p.title, departmentId: departments[p.dept] },
      });
      expect(res.status(), await res.text()).toBe(201);
    });
  }
  const all = (await (await adminApi.get('/api/admin/users')).json()) as { items: { id: string; email: string }[] };
  for (const u of all.items) ids[u.email] = u.id;
  // Somchai and Malee will use the system, so they sign in once now (password + privacy notice).
  for (const key of ['somchai', 'malee', 'anan', 'krit']) await step(`onboard ${key}`, () => onboard(emailOf(key)));
  await step('users list', async () => {
    await admin.goto('/admin/users');
    await expect(admin.getByText('Somchai Prasert')).toBeVisible();
    await shot(admin, '09-users-list');
  });

  // ---- 4. CSV import ---------------------------------------------------------------------------
  await step('csv import', async () => {
    const header = 'email,display_name,role,employee_id,first_name,last_name,job_title,department,phone';
    const good = [`ploy@acme-demo.example,Ploy Meechai,MEMBER,EMP-2001,Ploy,Meechai,Designer,Sales,`, `tee@acme-demo.example,Tee Charoen,MEMBER,EMP-2002,Tee,Charoen,Auditor,Finance,`];
    const bad = [...good, `not-an-email,Dao Srisuk,MEMBER,EMP-2003,Dao,Srisuk,Clerk,Marketing,`];
    writeFileSync(`${OUT}/users-import-bad.csv`, [header, ...bad].join('\n'));
    writeFileSync(`${OUT}/users-import-good.csv`, [header, ...good].join('\n'));
    await admin.goto('/admin/users/import');
    await expect(admin.getByRole('heading', { name: 'Import users from CSV' })).toBeVisible();
    await shot(admin, '10-import-start');
    await admin.getByLabel('CSV file').setInputFiles(`${OUT}/users-import-bad.csv`);
    await admin.getByRole('button', { name: 'Preview' }).click();
    await expect(admin.getByText('1 with errors')).toBeVisible();
    await shot(admin, '11-import-errors');
    await admin.getByLabel('CSV file').setInputFiles(`${OUT}/users-import-good.csv`);
    await admin.getByRole('button', { name: 'Preview' }).click();
    await expect(admin.getByText('2 valid')).toBeVisible();
    await shot(admin, '12-import-ready');
  });

  // ---- 5. User detail, suspend, locked account ---------------------------------------------------
  await step('user detail', async () => {
    await admin.goto(`/admin/users/${ids[emailOf('krit')]}`);
    await expect(admin.getByRole('heading', { name: 'Krit Thongdee' })).toBeVisible();
    await shot(admin, '13-user-detail');
    await admin.getByRole('button', { name: 'Suspend…' }).click();
    const dialog = admin.getByRole('dialog');
    await dialog.getByLabel('Hand over rooms and recordings to (optional)').fill('Somchai');
    await dialog.getByRole('button', { name: /Somchai Prasert/ }).click();
    await shot(admin, '14-suspend');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });
  await step('locked account', async () => {
    const attempts = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE, 'User-Agent': PHONE } });
    for (let i = 0; i < 6; i++) await attempts.post('/api/auth/login', { data: { email: emailOf('lisa'), password: 'wrong-password-1' } });
    await attempts.dispose();
    await admin.goto(`/admin/users/${ids[emailOf('lisa')]}`);
    await expect(admin.getByRole('button', { name: 'Unlock sign-in' })).toBeVisible();
    await shot(admin, '15-unlock-sign-in');
    await admin.getByRole('button', { name: 'Unlock sign-in' }).click();
  });

  // ---- 6. A new user: password change and privacy notice ------------------------------------------
  await step('new user first sign-in', async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, emailOf('pim'), TEMP);
    await expect(page).toHaveURL(/change-password/);
    await page.getByLabel('Current password').fill(TEMP);
    await page.getByLabel(/New password/).fill(PW);
    await page.getByLabel('Confirm new password').fill(PW);
    await shot(page, '16-change-password');
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await expect(page).toHaveURL(/privacy-notice/);
    await page.getByRole('button', { name: 'I have read and accept' }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: /What's new/ })).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();
    await ctx.close();
  });

  // ---- 7. Somchai (host): profile, notifications, people, connection test ---------------------------
  const hostCtx = await userContext(browser);
  const host = await hostCtx.newPage();
  await step('host home and profile', async () => {
    await signIn(host, emailOf('somchai'), PW);
    await expect(host.getByRole('heading', { name: /Welcome/ })).toBeVisible();
    await host.getByRole('link', { name: 'My profile' }).click();
    await expect(host.getByRole('heading', { name: 'My profile' })).toBeVisible();
    await host.getByLabel('Upload photo').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: await avatarPng(host, 'SP', '#4f46e5') });
    await expect(host.getByText('Photo updated')).toBeVisible();
    await host.getByLabel('Phone (optional)').fill('081 234 5678');
    await host.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(host.getByText('Profile saved')).toBeVisible();
    await shot(host, '17-profile');
    await host.getByText('Your data').scrollIntoViewIfNeeded();
    await shot(host, '18-profile-sessions-data');
  });
  await step('notifications', async () => {
    await host.goto('/');
    await host.getByRole('button', { name: /Notifications/ }).click();
    await expect(host.getByRole('dialog', { name: 'Notifications' })).toBeVisible();
    await shot(host, '19-notifications');
    await host.keyboard.press('Escape');
    await host.mouse.click(700, 400);
  });
  await step('people', async () => {
    await host.goto('/people');
    await expect(host.getByText('Malee Suksan').first()).toBeVisible();
    await shot(host, '20-people');
  });
  await step('connection test', async () => {
    await host.goto('/diagnostics');
    await host.getByRole('button', { name: 'Run test' }).click();
    await expect(host.getByLabel('passed')).toHaveCount(9, { timeout: 120_000 });
    await shot(host, '21-connection-test');
  });
  await step('device limit message', async () => {
    const other = await userContext(browser, MAC);
    const page = await other.newPage();
    await signIn(page, emailOf('somchai'), PW);
    await expect(page.getByText(/already signed in on another computer/)).toBeVisible();
    await shot(page, '22-device-limit');
    await other.close();
  });

  // ---- 8. A meeting: create, join with the code, share, record, manage, end ------------------------
  const memberCtx = await userContext(browser);
  const member = await memberCtx.newPage();
  let roomCode = '';
  let meetingId = '';
  await step('create meeting', async () => {
    await host.goto('/');
    await host.getByLabel('Meeting title').fill('Weekly project review');
    await shot(host, '23-home-create-meeting');
    await host.getByRole('button', { name: 'Create meeting' }).click();
    const code = await host.locator('span.tnum').filter({ hasText: /^\d{4}$/ }).first().textContent();
    roomCode = code!.trim();
    await shot(host, '24-room-created');
    await host.getByRole('link', { name: 'Enter meeting' }).click();
    await expect(host.getByRole('button', { name: 'Join meeting' })).toBeVisible();
    await expect(host.locator('video').first()).toBeVisible();
    await host.waitForTimeout(1200);
    await shot(host, '25-prejoin');
    await host.getByRole('button', { name: 'Join meeting' }).click();
    await expect(host.getByRole('button', { name: 'Leave' })).toBeVisible();
    meetingId = host.url().split('/meetings/')[1];
  });
  await step('member joins with the code', async () => {
    await signIn(member, emailOf('malee'), PW);
    await expect(member.getByRole('heading', { name: /Welcome/ })).toBeVisible();
    for (let i = 0; i < 4; i++) await member.getByLabel(`Digit ${i + 1}`).fill(roomCode[i]);
    await shot(member, '26-enter-code');
    await member.getByRole('button', { name: 'Continue' }).click();
    await expect(member.getByRole('button', { name: 'Join meeting' })).toBeVisible();
    await member.getByRole('button', { name: 'Join meeting' }).click();
    await expect(member.getByRole('button', { name: 'Leave' })).toBeVisible();
  });
  await step('room view', async () => {
    await expect(host.getByText(/2\/10/)).toBeVisible();
    await expect.poll(async () => host.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0).length), { timeout: 30_000 }).toBeGreaterThan(1);
    await shot(host, '27-room-host');
    await shot(member, '28-room-member');
  });
  await step('screen share', async () => {
    const slide = await hostCtx.newPage();
    await slide.setContent('<html><head><title>Shared Content Slide</title></head><body style="margin:0;background:#fff;display:grid;place-items:center;height:100vh"><h1 style="font:bold 80px sans-serif;color:#111">Q4 PLAN</h1></body></html>');
    await host.bringToFront();
    await host.getByRole('button', { name: 'Share screen' }).click();
    await expect(member.getByText(/is presenting/)).toBeVisible();
    await member.waitForTimeout(1500);
    await shot(member, '29-screen-share');
    await host.getByRole('button', { name: 'Stop sharing screen' }).click();
  });
  await step('recording', async () => {
    await host.getByRole('button', { name: 'Start recording' }).click();
    await expect(member.getByText('REC', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(host.getByRole('button', { name: 'Stop recording' })).toBeVisible({ timeout: 60_000 });
    await host.waitForTimeout(1500);
    await shot(host, '30-recording-on');
    await shot(member, '31-recording-notice');
    await host.waitForTimeout(12_000);
    await host.getByRole('button', { name: 'Stop recording' }).click();
  });
  await step('participants panel', async () => {
    await host.getByRole('button', { name: 'Participants', exact: true }).click();
    await expect(host.getByRole('button', { name: 'Mute Malee Suksan' })).toBeVisible();
    await shot(host, '32-participants');
    await host.getByRole('button', { name: 'Participants', exact: true }).click();
  });
  await step('end meeting dialog', async () => {
    await host.getByRole('button', { name: 'End meeting' }).click();
    await shot(host, '33-end-meeting');
    await host.getByRole('dialog').getByRole('button', { name: 'End meeting' }).click();
    await expect(host.getByText('The meeting has ended')).toBeVisible();
    await shot(host, '34-meeting-ended');
  });

  // ---- 9. Recordings ---------------------------------------------------------------------------------
  await step('recordings', async () => {
    const hostApi = await apiAs(emailOf('somchai'), PW);
    await expect
      .poll(async () => ((await (await hostApi.get(`/api/meetings/${meetingId}/recordings`)).json()) as { status: string }[])[0]?.status, { timeout: 150_000, intervals: [3000] })
      .toBe('COMPLETED');
    const rec = ((await (await hostApi.get(`/api/meetings/${meetingId}/recordings`)).json()) as { id: string }[])[0];
    await hostApi.dispose();
    await host.goto('/recordings');
    await expect(host.getByText('Weekly project review')).toBeVisible();
    await shot(host, '35-recordings');
    await host.goto(`/recordings/${rec.id}`);
    await expect(host.getByRole('link', { name: 'Download MP4' })).toBeVisible();
    await host.waitForTimeout(1500);
    await shot(host, '36-recording-detail');
    // The administrator sees the same recording without having joined (the manual says so).
    await admin.goto('/recordings');
    await expect(admin.getByText('Weekly project review')).toBeVisible();
    await shot(admin, '37-recordings-admin');
  });

  // ---- 10. Admin: audit log and status pages -----------------------------------------------------------
  await step('audit', async () => {
    await admin.goto('/admin/audit');
    await expect(admin.getByText('auth.login').first()).toBeVisible();
    await shot(admin, '38-audit');
  });
  await step('suspended user sees the message', async () => {
    expect((await adminApi.post(`/api/admin/users/${ids[emailOf('krit')]}/suspend`, { data: { reason: 'RESIGNED', effective: 'now', handoverToId: ids[emailOf('somchai')] } })).status()).toBe(201);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, emailOf('krit'), PW);
    await expect(page.getByText(/has been suspended/)).toBeVisible();
    await shot(page, '39-suspended-login');
    await ctx.close();
    await admin.goto(`/admin/users/${ids[emailOf('krit')]}`);
    await expect(admin.getByRole('button', { name: 'Reactivate' })).toBeVisible();
    await shot(admin, '40-user-suspended');
  });

  await hostCtx.close();
  await memberCtx.close();
  await adminCtx.close();
  console.log(`MANUAL SHOTS: ${failures.length} step(s) failed`);
  failures.forEach((f) => console.log(`  - ${f}`));
});
