import { HttpException } from '@nestjs/common';
import { SuspensionService } from './suspension.service';

type Row = Record<string, any>;

/** Matches the simple where-clauses the service uses: equality, { in }, { not }, { lte }. */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) return cond.in.includes(row[key]);
      if ('not' in cond) return row[key] !== cond.not;
      if ('lte' in cond) return row[key] <= cond.lte;
    }
    return row[key] === cond;
  });
}

let seq = 0;
const uid = (prefix: string) => `${prefix}-${++seq}`;

/** In-memory stand-in for the Prisma calls SuspensionService makes. $transaction really rolls back on error. */
class FakeDb {
  users: Row[] = [];
  suspensions: Row[] = [];
  meetings: Row[] = [];
  audit: Row[] = [];
  private tick = 0;

  addUser(over: Row = {}): Row {
    const user = {
      id: uid('u'), email: `${uid('e')}@x.com`, role: 'MEMBER', isActive: true, anonymizedAt: null, createdAt: new Date(2026, 0, 1 + this.tick++),
      passwordHash: 'original-hash', mustChangePassword: false, avatarKey: null, displayName: 'Name', firstName: 'F', lastName: 'L',
      phone: '081', employeeId: `EMP${seq}`, jobTitle: 'T', departmentId: 'd1', avatarUpdatedAt: null, ...over,
    };
    this.users.push(user);
    return user;
  }
  addMeeting(hostId: string, status = 'ACTIVE', participants: string[] = []): Row {
    const m = { id: uid('m'), hostId, status, participants };
    this.meetings.push(m);
    return m;
  }

  private activeAdminsWithoutOpenSuspension(where: Row) {
    return this.users.filter(
      (u) =>
        u.role === where.role && u.isActive === where.isActive && u.anonymizedAt === where.anonymizedAt && u.id !== where.id.not &&
        !this.suspensions.some((s) => s.userId === u.id && ['SCHEDULED', 'ACTIVE'].includes(s.status)),
    );
  }

  $executeRaw = async () => 0;
  $transaction = async (cb: (tx: any) => Promise<unknown>) => {
    const snapshot = structuredClone({ users: this.users, suspensions: this.suspensions, meetings: this.meetings, audit: this.audit });
    try {
      return await cb(this);
    } catch (error) {
      Object.assign(this, snapshot);
      throw error;
    }
  };

  user = {
    findUnique: async ({ where }: Row) => this.users.find((u) => u.id === where.id) ?? null,
    findUniqueOrThrow: async ({ where }: Row) => {
      const u = this.users.find((x) => x.id === where.id);
      if (!u) throw new Error('not found');
      return u;
    },
    findFirst: async ({ where }: Row) =>
      this.users.filter((u) => u.role === where.role && u.isActive && u.anonymizedAt === null && u.id !== where.id.not).sort((a, b) => a.createdAt - b.createdAt)[0] ?? null,
    update: async ({ where, data }: Row) => Object.assign(this.users.find((u) => u.id === where.id)!, data),
    count: async ({ where }: Row) => this.activeAdminsWithoutOpenSuspension(where).length,
  };

  userSuspension = {
    findFirst: async ({ where, orderBy }: Row) => {
      const rows = this.suspensions.filter((s) => matches(s, where));
      if (orderBy) rows.reverse();
      return rows[0] ?? null;
    },
    findMany: async ({ where }: Row) => this.suspensions.filter((s) => matches(s, where)),
    findUnique: async ({ where }: Row) => this.suspensions.find((s) => s.id === where.id) ?? null,
    findUniqueOrThrow: async ({ where }: Row) => this.suspensions.find((s) => s.id === where.id)!,
    count: async ({ where }: Row) => this.suspensions.filter((s) => matches(s, where)).length,
    create: async ({ data }: Row) => {
      const row = { id: uid('s'), note: null, liftNote: null, appliedAt: null, cancelledAt: null, liftedAt: null, handoverToId: null, createdAt: new Date(2026, 5, 1 + this.tick++), status: 'SCHEDULED', ...data };
      this.suspensions.push(row);
      return row;
    },
    update: async ({ where, data }: Row) => Object.assign(this.suspensions.find((s) => s.id === where.id)!, data),
    updateMany: async ({ where, data }: Row) => {
      const rows = this.suspensions.filter((s) => matches(s, where));
      rows.forEach((r) => Object.assign(r, data));
      return { count: rows.length };
    },
  };

