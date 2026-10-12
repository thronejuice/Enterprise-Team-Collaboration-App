'use client';

import { Check, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '@/components/logo';
import { useToast } from '@/components/toast';
import { Button, Card, ErrorText, PageHeader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth, useRequireUser } from '@/lib/auth';
import { PRIVACY_NOTICE, PRIVACY_NOTICE_VERSION } from '@/lib/privacy';

/** Shown once per notice version. Standalone page (no sidebar), like change-password. */
export default function PrivacyNoticePage() {
  const user = useRequireUser();
  const { setUser, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!user) return null;

  async function accept() {
    setBusy(true);
    setError('');
    try {
      const res = await api<{ user: typeof user }>('/auth/privacy-notice', { method: 'POST' });
      setUser(res.user);
      toast('Thank you. You can read this notice again from My profile.', 'success');
      router.replace('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <Logo className="size-10" />
          <span className="text-sm text-fg-subtle">Nexus Meet</span>
        </div>
        <PageHeader title="Privacy notice" subtitle={`Version ${PRIVACY_NOTICE_VERSION}. Please read it before you use Nexus Meet.`} />
        <Card className="space-y-5 p-5">
          {PRIVACY_NOTICE.map((section) => (
            <section key={section.title}>
              <h2 className="mb-1 font-semibold">{section.title}</h2>
              <p className="text-[14px] text-fg-muted">{section.body}</p>
            </section>
          ))}
          <ErrorText>{error}</ErrorText>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-4">
            <button onClick={logout} className="inline-flex items-center gap-1.5 text-[13px] text-fg-subtle hover:text-fg">
              <LogOut className="size-4" /> Sign out
            </button>
            <Button onClick={accept} loading={busy} icon={<Check className="size-4" />}>
              I have read and accept
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
