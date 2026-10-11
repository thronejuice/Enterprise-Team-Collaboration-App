'use client';

import { LockKeyhole } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { Logo } from '@/components/logo';
import { Button, ErrorText, Input, Label } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { User } from '@/lib/types';

function safeNext(value: string | null): string {
  // Only allow same-site relative paths.
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function LoginForm() {
  const { user, setUser } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api<{ user: User }>('/auth/login', { body: { email, password } });
      setUser(res.user);
      router.replace(next);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="email">Work email</Label>
        <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" size="lg" loading={busy}>
        Sign in
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <Logo className="size-11" />
          <div>
            <p className="text-xl leading-7 font-semibold tracking-[-0.015em]">Nexus Meet</p>
            <p className="text-xs text-fg-subtle">Enterprise meetings · LAN demo</p>
          </div>
        </div>
        <div className="rounded-xl border border-line/60 bg-surface p-6 shadow-float">
          <h1 className="mb-1 text-xl leading-7 font-semibold">Sign in</h1>
          <p className="mb-5 text-fg-subtle">Use the account your administrator created for you.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-4 flex items-center gap-1.5 text-xs text-fg-subtle">
          <LockKeyhole className="size-3.5" /> A room code alone never grants access — you must be signed in.
        </p>
      </div>
    </div>
  );
}
