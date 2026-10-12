'use client';

import { Pencil, Plus, Power, PowerOff, Save, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/modal';
import { useToast } from '@/components/toast';
import { Button, Card, EmptyState, ErrorText, Input, Label, PageHeader, Pill, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { AdminDepartment } from '@/lib/types';

function NameModal({ open, department, onClose, onSaved }: { open: boolean; department: AdminDepartment | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(department?.name ?? '');
    setError('');
  }, [department, open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (department) await api(`/admin/departments/${department.id}`, { method: 'PATCH', body: { name } });
      else await api('/admin/departments', { body: { name } });
      toast(department ? 'Department renamed' : 'Department added', 'success');
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={department ? 'Rename department' : 'Add department'}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="d-name">Name (1–100 characters, unique ignoring case)</Label>
          <Input id="d-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button icon={<X className="size-4" />} type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} icon={department ? <Save className="size-4" /> : <Plus className="size-4" />}>
            {department ? 'Save' : 'Add'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function DepartmentsPage() {
  const { user: me } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const isAdmin = me?.role === 'ADMIN';
  const [items, setItems] = useState<AdminDepartment[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<AdminDepartment | null | 'new'>(null);

  const load = useCallback(() => {
    api<AdminDepartment[]>('/admin/departments')
      .then(setItems)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(() => {
    if (me && !isAdmin) router.replace('/');
    else if (isAdmin) load();
  }, [me, isAdmin, load, router]);

  async function setActive(d: AdminDepartment, isActive: boolean) {
    try {
      await api(`/admin/departments/${d.id}`, { method: 'PATCH', body: { isActive } });
      toast(isActive ? `${d.name} is active again` : `${d.name} is hidden from new choices. Existing users keep it.`, 'success');
      load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  if (!isAdmin) return null;

  return (
    <>
      <PageHeader
        title="Departments"
        subtitle="Departments are deactivated, never deleted, so existing users keep their history."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Add department
          </Button>
        }
      />
      <Card className="overflow-hidden">
        {error && (
          <div className="p-5">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        {!items && !error && (
          <div className="p-5">
            <Spinner />
          </div>
        )}
        {items && items.length === 0 && <EmptyState icon={<Plus className="size-8" />} title="No departments yet">Add the first one to use it on user profiles.</EmptyState>}
        {items && items.length > 0 && (
          <table className="w-full text-left">
            <thead className="border-b border-line/60 text-xs tracking-[0.015em] text-fg-subtle uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Active users</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {items.map((d) => (
                <tr key={d.id} className={d.isActive ? '' : 'opacity-70'}>
                  <td className="px-5 py-3 font-medium">{d.name}</td>
                  <td className="px-5 py-3 text-[13px]">{d.activeUserCount}</td>
                  <td className="px-5 py-3">{d.isActive ? <Pill tone="success">Active</Pill> : <Pill>Inactive</Pill>}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(d)} title="Rename">
                        <Pencil className="size-4" /> Rename
                      </Button>
                      {d.isActive ? (
                        <Button icon={<PowerOff className="size-4" />} variant="ghost" size="sm" onClick={() => setActive(d, false)}>
                          Deactivate
                        </Button>
                      ) : (
                        <Button icon={<Power className="size-4" />} variant="ghost" size="sm" onClick={() => setActive(d, true)}>
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <NameModal open={editing !== null} department={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={load} />
    </>
  );
}
