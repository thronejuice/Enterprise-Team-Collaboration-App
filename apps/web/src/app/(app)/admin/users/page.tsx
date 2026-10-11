'use client';

import { KeyRound, Plus, UserCheck, UserX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/modal';
import { useToast } from '@/components/toast';
import { Button, Card, ErrorText, Input, Label, PageHeader, Pill, Select, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import type { AdminUser, UserRole } from '@/lib/types';

const ROLES: { value: UserRole; label: string; hint: string }[] = [
  { value: 'MEMBER', label: 'Member', hint: 'Joins meetings with a room code' },
  { value: 'HOST', label: 'Host', hint: 'Creates meetings, records, removes and mutes participants' },
  { value: 'ADMIN', label: 'Admin', hint: 'Everything, plus user management and audit log' },
];

function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ email: '', displayName: '', role: 'MEMBER' as UserRole, password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/admin/users', { body: form });
      toast(`Created ${form.email}`, 'success');
      setForm({ email: '', displayName: '', role: 'MEMBER', password: '' });
      onCreated();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create user">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="u-name">Display name</Label>
          <Input id="u-name" required maxLength={80} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="u-email">Email</Label>
          <Input id="u-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="u-role">Role</Label>
          <Select id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label} — {r.hint}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="u-pass">Initial password (min. 10 characters)</Label>
          <Input id="u-pass" type="text" required minLength={10} autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Create user
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      await api(`/admin/users/${user.id}/reset-password`, { body: { password } });
      toast(`Password reset for ${user.email}. Their sessions were signed out.`, 'success');
      setPassword('');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!user} onClose={onClose} title={`Reset password — ${user?.displayName ?? ''}`}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="r-pass">New password (min. 10 characters)</Label>
          <Input id="r-pass" type="text" required minLength={10} autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Reset password
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const isAdmin = me?.role === 'ADMIN';
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<AdminUser | null>(null);

  const load = useCallback(() => {
    api<AdminUser[]>('/admin/users')
      .then(setUsers)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => {
    if (me && !isAdmin) router.replace('/');
    else if (isAdmin) load();
  }, [me, isAdmin, load, router]);

  async function update(u: AdminUser, changes: Partial<Pick<AdminUser, 'role' | 'isActive'>>) {
    try {
      const updated = await api<AdminUser>(`/admin/users/${u.id}`, { method: 'PATCH', body: changes });
      setUsers((list) => list?.map((x) => (x.id === u.id ? updated : x)) ?? null);
      if (changes.isActive === false) toast(`${u.displayName} was disabled and disconnected.`, 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  if (!isAdmin) return null;

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Accounts are created by administrators; there is no self sign-up."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Create user
          </Button>
        }
      />
      <Card className="overflow-hidden">
        {error && <div className="p-5"><ErrorText>{error}</ErrorText></div>}
        {!users && !error && <div className="p-5"><Spinner /></div>}
        {users && (
          <table className="w-full text-left">
            <thead className="border-b border-line/60 text-xs tracking-[0.015em] text-fg-subtle uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {users.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id} className={u.isActive ? '' : 'opacity-60'}>
                    <td className="px-5 py-3">
                      <p className="font-medium">
                        {u.displayName} {self && <span className="text-fg-subtle">(you)</span>}
                      </p>
                      <p className="text-xs text-fg-subtle">{u.email}</p>
                    </td>
                    <td className="px-5 py-3">
                      <Select value={u.role} disabled={self} onChange={(e) => update(u, { role: e.target.value as UserRole })} className="h-8 w-28" aria-label={`Role for ${u.displayName}`}>
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-5 py-3">{u.isActive ? <Pill tone="success">Active</Pill> : <Pill>Disabled</Pill>}</td>
                    <td className="px-5 py-3 text-[13px] text-fg-muted">{formatDateTime(u.createdAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setResetting(u)} title="Reset password">
                          <KeyRound className="size-4" />
                        </Button>
                        {!self &&
                          (u.isActive ? (
                            <Button variant="ghost" size="sm" onClick={() => update(u, { isActive: false })} title="Disable user">
                              <UserX className="size-4" /> Disable
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => update(u, { isActive: true })} title="Enable user">
                              <UserCheck className="size-4" /> Enable
                            </Button>
                          ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      <CreateUserModal open={creating} onClose={() => setCreating(false)} onCreated={load} />
      <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />
    </>
  );
}
