'use client';

import { Download, FileText, LogOut, Save, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { PasswordForm } from '@/components/password-form';
import { useToast } from '@/components/toast';
import { Button, buttonClass, Card, ErrorText, Input, Label, PageHeader, Pill, Select, Spinner } from '@/components/ui';
import { api, apiUpload, downloadCsv, errorMessage } from '@/lib/api';
import { useAuth, useRequireUser } from '@/lib/auth';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { Department, Profile, SessionInfo } from '@/lib/types';

const AVATAR_MAX = 2 * 1024 * 1024;

function AvatarSection({ profile, onChanged }: { profile: Profile; onChanged: (version: number | null) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > AVATAR_MAX) return toast('The photo must be 2 MB or smaller.', 'error');
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiUpload<{ avatarVersion: number | null }>('/me/avatar', form);
      onChanged(res.avatarVersion);
      toast('Photo updated', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api('/me/avatar', { method: 'DELETE' });
      onChanged(null);
      toast('Photo removed', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar userId={profile.id} name={profile.displayName} avatarVersion={profile.avatarVersion} size="xl" />
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded border border-line bg-surface px-3 text-sm font-medium hover:bg-surface-3">
          <Upload className="size-4" /> Upload photo
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={upload} disabled={busy} aria-label="Upload photo" />
        </label>
        {profile.avatarVersion && (
          <Button icon={<Trash2 className="size-4" />} variant="ghost" onClick={remove} loading={busy}>
            <Trash2 className="size-4" /> Remove
          </Button>
        )}
      </div>
      <p className="w-full text-xs text-fg-subtle">JPG, PNG or WebP, up to 2 MB. Cropped to a square and metadata is removed.</p>
    </div>
  );
}

function ProfileSection({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [departmentId, setDepartmentId] = useState(profile.department?.id ?? '');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Department[]>('/departments').then(setDepartments).catch(() => undefined);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const updated = await api<Profile>('/me/profile', { method: 'PATCH', body: { displayName, phone: phone.trim() || null, departmentId: departmentId || null } });
      onSaved(updated);
      toast('Profile saved', 'success');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const managed = (label: string, value: string | null) => (
    <div>
      <p className="text-xs font-medium tracking-[0.015em] text-fg-subtle">{label}</p>
      <p className="text-[15px]">{value || <span className="text-fg-subtle">—</span>}</p>
    </div>
  );

  return (
    <Card className="p-5">
      <h2 className="mb-4 font-semibold">Profile</h2>
      <AvatarSection profile={profile} onChanged={(v) => onSaved({ ...profile, avatarVersion: v })} />
      <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="pf-display">Display name</Label>
          <Input id="pf-display" required maxLength={80} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <p className="mt-1 text-xs text-fg-subtle">The name shown in meetings and the directory.</p>
        </div>
        <div>
          <Label htmlFor="pf-phone">Phone (optional)</Label>
          <Input id="pf-phone" maxLength={20} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pf-dept">Department</Label>
          <Select id="pf-dept" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">— Not set —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
            {profile.department && !profile.department.isActive && <option value={profile.department.id}>{profile.department.name} (inactive)</option>}
          </Select>
          <p className="mt-1 text-xs text-fg-subtle">Choose the department you work in.</p>
        </div>
        <div className="sm:col-span-2">
          <ErrorText>{error}</ErrorText>
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <Button icon={<Save className="size-4" />} type="submit" loading={busy}>
            Save
          </Button>
        </div>
      </form>

      <div className="mt-6 grid gap-4 border-t border-line/60 pt-6 sm:grid-cols-2">
        {managed('First name', profile.firstName)}
        {managed('Last name', profile.lastName)}
        {managed('Job title', profile.jobTitle)}
        {managed('Employee ID', profile.employeeId)}
        {managed('Email', profile.email)}
        <p className="text-xs text-fg-subtle sm:col-span-2">Managed by your administrator.</p>
      </div>
    </Card>
  );
}

function SessionsSection() {
  const toast = useToast();
  const [items, setItems] = useState<SessionInfo[] | null>(null);
  const load = useCallback(() => {
    api<{ items: SessionInfo[] }>('/auth/sessions')
      .then((r) => setItems(r.items))
      .catch((e) => toast(errorMessage(e), 'error'));
  }, [toast]);
  useEffect(load, [load]);

  async function signOut(publicId: string) {
    try {
      await api(`/auth/sessions/${publicId}`, { method: 'DELETE' });
      toast('Signed out of that device', 'success');
      load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  async function signOutOthers() {
    try {
      await api('/auth/sessions/revoke-others', { method: 'POST' });
      toast('Signed out of all other devices', 'success');
      load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Sessions</h2>
        {items && items.length > 1 && (
          <Button icon={<LogOut className="size-4" />} size="sm" variant="secondary" onClick={signOutOthers}>
            Sign out all other devices
          </Button>
        )}
      </div>
      {!items && <Spinner />}
      {items && (
        <ul className="divide-y divide-line/60">
          {items.map((s) => (
            <li key={s.publicId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 text-[13px]">
                <p className="flex items-center gap-2 font-medium">
                  {s.deviceLabel} {s.current && <Pill tone="primary">This device</Pill>}
                </p>
                <p className="text-fg-subtle">
                  {s.ip ?? 'Unknown IP'} · signed in {s.createdAt ? formatDateTime(s.createdAt) : '—'} · last active {s.lastSeenAt ? formatRelative(s.lastSeenAt) : '—'}
                </p>
              </div>
              {!s.current && (
                <Button icon={<LogOut className="size-4" />} size="sm" variant="ghost" onClick={() => signOut(s.publicId)}>
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function ProfilePage() {
  const user = useRequireUser();
  const { setUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const toast = useToast();

  useEffect(() => {
    if (!user) return;
    api<Profile>('/me/profile')
      .then(setProfile)
      .catch((e) => setError(errorMessage(e)));
  }, [user]);

  if (!user) return null;

  function saved(next: Profile) {
    setProfile(next);
    // Keep the sidebar in step with the name and photo.
    setUser({ ...user!, displayName: next.displayName, avatarVersion: next.avatarVersion });
  }

  return (
    <>
      <PageHeader title="My profile" subtitle="Your name, photo and contact details. Changes apply everywhere you appear." />
      {error && <ErrorText>{error}</ErrorText>}
      {!profile && !error && <Spinner />}
      {profile && (
        <div className="grid gap-6">
          <ProfileSection profile={profile} onSaved={saved} />
          <Card className="p-5">
            <h2 className="mb-4 font-semibold">Password</h2>
            <PasswordForm
              onChanged={() => toast('Password changed. Your other devices were signed out.', 'success')}
            />
          </Card>
          <SessionsSection />
          <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <h2 className="font-semibold">Your data</h2>
              <p className="text-[13px] text-fg-subtle">Download a copy of what the system holds about you, or read the privacy notice again.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => downloadCsv('/me/data-export').catch((e) => toast(errorMessage(e), 'error'))} icon={<Download className="size-4" />}>
                Download my data
              </Button>
              <Link href="/privacy-notice" className={buttonClass('secondary')}>
                <FileText className="size-4" /> Privacy notice
              </Link>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
