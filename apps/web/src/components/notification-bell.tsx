'use client';

import { Bell } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { cx } from './ui';

interface Item {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

/** Security and account alerts for the signed-in user. Polled, so nothing needs a push channel. */
export function NotificationBell({ collapsed }: { collapsed: boolean }) {
  const [data, setData] = useState<{ unread: number; items: Item[] }>({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(() => {
    api<{ unread: number; items: Item[] }>('/notifications')
      .then(setData)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  // Close when clicking outside the panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && data.unread > 0) {
      await api('/notifications/read-all', { method: 'POST' }).catch(() => undefined);
      load();
    }
  }

  return (
    <div
      ref={ref}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
      onBlur={(e) => {
        if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        onClick={toggle}
        aria-label={data.unread ? `Notifications, ${data.unread} unread` : 'Notifications'}
        aria-expanded={open}
        title="Notifications"
        className={cx('relative grid size-11 place-items-center rounded-md text-fg-subtle hover:bg-surface hover:text-fg', collapsed && 'size-11')}
      >
        <Bell className="size-5" />
        {data.unread > 0 && (
          <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-danger-hover px-1 text-[10px] leading-4 font-semibold text-white">
            {data.unread > 9 ? '9+' : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute bottom-12 left-0 z-50 w-80 rounded-lg border border-line bg-surface-3 p-3 shadow-float">
          <p className="mb-2 font-semibold">Notifications</p>
          {data.items.length === 0 && <p className="text-[13px] text-fg-subtle">Nothing yet.</p>}
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {data.items.map((n) => (
              <li key={n.id} className={cx('rounded-md p-2 text-[13px]', !n.read && 'bg-surface-3')}>
                <p className="font-medium">{n.title}</p>
                <p className="text-fg-muted">{n.body}</p>
                <p className="mt-1 text-[11px] text-fg-subtle">{formatRelative(n.createdAt)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