  meeting = {
    findMany: async ({ where }: Row) => {
      if (where.OR) {
        const userId = where.OR[0].hostId;
        return this.meetings.filter((m) => m.status === 'ACTIVE' && (m.hostId === userId || m.participants.includes(userId)));
      }
      return this.meetings.filter((m) => m.hostId === where.hostId);
    },
    updateMany: async ({ where, data }: Row) => {
      const rows = this.meetings.filter((m) => m.hostId === where.hostId);
      rows.forEach((m) => Object.assign(m, data));
      return { count: rows.length };
    },
    count: async () => 0,
  };

  auditLog = {
    findFirst: async ({ where }: Row) =>
      this.audit.find((a) => a.action === where.action && a.targetId === where.targetId && a.metadata?.[where.metadata.path[0]] === where.metadata.equals) ?? null,
    findMany: async ({ where }: Row) => this.audit.filter((a) => a.action === where.action && a.targetId === where.targetId),
    update: async ({ where, data }: Row) => Object.assign(this.audit.find((a) => a.id === where.id)!, data),
  };
}

const tomorrow = () => new Date(Date.now() + 7 * 3600e3 + 86_400e3).toISOString().slice(0, 10);

function setup() {
  const db = new FakeDb();
  const audit = { log: jest.fn(async (e: Row) => void db.audit.push({ id: BigInt(db.audit.length + 1), ...e })) };
  const sessions = { destroyAllForUser: jest.fn(async () => undefined) };
  const livekit = { removeParticipant: jest.fn(async () => undefined) };
  const avatars = { remove: jest.fn(async () => undefined) };
  const service = new SuspensionService(db as never, sessions as never, livekit as never, audit as never, avatars as never);
  const admin = db.addUser({ role: 'ADMIN' });
  return { db, service, audit, sessions, livekit, avatars, admin };
}
const actions = (db: FakeDb) => db.audit.map((a) => a.action);
const codeOf = (error: unknown) => (error as HttpException).getResponse?.() as Row;
const reject = (p: Promise<unknown>) => p.then(() => { throw new Error('expected a rejection'); }, (e) => e);

describe('suspend now', () => {
  it('deactivates the user, hands every hosted room over, signs out and evicts from live rooms', async () => {
    const { db, service, sessions, livekit, admin } = setup();
    const target = db.addUser();
    const heir = db.addUser();
    const live = db.addMeeting(target.id, 'ACTIVE', [target.id]);
    const ended = db.addMeeting(target.id, 'ENDED');
    const joined = db.addMeeting(db.addUser().id, 'ACTIVE', [target.id]); // only a participant

    await service.suspend(admin as never, target.id, { reason: 'RESIGNED', effective: 'now', handoverToId: heir.id }, 'ip');

    expect(target.isActive).toBe(false);
    expect(live.hostId).toBe(heir.id);
    expect(ended.hostId).toBe(heir.id);
    expect(joined.hostId).not.toBe(heir.id);
    expect(db.suspensions[0]).toMatchObject({ status: 'ACTIVE', userId: target.id });
    expect(db.suspensions[0].appliedAt).toBeInstanceOf(Date);
    expect(sessions.destroyAllForUser).toHaveBeenCalledWith(target.id);
    expect(livekit.removeParticipant.mock.calls.map((c: unknown[]) => c[0]).sort()).toEqual([live.id, joined.id].sort());
    expect(actions(db).filter((a) => a === 'meeting.host_transferred')).toHaveLength(2);
    expect(actions(db)).toContain('user.suspended');
  });

  it('refuses to suspend yourself, an anonymized account, or an account that already has an open suspension', async () => {
    const { db, service, admin } = setup();
    expect((await reject(service.suspend(admin as never, admin.id, { reason: 'RESIGNED', effective: 'now' }, 'ip'))).getStatus()).toBe(400);

    const gone = db.addUser({ anonymizedAt: new Date(), isActive: false });
    expect(codeOf(await reject(service.suspend(admin as never, gone.id, { reason: 'RESIGNED', effective: 'now' }, 'ip'))).code).toBe('ANONYMIZED');

    const target = db.addUser();
    await service.suspend(admin as never, target.id, { reason: 'RESIGNED', effective: tomorrow() }, 'ip');
    expect(codeOf(await reject(service.suspend(admin as never, target.id, { reason: 'RESIGNED', effective: 'now' }, 'ip'))).code).toBe('ALREADY_SUSPENDED');
    expect(db.suspensions.filter((s) => s.userId === target.id)).toHaveLength(1);
  });

  it('needs a note for reason OTHER and a usable handover person', async () => {
    const { db, service, admin } = setup();
    const target = db.addUser();
    expect((await reject(service.suspend(admin as never, target.id, { reason: 'OTHER', effective: 'now' }, 'ip'))).getStatus()).toBe(400);

    const inactive = db.addUser({ isActive: false });
    expect(codeOf(await reject(service.suspend(admin as never, target.id, { reason: 'RESIGNED', effective: 'now', handoverToId: inactive.id }, 'ip'))).code).toBe('HANDOVER_INVALID');
    expect(codeOf(await reject(service.suspend(admin as never, target.id, { reason: 'RESIGNED', effective: 'now', handoverToId: target.id }, 'ip'))).code).toBe('HANDOVER_INVALID');
    const leaving = db.addUser();
    db.suspensions.push({ id: 'x', userId: leaving.id, status: 'SCHEDULED' });
    expect(codeOf(await reject(service.suspend(admin as never, target.id, { reason: 'RESIGNED', effective: 'now', handoverToId: leaving.id }, 'ip'))).code).toBe('HANDOVER_INVALID');
    expect(target.isActive).toBe(true); // nothing happened
  });

  it('refuses to suspend the last usable admin, but allows it when another admin remains', async () => {
    const { db, service, admin } = setup();
    const lone = db.addUser({ role: 'ADMIN' });
    // admin (the actor) is the other admin: allowed
    await service.suspend(admin as never, lone.id, { reason: 'RESIGNED', effective: 'now' }, 'ip');
    expect(lone.isActive).toBe(false);

    const { db: db2, service: service2, admin: actor2 } = setup();
    const onlyOther = db2.addUser({ role: 'ADMIN' });
    actor2.isActive = false; // the only other admin is not usable
    expect(codeOf(await reject(service2.suspend({ id: 'someone' } as never, onlyOther.id, { reason: 'RESIGNED', effective: 'now' }, 'ip'))).code).toBe('LAST_ADMIN');
    expect(onlyOther.isActive).toBe(true);
    expect(db2.suspensions).toHaveLength(0); // the transaction rolled back
  });
});

