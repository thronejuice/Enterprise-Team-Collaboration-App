'use client';
import { Check } from 'lucide-react';

import { FormEvent, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { Button, ErrorText, Input, Label } from './ui';

export const MIN_PASSWORD = 10;

/** Current / new / confirm. Used on /profile and on the forced /change-password page. */
export function PasswordForm({ onChanged, submitLabel = 'Change password' }: { onChanged: () => void; submitLabel?: string }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (form.newPassword.length < MIN_PASSWORD) return setError(`The new password must be at least ${MIN_PASSWORD} characters.`);
    if (form.newPassword !== form.confirm) return setError('The new password and the confirmation do not match.');
    setBusy(true);
    try {
      await api('/auth/password', { body: { currentPassword: form.currentPassword, newPassword: form.newPassword } });
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor="pw-current">Current password</Label>
        <Input id="pw-current" type="password" autoComplete="current-password" required value={form.currentPassword} onChange={set('currentPassword')} />
      </div>
      <div>
        <Label htmlFor="pw-new">New password (min. {MIN_PASSWORD} characters)</Label>
        <Input id="pw-new" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={form.newPassword} onChange={set('newPassword')} />
      </div>
      <div>
        <Label htmlFor="pw-confirm">Confirm new password</Label>
        <Input id="pw-confirm" type="password" autoComplete="new-password" required value={form.confirm} onChange={set('confirm')} />
      </div>
      <div className="sm:col-span-2">
        <ErrorText>{error}</ErrorText>
        <div className="mt-2 flex justify-end">
          <Button type="submit" loading={busy} icon={<Check className="size-4" />}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
