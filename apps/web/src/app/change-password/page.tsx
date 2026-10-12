'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/logo';
import { PasswordForm } from '@/components/password-form';
import { useToast } from '@/components/toast';
import { Card, PageHeader } from '@/components/ui';
import { useAuth, useRequireUser } from '@/lib/auth';

/** Standalone page (no sidebar) for accounts that must change their password before using the app. */
export default function ChangePasswordPage() {
  const user = useRequireUser();
  const { setUser, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();

  if (!user) return null;

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center gap-3">
          <Logo className="size-10" />
          <span className="text-sm text-fg-subtle">Nexus Meet</span>
        </div>
        <PageHeader title="Change your password" subtitle="Your administrator set a temporary password. Choose your own before continuing." />
        <Card className="p-5">
          <PasswordForm
            submitLabel="Save and continue"
            onChanged={() => {
              setUser({ ...user, mustChangePassword: false });
              toast('Password changed. Your other devices were signed out.', 'success');
              router.replace('/');
            }}
          />
        </Card>
        <button onClick={logout} className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-fg-subtle hover:text-fg">
          <LogOut className="size-4" /> Sign out
        </button>
      </div>
    </div>
  );
}