describe('scheduled suspension lifecycle: SCHEDULED -> ACTIVE / CANCELLED, ACTIVE -> LIFTED', () => {
  it('scheduling changes nothing until the day; the job then applies it exactly once', async () => {
    const { db, service, admin, sessions } = setup();
    const target = db.addUser();
    const room = db.addMeeting(target.id);
    await service.suspend(admin as never, target.id, { reason: 'LONG_LEAVE', effective: tomorrow() }, 'ip');

    expect(db.suspensions[0].status).toBe('SCHEDULED');
    expect(target.isActive).toBe(true);
    expect(room.hostId).toBe(target.id);
    expect(actions(db)).toEqual(['user.suspension_scheduled']);

    await service.applyDueSuspensions(); // not due yet
    expect(db.suspensions[0].status).toBe('SCHEDULED');

    db.suspensions[0].effectiveAt = new Date(Date.now() - 1000);
    await service.applyDueSuspensions();
    await service.applyDueSuspensions(); // running again must not repeat anything
    expect(db.suspensions[0]).toMatchObject({ status: 'ACTIVE' });
    expect(target.isActive).toBe(false);
    expect(room.hostId).toBe(admin.id); // no handover chosen: the admin who scheduled it
    expect(actions(db).filter((a) => a === 'user.suspended')).toHaveLength(1);
    expect(sessions.destroyAllForUser).toHaveBeenCalledTimes(1);
    expect(db.audit.find((a) => a.action === 'user.suspended')!.actorId).toBeNull(); // done by the job
  });

  it('cancel moves SCHEDULED to CANCELLED once; with nothing scheduled it says NOT_SUSPENDED', async () => {
    const { db, service, admin } = setup();
    const target = db.addUser();
    expect(codeOf(await reject(service.cancel(admin as never, target.id, 'ip'))).code).toBe('NOT_SUSPENDED');
    await service.suspend(admin as never, target.id, { reason: 'RESIGNED', effective: tomorrow() }, 'ip');
    await service.cancel(admin as never, target.id, 'ip');
    expect(db.suspensions[0]).toMatchObject({ status: 'CANCELLED', cancelledById: admin.id });
    expect(codeOf(await reject(service.cancel(admin as never, target.id, 'ip'))).code).toBe('NOT_SUSPENDED');
    // a cancelled one frees the slot: a new suspension is allowed again
    await service.suspend(admin as never, target.id, { reason: 'RESIGNED', effective: 'now' }, 'ip');
    expect(db.suspensions).toHaveLength(2);
  });

  it('reactivate lifts the suspension, forces a password change and does not move rooms back', async () => {
    const { db, service, admin } = setup();
    const target = db.addUser();
    const heir = db.addUser();
    const room = db.addMeeting(target.id);
    await service.suspend(admin as never, target.id, { reason: 'RESIGNED', effective: 'now', handoverToId: heir.id }, 'ip');

    await service.reactivate(admin as never, target.id, { password: 'A-new-temporary-pass', note: 'back' }, 'ip');

    expect(target).toMatchObject({ isActive: true, mustChangePassword: true });
    expect(target.passwordHash).not.toBe('original-hash');
    expect(db.suspensions[0]).toMatchObject({ status: 'LIFTED', liftedById: admin.id, liftNote: 'back' });
    expect(room.hostId).toBe(heir.id);
    expect(actions(db)).toContain('user.reactivated');
  });

  it('reactivate refuses an active or an anonymized account', async () => {
    const { db, service, admin } = setup();
    const active = db.addUser();
    expect(codeOf(await reject(service.reactivate(admin as never, active.id, { password: 'A-new-temporary-pass' }, 'ip'))).code).toBe('NOT_SUSPENDED');
    const gone = db.addUser({ isActive: false, anonymizedAt: new Date() });
    expect(codeOf(await reject(service.reactivate(admin as never, gone.id, { password: 'A-new-temporary-pass' }, 'ip'))).code).toBe('ANONYMIZED');
  });

  it('a legacy account disabled in 0.1.0 (no suspension row) can be reactivated', async () => {
    const { db, service, admin } = setup();
    const legacy = db.addUser({ isActive: false });
    await service.reactivate(admin as never, legacy.id, { password: 'A-new-temporary-pass' }, 'ip');
    expect(legacy.isActive).toBe(true);
  });
});

