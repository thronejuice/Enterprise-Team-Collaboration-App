'use client';

import { Activity, Building2, Contact, Film, Home, LogOut, PanelLeftClose, PanelLeftOpen, ScrollText, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { useAuth, useRequireUser } from '@/lib/auth';
import { initials } from '@/lib/format';
import { Avatar } from './avatar';
import { Logo } from './logo';
import { NotificationBell } from './notification-bell';
import { WhatsNew } from './whats-new';
import { cx, Spinner } from './ui';

const nav = [
  { href: '/', label: 'Home', icon: Home, admin: false },
  { href: '/recordings', label: 'Recordings', icon: Film, admin: false },
  { href: '/people', label: 'People', icon: Contact, admin: false },
  { href: '/diagnostics', label: 'Connection test', icon: Activity, admin: false },
  { href: '/admin/users', label: 'Users', icon: Users, admin: true },
  { href: '/admin/departments', label: 'Departments', icon: Building2, admin: true },
  { href: '/admin/audit', label: 'Audit log', icon: ScrollText, admin: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const user = useRequireUser();
  const { logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(true);

  // Before the app: a forced password change first, then the privacy notice. The API enforces both; this sends people there.
  useEffect(() => {
    if (user?.mustChangePassword) router.replace('/change-password');
    else if (user && !user.privacyNoticeAccepted) router.replace('/privacy-notice');
  }, [user, router]);

  useEffect(() => {
    try {
      if (localStorage.getItem('nav-open') === '0') setOpen(false);
    } catch {}
  }, []);

  const toggle = () =>
    setOpen((v) => {
      try {
        localStorage.setItem('nav-open', v ? '0' : '1');
      } catch {}
      return !v;
    });

  if (!user) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner />
      </div>
    );
  }

  const items = nav.filter((n) => !n.admin || user.role === 'ADMIN');
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <div className="flex min-h-dvh">
      <nav
        className={cx(
          'sticky top-0 flex h-dvh shrink-0 flex-col gap-1 border-r border-line/60 bg-canvas p-3 transition-[width] duration-200',
          open ? 'w-56' : 'w-16 items-center',
        )}
        aria-label="Main"
      >
        <div className={cx('mb-4 flex items-center', open ? 'justify-between' : 'flex-col gap-2')}>
          <Link href="/" aria-label="Nexus home">
            <Logo />
          </Link>
          <button
            onClick={toggle}
            title={open ? 'Collapse menu' : 'Expand menu'}
            aria-label={open ? 'Collapse menu' : 'Expand menu'}
            aria-expanded={open}
            className="grid size-9 place-items-center rounded-md text-fg-subtle hover:bg-surface hover:text-fg"
          >
            {open ? <PanelLeftClose className="size-5" /> : <PanelLeftOpen className="size-5" />}
          </button>
        </div>
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            title={label}
            aria-label={label}
            aria-current={isActive(href) ? 'page' : undefined}
            className={cx(
              'flex h-11 items-center gap-3 rounded-md transition-colors',
              open ? 'px-3' : 'w-11 justify-center',
              isActive(href) ? 'bg-primary text-white' : 'text-fg-subtle hover:bg-surface hover:text-fg',
            )}
          >
            <Icon className="size-5 shrink-0" />
            {open && <span className="truncate text-sm">{label}</span>}
          </Link>
        ))}
        <div className="mt-auto">
          <NotificationBell collapsed={!open} />
        </div>
        <div className={cx('mt-1 flex gap-2', open ? 'items-center justify-between' : 'flex-col items-center')}>
          <Link
            href="/profile"
            title={`${user.displayName} · ${user.role}: My profile`}
            aria-label="My profile"
            aria-current={pathname === '/profile' ? 'page' : undefined}
            className="flex min-w-0 items-center gap-2 rounded-md p-1 hover:bg-surface"
          >
            <div className="relative shrink-0">
              <Avatar userId={user.id} name={user.displayName} avatarVersion={user.avatarVersion} />
              <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-success ring-2 ring-canvas" />
            </div>
            {open && <span className="truncate text-sm">{user.displayName}</span>}
          </Link>
          <button onClick={logout} title="Sign out" aria-label="Sign out" className="grid size-11 shrink-0 place-items-center rounded-md text-fg-subtle hover:bg-surface hover:text-fg">
            <LogOut className="size-5" />
          </button>
        </div>
      </nav>
      <main className="min-w-0 flex-1 px-6 py-8 lg:px-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      {!user.mustChangePassword && user.privacyNoticeAccepted && <WhatsNew />}
    </div>
  );
}

export { initials };
