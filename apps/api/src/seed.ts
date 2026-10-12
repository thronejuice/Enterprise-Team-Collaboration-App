import { PrismaClient } from '@prisma/client';
import { hashPassword, MIN_PASSWORD_LENGTH } from './auth/passwords';

/** Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD if no admin exists yet. Idempotent. */
async function main() {
  const prisma = new PrismaClient();
  try {
    // Only an admin who can actually sign in counts: if every admin is suspended or anonymized,
    // setting ADMIN_EMAIL / ADMIN_PASSWORD and restarting creates a new one (see docs/SETUP.md).
    const admins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true, anonymizedAt: null } });
    if (admins > 0) {
      console.log('[seed] an active admin already exists; skipping');
      return;
    }
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD ?? '';
    if (!email || password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Set ADMIN_EMAIL and ADMIN_PASSWORD (at least ${MIN_PASSWORD_LENGTH} characters) to create the first admin`);
    }
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new Error(`No active admin exists, and ${email} is already an account. Set ADMIN_EMAIL to an unused address to create a new admin`);
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
