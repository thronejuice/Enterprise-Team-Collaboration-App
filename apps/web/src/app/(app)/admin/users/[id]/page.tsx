'use client';

import { ArrowLeft, CalendarX, Eraser, KeyRound, LockOpen, LogOut, Save, ShieldOff, Trash2, UserCheck, UserX, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { Modal } from '@/components/modal';
import { useToast } from '@/components/toast';
import { Button, Card, ErrorText, Input, Label, PageHeader, Pill, Select, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import type { AccountStatus, AdminUserDetail, Department, DirectoryUser, Paged, SessionInfo, Suspension, SuspensionReason, UserRole } from '@/lib/types';

const REASONS: { value: SuspensionReason; label: string }[] = [
  { value: 'RESIGNED', label: 'Resigned' },
  { value: 'TERMINATED', label: 'Terminated' },
  { value: 'LONG_LEAVE', label: 'Long leave' },
  { value: 'SECURITY', label: 'Security concern' },
  { value: 'OTHER', label: 'Other' },
];
const ROLES: { value: UserRole; label: string }[] = [
  { value: 'MEMBER', label: 'Member' },
  { value: 'HOST', label: 'Host' },
  { value: 'ADMIN', label: 'Admin' },
];
const STATUS_LABEL: Record<AccountStatus, string> = { ACTIVE: 'Active', LEAVING: 'Leaving', SUSPENDED: 'Suspended', ANONYMIZED: 'Anonymized' };

const todayBangkok = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

function ProfileSection({ user, isSelf, departments, onSaved }: { user: AdminUserDetail; isSelf: boolean; departments: Department[]; onSaved: (u: AdminUserDetail) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    displayName: user.displayName,
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    jobTitle: user.jobTitle ?? '',
    departmentId: user.department?.id ?? '',
    employeeId: user.employeeId ?? '',
    phone: user.phone ?? '',
    email: user.email,
    role: user.role,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    // Send only what changed, so a legacy account without an employee ID is not forced to fill it.
    const changes: Record<string, unknown> = {};
    const original = {
      displayName: user.displayName,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      jobTitle: user.jobTitle ?? '',
      departmentId: user.department?.id ?? '',
      employeeId: user.employeeId ?? '',
      phone: user.phone ?? '',
      email: user.email,
      role: user.role,
    };
    const optional = new Set(['departmentId', 'firstName', 'lastName', 'jobTitle', 'phone']);
    for (const key of Object.keys(form) as (keyof typeof form)[]) {
      if (form[key] !== original[key]) changes[key] = optional.has(key) && form[key] === '' ? null : form[key];
    }
    if (Object.keys(changes).length === 0) {
      setBusy(false);
      toast('Nothing to save', 'info');
      return;
    }
    try {
      const updated = await api<AdminUserDetail>(`/admin/users/${user.id}`, { method: 'PATCH', body: changes });
      toast('Profile saved', 'success');
      onSaved(updated);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    try {
      await api(`/admin/users/${user.id}/avatar`, { method: 'DELETE' });
      toast('Photo removed', 'success');
      onSaved({ ...user, avatarVersion: null });
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold">Profile</h2>
        {user.avatarVersion && (
          <Button icon={<Trash2 className="size-4" />} variant="ghost" size="sm" onClick={removeAvatar} title="Remove photo">
            <Trash2 className="size-4" /> Remove photo
          </Button>
        )}
      </div>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="p-first">First name</Label>
          <Input id="p-first" maxLength={100} value={form.firstName} onChange={set('firstName')} />
        </div>
        <div>
          <Label htmlFor="p-last">Last name</Label>
          <Input id="p-last" maxLength={100} value={form.lastName} onChange={set('lastName')} />
        </div>
        <div>
          <Label htmlFor="p-display">Display name</Label>
          <Input id="p-display" maxLength={80} value={form.displayName} onChange={set('displayName')} />
        </div>
        <div>
          <Label htmlFor="p-title">Job title</Label>
          <Input id="p-title" maxLength={100} value={form.jobTitle} onChange={set('jobTitle')} />
        </div>
        <div>
          <Label htmlFor="p-dept">Department</Label>
          <Select id="p-dept" value={form.departmentId} onChange={set('departmentId')}>
            <option value="">— None —</option>
            {departments
              .filter((d) => d.isActive || d.id === user.department?.id)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {!d.isActive ? ' (inactive)' : ''}
                </option>
              ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="p-emp">Employee ID</Label>
          <Input id="p-emp" maxLength={32} pattern="[A-Za-z0-9_\-]+" placeholder={user.employeeId ? undefined : 'Not set'} value={form.employeeId} onChange={set('employeeId')} />
        </div>
        <div>
          <Label htmlFor="p-email">Email</Label>
          <Input id="p-email" type="email" maxLength={254} value={form.email} onChange={set('email')} />
        </div>
        <div>
          <Label htmlFor="p-phone">Phone</Label>
          <Input id="p-phone" maxLength={20} value={form.phone} onChange={set('phone')} />
        </div>
        <div>
          <Label htmlFor="p-role">Role</Label>
          <Select id="p-role" value={form.role} disabled={isSelf} onChange={set('role')}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
          {isSelf && <p className="mt-1 text-xs text-fg-subtle">You cannot change your own role.</p>}
        </div>
        <div className="sm:col-span-2">
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end">
            <Button icon={<Save className="size-4" />} type="submit" loading={busy}>
              Save profile
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}

function SuspendModal({ open, user, onClose, onDone }: { open: boolean; user: AdminUserDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState<SuspensionReason>('RESIGNED');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'now' | 'date'>('now');
  const [date, setDate] = useState(todayBangkok());
  const [handoverQuery, setHandoverQuery] = useState('');
  const [candidates, setCandidates] = useState<DirectoryUser[]>([]);
  const [handover, setHandover] = useState<DirectoryUser | null>(null);
  const [summary, setSummary] = useState<{ activeMeetings: number; endedMeetings: number; meetingsWithRecordings: number } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) api(`/admin/users/${user.id}/offboarding-summary`).then((s) => setSummary(s as typeof summary)).catch(() => setSummary(null));
  }, [open, user.id]);

  useEffect(() => {
    const term = handoverQuery.trim();
    if (!term) {
      setCandidates([]);
      return;
    }
    const t = setTimeout(() => {
      api<Paged<DirectoryUser>>(`/directory?q=${encodeURIComponent(term)}`)
        .then((r) => setCandidates(r.items.filter((u) => u.id !== user.id)))
        .catch(() => setCandidates([]));
    }, 250);
    return () => clearTimeout(t);
  }, [handoverQuery, user.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/admin/users/${user.id}/suspend`, {
        body: {
          reason,
          note: note.trim() || undefined,
          effective: mode === 'now' ? 'now' : date,
          handoverToId: handover?.id ?? undefined,
        },
      });
      toast(mode === 'now' ? `${user.displayName} was suspended and disconnected.` : `Suspension scheduled for ${formatDate(date)}.`, 'success');
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const recipient = handover ? handover.displayName : 'you (the administrator who suspends this account)';
  const sentence = summary
    ? `${summary.activeMeetings} active meeting${summary.activeMeetings === 1 ? '' : 's'} and ${summary.endedMeetings} ended meeting${summary.endedMeetings === 1 ? '' : 's'} (${summary.meetingsWithRecordings} with recordings) will be handed over to ${recipient}.${mode === 'now' ? ' All sessions will be signed out.' : ' Nothing changes until the last working day.'}`
    : '';

  return (
    <Modal open={open} onClose={onClose} title={`Suspend ${user.displayName}`}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="s-reason">Reason</Label>
          <Select id="s-reason" value={reason} onChange={(e) => setReason(e.target.value as SuspensionReason)}>
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="s-note">Note {reason === 'OTHER' ? '(required)' : '(optional, max 500)'}</Label>
          <textarea
            id="s-note"
            maxLength={500}
            required={reason === 'OTHER'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-20 w-full rounded border border-line bg-canvas px-3 py-2 text-fg focus:border-primary focus:outline-none"
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-xs font-medium text-fg-subtle">Takes effect</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" checked={mode === 'now'} onChange={() => setMode('now')} /> Now
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" checked={mode === 'date'} onChange={() => setMode('date')} /> Last working day (23:59, Bangkok time)
            {mode === 'date' && <Input type="date" min={todayBangkok()} value={date} onChange={(e) => setDate(e.target.value)} className="ml-2 w-44" aria-label="Last working day" />}
          </label>
        </fieldset>
        <div>
          <Label htmlFor="s-handover">Hand over rooms and recordings to (optional)</Label>
          {handover ? (
            <div className="flex items-center justify-between rounded border border-line px-3 py-2">
              <span>{handover.displayName}</span>
              <Button icon={<Eraser className="size-4" />} size="sm" variant="ghost" onClick={() => setHandover(null)}>
                Clear
              </Button>
            </div>
          ) : (
            <Input id="s-handover" placeholder="Search active people" value={handoverQuery} onChange={(e) => setHandoverQuery(e.target.value)} />
          )}
          {!handover && candidates.length > 0 && (
            <ul className="mt-1 max-h-40 overflow-auto rounded border border-line">
              {candidates.map((c) => (
                <li key={c.id}>
                  <button type="button" className="w-full px-3 py-2 text-left hover:bg-surface-3" onClick={() => setHandover(c)}>
                    {c.displayName} <span className="text-xs text-fg-subtle">{c.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-fg-subtle">If empty, rooms and recordings go to you.</p>
        </div>
        {sentence && <p className="rounded border border-warning/40 bg-warning/10 px-3 py-2 text-[13px]">{sentence}</p>}
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
          <span>I understand this changes access for {user.displayName}. It can be reversed only by Reactivate, and rooms or recordings handed over are not moved back.</span>
        </label>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button icon={<X className="size-4" />} type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" loading={busy} disabled={!confirmed || (reason === 'OTHER' && !note.trim())} icon={<UserX className="size-4" />}>
            {mode === 'now' ? 'Suspend now' : 'Schedule suspension'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReactivateModal({ open, user, onClose, onDone }: { open: boolean; user: AdminUserDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/admin/users/${user.id}/reactivate`, { body: { password, note: note.trim() || undefined } });
      toast('Account reactivated. The user must change the temporary password at sign-in.', 'success');
      setPassword('');
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Reactivate ${user.displayName}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-[13px] text-fg-subtle">Rooms and recordings that were handed over are not moved back automatically.</p>
        <div>
          <Label htmlFor="re-pass">Temporary password (min. 10 characters)</Label>
          <Input id="re-pass" type="text" required minLength={10} autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="re-note">Note (optional)</Label>
          <Input id="re-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button icon={<X className="size-4" />} type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={<UserCheck className="size-4" />} type="submit" loading={busy}>
            Reactivate
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AnonymizeModal({ open, user, onClose, onDone }: { open: boolean; user: AdminUserDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [confirmEmail, setConfirmEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const matches = confirmEmail.trim().toLowerCase() === user.email.toLowerCase();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/admin/users/${user.id}/anonymize`, { body: { confirmEmail } });
      toast('Personal data was removed. This cannot be undone.', 'success');
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Anonymize account">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-[13px]">
          This removes name, email, phone, employee ID, job title, department, photo and the password. Meetings and recordings stay, and their history shows &ldquo;Former user&rdquo;.
          <strong> This cannot be reversed and the account cannot be reactivated.</strong>
        </p>
        <div>
          <Label htmlFor="an-email">Type the account email to confirm: {user.email}</Label>
          <Input id="an-email" type="email" autoComplete="off" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button icon={<X className="size-4" />} type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={<ShieldOff className="size-4" />} type="submit" variant="danger" loading={busy} disabled={!matches}>
            Anonymize permanently
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ open, user, onClose }: { open: boolean; user: AdminUserDetail; onClose: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/admin/users/${user.id}/reset-password`, { body: { password } });
      toast(`Password reset for ${user.email}. They must change it at sign-in and their sessions were signed out.`, 'success');
      setPassword('');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Reset password — ${user.displayName}`}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="r-pass">Temporary password (min. 10 characters)</Label>
          <Input id="r-pass" type="text" required minLength={10} autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button icon={<X className="size-4" />} type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={<KeyRound className="size-4" />} type="submit" loading={busy}>
            Reset password
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SessionsSection({ userId }: { userId: string }) {
  const toast = useToast();
  const [items, setItems] = useState<SessionInfo[] | null>(null);
  const load = useCallback(() => {
    api<{ items: SessionInfo[] }>(`/admin/users/${userId}/sessions`)
      .then((r) => setItems(r.items))
      .catch((e) => toast(errorMessage(e), 'error'));
  }, [userId, toast]);
  useEffect(load, [load]);

  async function signOut(publicId: string) {
    try {
      await api(`/admin/users/${userId}/sessions/${publicId}`, { method: 'DELETE' });
      load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }
  async function signOutAll() {
    try {
      await api(`/admin/users/${userId}/sessions/revoke-all`, { method: 'POST' });
      toast('All sessions signed out', 'success');
      load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Active sessions</h2>
        {items && items.length > 0 && (
          <Button icon={<LogOut className="size-4" />} size="sm" variant="secondary" onClick={signOutAll}>
            Sign out all
          </Button>
        )}
      </div>
      {!items && <Spinner />}
      {items && items.length === 0 && <p className="text-fg-subtle">No active sessions.</p>}
      {items && items.length > 0 && (
        <ul className="divide-y divide-line/60">
          {items.map((s) => (
            <li key={s.publicId} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0 text-[13px]">
                <p className="font-medium">{s.deviceLabel}</p>
                <p className="text-fg-subtle">
                  {s.ip ?? 'Unknown IP'} · signed in {s.createdAt ? formatDateTime(s.createdAt) : '—'} · last active {s.lastSeenAt ? formatRelative(s.lastSeenAt) : '—'}
                </p>
              </div>
              <Button icon={<LogOut className="size-4" />} size="sm" variant="ghost" onClick={() => signOut(s.publicId)}>
                Sign out
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function StatusSection({ user, onChanged }: { user: AdminUserDetail; onChanged: () => void }) {
  const toast = useToast();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [anonymizeOpen, setAnonymizeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const scheduled = user.currentSuspension?.status === 'SCHEDULED' ? user.currentSuspension : null;
  const suspendedNow = user.status === 'SUSPENDED';
  const canSuspend = !scheduled && !suspendedNow && user.status !== 'ANONYMIZED';

  async function cancelScheduled() {
    setBusy(true);
    try {
      await api(`/admin/users/${user.id}/suspension/cancel`, { method: 'POST' });
      toast('Scheduled suspension cancelled', 'success');
      onChanged();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Status</h2>
          <p className="mt-1 flex items-center gap-2 text-[13px] text-fg-subtle">
            <Pill tone={user.status === 'ACTIVE' ? 'success' : user.status === 'LEAVING' ? 'warning' : user.status === 'SUSPENDED' ? 'danger' : 'neutral'}>{STATUS_LABEL[user.status]}</Pill>
            {scheduled && <span>Leaving on {formatDate(scheduled.effectiveAt)}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {scheduled && (
            <Button icon={<CalendarX className="size-4" />} variant="secondary" onClick={cancelScheduled} loading={busy}>
              Cancel scheduled suspension
            </Button>
          )}
          {canSuspend && (
            <Button icon={<UserX className="size-4" />} variant="danger" onClick={() => setSuspendOpen(true)}>
              Suspend…
            </Button>
          )}
          {suspendedNow && (
            <Button icon={<UserCheck className="size-4" />} onClick={() => setReactivateOpen(true)}>Reactivate</Button>
          )}
          {suspendedNow && user.currentSuspension?.status === 'ACTIVE' && (
            <Button icon={<ShieldOff className="size-4" />} variant="danger" onClick={() => setAnonymizeOpen(true)}>
              Anonymize…
            </Button>
          )}
        </div>
      </div>

      {user.suspensionHistory.length > 0 && (
        <>
          <h3 className="mb-2 text-xs font-medium tracking-[0.015em] text-fg-subtle uppercase">Suspension history</h3>
          <ul className="divide-y divide-line/60 text-[13px]">
            {user.suspensionHistory.map((s: Suspension) => (
              <li key={s.id} className="py-2">
                <span className="font-medium">{REASONS.find((r) => r.value === s.reason)?.label ?? s.reason}</span>{' '}
                <span className="text-fg-subtle">
                  · {s.status.toLowerCase()} · effective {formatDate(s.effectiveAt)} · recorded {formatDateTime(s.createdAt)}
                  {s.liftedAt ? ` · reactivated ${formatDateTime(s.liftedAt)}` : ''}
                  {s.cancelledAt ? ` · cancelled ${formatDateTime(s.cancelledAt)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <SuspendModal open={suspendOpen} user={user} onClose={() => setSuspendOpen(false)} onDone={onChanged} />
      <ReactivateModal open={reactivateOpen} user={user} onClose={() => setReactivateOpen(false)} onDone={onChanged} />
      <AnonymizeModal open={anonymizeOpen} user={user} onClose={() => setAnonymizeOpen(false)} onDone={onChanged} />
    </Card>
  );
}

export default function AdminUserPage() {
  const { id } = useParams<{ id: string }>();
  const { user: me } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const isAdmin = me?.role === 'ADMIN';
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState('');
  const [resetOpen, setResetOpen] = useState(false);

  const load = useCallback(() => {
    api<AdminUserDetail>(`/admin/users/${id}`)
      .then(setUser)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  useEffect(() => {
    if (me && !isAdmin) router.replace('/');
    else if (isAdmin) {
      load();
      api<Department[]>('/admin/departments').then(setDepartments).catch(() => undefined);
    }
  }, [me, isAdmin, load, router]);

  async function unlockLogin() {
    try {
      await api(`/admin/users/${id}/unlock-login`, { method: 'POST' });
      toast('Sign-in unlocked', 'success');
      load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  if (!isAdmin) return null;
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!user) return <Spinner />;

  const isSelf = user.id === me?.id;
  const anonymized = user.status === 'ANONYMIZED';

  return (
    <>
      <Link href="/admin/users" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-fg-subtle hover:text-fg">
        <ArrowLeft className="size-4" /> Users
      </Link>
      <PageHeader
        title={anonymized ? `Former user #${user.id.slice(0, 4).toUpperCase()}` : user.displayName}
        subtitle={
          <span className="flex items-center gap-3">
            <Avatar userId={user.id} name={user.displayName} avatarVersion={user.avatarVersion} size="lg" />
            <span>
              {user.email} · {user.role}
              {user.employeeId && <> · {user.employeeId}</>}
              {isSelf && <> · you</>}
            </span>
          </span>
        }
        actions={
          !anonymized && (
            <Button icon={<KeyRound className="size-4" />} variant="secondary" onClick={() => setResetOpen(true)}>
              Reset password
            </Button>
          )
        }
      />

      <div className="grid gap-6">
        {!anonymized && <ProfileSection user={user} isSelf={isSelf} departments={departments} onSaved={(u) => setUser({ ...user, ...u })} />}

        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Account</h2>
          <dl className="grid gap-3 text-[13px] sm:grid-cols-3">
            <div>
              <dt className="text-fg-subtle">Last login</dt>
              <dd>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}</dd>
            </div>
            <div>
              <dt className="text-fg-subtle">Created</dt>
              <dd>{formatDateTime(user.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-fg-subtle">Must change password</dt>
              <dd>{user.mustChangePassword ? 'Yes' : 'No'}</dd>
            </div>
          </dl>
          {user.loginLockedSeconds > 0 && !anonymized && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-[13px]">
              <span>Sign-in is locked for about {Math.ceil(user.loginLockedSeconds / 60)} more minute(s) after wrong passwords.</span>
              <Button size="sm" variant="secondary" icon={<LockOpen className="size-4" />} onClick={unlockLogin}>
                Unlock sign-in
              </Button>
            </div>
          )}
        </Card>

        {!anonymized && <StatusSection user={user} onChanged={load} />}
        {!anonymized && <SessionsSection userId={user.id} />}
        {anonymized && <p className="text-[13px] text-fg-subtle">This account was anonymized on {formatDateTime(user.anonymizedAt)}. Personal data was removed.</p>}
      </div>

      {!anonymized && <ResetPasswordModal open={resetOpen} user={user} onClose={() => setResetOpen(false)} />}
    </>
  );
}
