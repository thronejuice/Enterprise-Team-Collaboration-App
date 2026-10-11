import { PrismaClient } from '@prisma/client';
import { hashPassword, MIN_PASSWORD_LENGTH } from './auth/passwords';

/** Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD if no admin exists yet. Idempotent. */
async function main() {
  const prisma = new PrismaClient();
  try {
    const admins = await prisma.user.count({ where: { role: 'ADMIN' } });
    if (admins > 0) {
      console.log('[seed] admin already exists; skipping');
      return;
    }
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD ?? '';
    if (!email || password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Set ADMIN_EMAIL and ADMIN_PASSWORD (at least ${MIN_PASSWORD_LENGTH} characters) to create the first admin`);
    }
    await prisma.user.create({
      data: {
        email,
        displayName: process.env.ADMIN_DISPLAY_NAME?.trim() || 'Administrator',
        role: 'ADMIN',
        passwordHash: await hashPassword(password),
      },
    });
    console.log(`[seed] created admin ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[seed] failed:', (error as Error).message);
  process.exit(1);
});