describe('who receives the rooms when the suspension takes effect', () => {
  const dueSuspension = async (setupFn: (s: ReturnType<typeof setup>, target: Row) => Row | undefined) => {
    const s = setup();
    const target = s.db.addUser();
    s.db.addMeeting(target.id);
    const handover = setupFn(s, target);
    s.db.suspensions.push({
      id: 'due', userId: target.id, reason: 'RESIGNED', status: 'SCHEDULED', effectiveAt: new Date(Date.now() - 1000),
      handoverToId: handover?.id ?? null, createdById: s.admin.id, createdAt: new Date(),
    });
    await s.service.applyDueSuspensions();
    return { ...s, target, suspended: s.db.audit.find((a) => a.action === 'user.suspended')!.metadata };
  };

  it('the chosen person when still eligible', async () => {
    const r = await dueSuspension((s) => s.db.addUser());
    expect(r.suspended.fallbackReason).toBeNull();
    expect(r.db.meetings[0].hostId).not.toBe(r.admin.id);
  });

  it('the admin who created the suspension when the chosen person is no longer active', async () => {
    const r = await dueSuspension((s) => s.db.addUser({ isActive: false }));
    expect(r.suspended).toMatchObject({ handoverToId: r.admin.id, fallbackReason: 'handover_unavailable' });
  });

  it('the oldest active admin when the creating admin is not active either', async () => {
    const s = setup();
    s.admin.isActive = false;
    const oldest = s.db.addUser({ role: 'ADMIN', createdAt: new Date(2020, 0, 1) });
    s.db.addUser({ role: 'ADMIN', createdAt: new Date(2025, 0, 1) });
    const target = s.db.addUser();
    s.db.addMeeting(target.id);
    s.db.suspensions.push({ id: 'due', userId: target.id, reason: 'RESIGNED', status: 'SCHEDULED', effectiveAt: new Date(Date.now() - 1000), handoverToId: null, createdById: s.admin.id, createdAt: new Date() });
    await s.service.applyDueSuspensions();
    const meta = s.db.audit.find((a) => a.action === 'user.suspended')!.metadata;
    expect(meta).toMatchObject({ handoverToId: oldest.id, fallbackReason: 'creator_unavailable' });
    expect(s.db.meetings[0].hostId).toBe(oldest.id);
  });
});

