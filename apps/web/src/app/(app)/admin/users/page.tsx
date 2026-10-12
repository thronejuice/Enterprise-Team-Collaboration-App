'use client';

import { ChevronLeft, ChevronRight, Download, Plus, Upload, UserPlus, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { Modal } from '@/components/modal';
import { useToast } from '@/components/toast';
import { Button, buttonClass, Card, EmptyState, ErrorText, Input, Label, PageHeader, Pill, Select, Spinner } from '@/components/ui';
import { api, downloadCsv, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime } from '@/lib/format';
import type { AccountStatus, AdminUserRow, Department, Paged, UserRole } from '@/lib/types';

const ROLES: { value: UserRole; label: string; hint: string }[] = [
  { value: 'MEMBER', label: 'Member', hint: 'Joins meetings with a room code' },
  { value: 'HOST', label: 'Host', hint: 'Creates meetings, records, removes and mutes participants' },
  { value: 'ADMIN', label: 'Admin', hint: 'Everything, plus user management and audit log' },
];

const STATUS_LABEL: Record<AccountStatus, string> = { ACTIVE: 'Active', LEAVING: 'Leaving', SUSPENDED: 'Suspended', ANONYMIZED: 'Anonymized' };
const SORTS = [
  { value: 'createdAt', label: 'Created (oldest first)' },
  { value: '-createdAt', label: 'Created (newest first)' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: '-lastLogin', label: 'Last login (newest first)' },
  { value: 'lastLogin', label: 'Last login (oldest first)' },
];
const PAGE_SIZE = 25;

function StatusPill({ status, effectiveAt }: { status: AccountStatus; effectiveAt: string | null }) {
  if (status === 'ACTIVE') return <Pill tone="success">Active</Pill>;
  if (status === 'LEAVING') return <Pill tone="warning">Leaving {effectiveAt ? `on ${formatDate(effectiveAt)}` : ''}</Pill>;
  if (status === 'SUSPENDED') return <Pill tone="danger">Suspended</Pill>;
  return <Pill>{STATUS_LABEL[status]}</Pill>;
}

/** Shared form fields for creating a user. */
function CreateUserModal({ open, onClose, onCreated, departments }: { open: boolean; onClose: () => void; onCreated: () => void; departments: Department[] }) {
  const toast = useToast();
  const empty = { email: '', displayName: '', role: 'MEMBER' as UserRole, password: '', employeeId: '', firstName: '', lastName: '', jobTitle: '', departmentId: '', phone: '' };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof empty) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/admin/users', {
        body: {
          email: form.email,
          displayName: form.displayName,
          role: form.role,
          password: form.password,
          employeeId: form.employeeId,
          firstName: form.firstName || null,
          lastName: form.lastName || null,
          jobTitle: form.jobTitle || null,
          departmentId: form.departmentId || null,
          phone: form.phone || null,
        },
      });
      toast(`Created ${form.email}. They must change the password at first sign-in.`, 'success');
      setForm(empty);
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="u-first">First name</Label>
            <Input id="u-first" maxLength={100} value={form.firstName} onChange={set('firstName')} />
          </div>
          <div>
            <Label htmlFor="u-last">Last name</Label>
            <Input id="u-last" maxLength={100} value={form.lastName} onChange={set('lastName')} />
          </div>
        </div>
        <div>
          <Label htmlFor="u-name">Display name</Label>
          <Input id="u-name" required maxLength={80} value={form.displayName} onChange={set('displayName')} />
        </div>
        <div>
          <Label htmlFor="u-email">Email</Label>
          <Input id="u-email" type="email" required value={form.email} onChange={set('email')} />
        </div>
        <div>
          <Label htmlFor="u-emp">Employee ID</Label>
          <Input id="u-emp" required maxLength={32} pattern="[A-Za-z0-9_\-]+" value={form.employeeId} onChange={set('employeeId')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="u-title">Job title</Label>
            <Input id="u-title" maxLength={100} value={form.jobTitle} onChange={set('jobTitle')} />
          </div>
          <div>
            <Label htmlFor="u-dept">Department</Label>
            <Select id="u-dept" value={form.departmentId} onChange={set('departmentId')}>
              <option value="">— None —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="u-phone">Phone (optional)</Label>
          <Input id="u-phone" maxLength={20} value={form.phone} onChange={set('phone')} />
        </div>
        <div>
          <Label htmlFor="u-role">Role</Label>
          <Select id="u-role" value={form.role} onChange={set('role')}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label} — {r.hint}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="u-pass">Initial password (min. 10 characters)</Label>
          <Input id="u-pass" type="text" required minLength={10} autoComplete="off" value={form.password} onChange={set('password')} />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2 pt-2">
          <Button icon={<X className="size-4" />} type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={<UserPlus className="size-4" />} type="submit" loading={busy}>
            Create user
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function UsersList() {
  const { user: me } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const isAdmin = me?.role === 'ADMIN';

  // Filters live in the query string so a refresh or a shared link shows the same list.
  const q = params.get('q') ?? '';
  const role = params.get('role') ?? '';
  const status = params.get('status') ?? '';
  const departmentId = params.get('departmentId') ?? '';
  const sort = params.get('sort') ?? 'createdAt';
  const page = Math.max(Number(params.get('page') ?? '1') || 1, 1);

  const [search, setSearch] = useState(q);
  const [data, setData] = useState<Paged<AdminUserRow> | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (!('page' in changes)) next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  // Debounce the search box into the URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== q) setParams({ q: search.trim() || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the typed text should trigger this
  }, [search]);

  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (role) query.set('role', role);
  if (status) query.set('status', status);
  if (departmentId) query.set('departmentId', departmentId);
  query.set('sort', sort);
  query.set('page', String(page));

  // Only the newest request may update the table, so a slow earlier response cannot overwrite newer results.
  const latestRequest = useRef(0);
  const load = useCallback(() => {
    const id = ++latestRequest.current;
    setError('');
    api<Paged<AdminUserRow>>(`/admin/users?${query.toString()}`)
      .then((page) => {
        if (id === latestRequest.current) setData(page);
      })
      .catch((e) => {
        if (id === latestRequest.current) setError(errorMessage(e));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.toString()]);

  useEffect(() => {
    if (me && !isAdmin) router.replace('/');
    else if (isAdmin) load();
  }, [me, isAdmin, load, router]);

  useEffect(() => {
    if (isAdmin) api<Department[]>('/admin/departments').then(setDepartments).catch(() => undefined);
  }, [isAdmin]);

  if (!isAdmin) return null;

  const pages = data ? Math.max(Math.ceil(data.total / PAGE_SIZE), 1) : 1;

  async function exportCsv() {
    try {
      await downloadCsv(`/admin/users/export.csv?${query.toString().replace(/&?page=\d+/, '')}`);
      toast('Export downloaded. The export is recorded in the audit log.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Accounts are created by administrators; there is no self sign-up."
        actions={
          <>
            <Link href="/admin/users/import" className={buttonClass('secondary')}>
              <Upload className="size-4" /> Import CSV
            </Link>
            <Button variant="secondary" onClick={exportCsv}>
              <Download className="size-4" /> Export CSV
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Create user
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
        <div>
          <Label htmlFor="f-q">Search</Label>
          <Input id="f-q" placeholder="Name, email or employee ID" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="f-role">Role</Label>
          <Select id="f-role" value={role} onChange={(e) => setParams({ role: e.target.value || null })}>
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="f-dept">Department</Label>
          <Select id="f-dept" value={departmentId} onChange={(e) => setParams({ departmentId: e.target.value || null })}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {!d.isActive ? ' (inactive)' : ''}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="f-status">Status</Label>
          <Select id="f-status" value={status} onChange={(e) => setParams({ status: e.target.value || null })}>
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABEL) as AccountStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="f-sort">Sort by</Label>
          <Select id="f-sort" value={sort} onChange={(e) => setParams({ sort: e.target.value })}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden">
        {error && (
          <div className="p-5">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        {!data && !error && (
          <div className="p-5">
            <Spinner />
          </div>
        )}
        {data && data.total === 0 && <EmptyState icon={<Upload className="size-8" />} title="No users match these filters" />}
        {data && data.total > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead className="border-b border-line/60 text-xs tracking-[0.015em] text-fg-subtle uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">Employee ID</th>
                  <th className="px-5 py-3 font-medium">Department</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Last login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {data.items.map((u) => (
                  <tr key={u.id} className="cursor-pointer hover:bg-surface-3/40" onClick={() => router.push(`/admin/users/${u.id}`)}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar userId={u.id} name={u.displayName} avatarVersion={u.avatarVersion} size="sm" />
                        <div className="min-w-0">
                          <Link href={`/admin/users/${u.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                            {u.displayName}
                            {u.id === me?.id && <span className="text-fg-subtle"> (you)</span>}
                          </Link>
                          <p className="truncate text-xs text-fg-subtle">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-[13px]">{u.employeeId ?? <span className="text-fg-subtle">—</span>}</td>
                    <td className="px-5 py-3 text-[13px]">
                      {u.department ? (
                        <>
                          {u.department.name}
                          {!u.department.isActive && <span className="text-fg-subtle"> (inactive)</span>}
                        </>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-[13px]">{u.role}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={u.status} effectiveAt={u.effectiveAt} />
                    </td>
                    <td className="px-5 py-3 text-[13px] text-fg-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data && data.total > 0 && (
        <div className="mt-4 flex items-center justify-between text-[13px] text-fg-subtle">
          <span>
            {data.total} user{data.total === 1 ? '' : 's'} · page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button icon={<ChevronLeft className="size-4" />} size="sm" variant="secondary" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>
              Previous
            </Button>
            <Button icon={<ChevronRight className="size-4" />} size="sm" variant="secondary" disabled={page >= pages} onClick={() => setParams({ page: String(page + 1) })}>
              Next
            </Button>
          </div>
        </div>
      )}

      <CreateUserModal open={creating} onClose={() => setCreating(false)} onCreated={load} departments={departments.filter((d) => d.isActive)} />
    </>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <UsersList />
    </Suspense>
  );
}