describe('scheduled job and the last admin', () => {
  it('rolls back the claim, keeps it SCHEDULED, and audits the block only once across runs', async () => {
    const { db, service } = setup();
    db.users.length = 0; // only the two admins below exist
    const p = db.addUser({ role: 'ADMIN' });
    const q = db.addUser({ role: 'ADMIN' });
    db.suspensions.push({ id: 'q-leaves', userId: q.id, reason: 'RESIGNED', status: 'SCHEDULED', effectiveAt: new Date(Date.now() + 1e8), createdById: p.id, createdAt: new Date() });
    db.suspensions.push({ id: 'p-due', userId: p.id, reason: 'RESIGNED', status: 'SCHEDULED', effectiveAt: new Date(Date.now() - 1000), appliedAt: null, createdById: q.id, createdAt: new Date() });

    await service.applyDueSuspensions();
    await service.applyDueSuspensions();
    await service.applyDueSuspensions();

    expect(p.isActive).toBe(true);
    expect(db.suspensions.find((s) => s.id === 'p-due')).toMatchObject({ status: 'SCHEDULED', appliedAt: null });
    expect(actions(db).filter((a) => a === 'user.suspension_blocked')).toHaveLength(1);
    expect(actions(db)).not.toContain('user.suspended');
  });
});

describe('anonymize', () => {
  const suspendedUser = async () => {
    const s = setup();
    const target = s.db.addUser({ avatarKey: 'avatars/u/x.webp' });
    await s.service.suspend(s.admin as never, target.id, { reason: 'OTHER', note: 'Private reason', effective: 'now' }, 'ip');
    s.db.suspensions[0].liftNote = 'Private lift note';
    s.db.audit.push({ id: 900n, action: 'user.updated', targetId: target.id, metadata: { changes: { phone: '081-000-0000' } } });
    return { ...s, target };
  };

  it('only works on a suspended account whose email is typed correctly', async () => {
    const { db, service, admin, target } = await suspendedUser();
    expect(codeOf(await reject(service.anonymize(admin as never, target.id, 'wrong@x.com', 'ip'))).code).toBe('CONFIRMATION_MISMATCH');
    expect(target.anonymizedAt).toBeNull();

    const active = db.addUser();
    expect(codeOf(await reject(service.anonymize(admin as never, active.id, active.email, 'ip'))).code).toBe('NOT_SUSPENDED');

    const gone = db.addUser({ isActive: false, anonymizedAt: new Date() });
    expect(codeOf(await reject(service.anonymize(admin as never, gone.id, gone.email, 'ip'))).code).toBe('ANONYMIZED');
  });

  it('clears every personal field, the password, suspension notes and old audit values', async () => {
    const { db, service, admin, target, avatars, sessions } = await suspendedUser();
    const emailBefore = target.email;

    await service.anonymize(admin as never, target.id, emailBefore.toUpperCase(), 'ip');

    expect(target).toMatchObject({
      email: `anonymized-${target.id}@anonymized.invalid`, displayName: `Former user #${target.id.slice(0, 4).toUpperCase()}`,
      firstName: null, lastName: null, phone: null, employeeId: null, jobTitle: null, departmentId: null, avatarKey: null, avatarUpdatedAt: null,
    });
    expect(target.anonymizedAt).toBeInstanceOf(Date);
    expect(target.passwordHash).not.toBe('original-hash'); // replaced by a hash of a random value
    expect(target.passwordHash).toMatch(/^\$argon2/);
    expect(db.suspensions.every((s) => s.note === null && s.liftNote === null)).toBe(true);
    expect(db.suspensions[0].reason).toBe('OTHER'); // the category stays
    expect(JSON.stringify(db.audit.find((a) => a.id === 900n)!.metadata)).not.toContain('081-000-0000');
    expect(avatars.remove).toHaveBeenCalledWith('avatars/u/x.webp');
    expect(sessions.destroyAllForUser).toHaveBeenCalled();
    expect(actions(db)).toContain('user.anonymized');
  });

  it('cannot be undone: reactivating the anonymized account is refused', async () => {
    const { service, admin, target } = await suspendedUser();
    await service.anonymize(admin as never, target.id, target.email, 'ip');
    expect(codeOf(await reject(service.reactivate(admin as never, target.id, { password: 'A-new-temporary-pass' }, 'ip'))).code).toBe('ANONYMIZED');
  });
});
