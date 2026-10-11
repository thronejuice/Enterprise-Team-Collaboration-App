'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, ErrorText, Input, Label, PageHeader, Pill, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AuditItem } from '@/lib/types';

const PREFIXES = ['', 'auth.', 'user.', 'meeting.', 'recording.'];

export default function AuditPage() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState('');
  const [failedOnly, setFailedOnly] = useState(false);

  const load = useCallback(
    async (before?: string) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ limit: '50' });
        if (before) qs.set('before', before);
        if (action) qs.set('action', action);
        if (failedOnly) qs.set('failedOnly', 'true');
        const res = await api<{ items: AuditItem[]; nextBefore: string | null }>(`/admin/audit?${qs}`);
        setItems((prev) => (before ? [...prev, ...res.items] : res.items));
        setNext(res.nextBefore);
        setError('');
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [action, failedOnly],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader title="Audit log" subtitle="Security events and recording access. Tokens and secrets are never logged." />
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div>
          <Label>Category</Label>
          <div className="flex gap-1">
            {PREFIXES.map((p) => (
              <Button key={p || 'all'} size="sm" variant={action === p ? 'primary' : 'secondary'} onClick={() => setAction(p)}>
                {p ? p.replace('.', '') : 'all'}
              </Button>
            ))}
          </div>
        </div>
        <label className="flex h-8 items-center gap-2 text-[13px] text-fg-muted">
          <input type="checkbox" className="size-4 accent-primary" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} />
          Failures only
        </label>
        <div className="ml-auto w-56">
          <Label htmlFor="act">Exact action prefix</Label>
          <Input id="act" placeholder="e.g. meeting.code_" value={action} onChange={(e) => setAction(e.target.value)} />
        </div>
      </div>
      <Card className="overflow-x-auto">
        {error && <div className="p-5"><ErrorText>{error}</ErrorText></div>}
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-line/60 text-xs tracking-[0.015em] text-fg-subtle uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Target</th>
              <th className="px-4 py-3 font-medium">IP</th>
              <th className="px-4 py-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {items.map((i) => (
              <tr key={i.id} className="align-top">
                <td className="tnum px-4 py-2.5 whitespace-nowrap text-fg-muted">{formatDateTime(i.createdAt)}</td>
                <td className="px-4 py-2.5">
                  <span className="font-mono text-xs">{i.action}</span> {!i.success && <Pill tone="danger">fail</Pill>}
                </td>
                <td className="px-4 py-2.5">{i.actor ? (i.actor.displayName ?? i.actor.id.slice(0, 8)) : <span className="text-fg-subtle">system</span>}</td>
                <td className="px-4 py-2.5 text-fg-muted">{i.targetType ? `${i.targetType} ${i.targetId?.slice(0, 8)}` : '—'}</td>
                <td className="tnum px-4 py-2.5 text-fg-muted">{i.ip ?? '—'}</td>
                <td className="max-w-xs truncate px-4 py-2.5 font-mono text-xs text-fg-subtle" title={i.metadata ? JSON.stringify(i.metadata) : ''}>
                  {i.metadata ? JSON.stringify(i.metadata) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="p-4"><Spinner /></div>}
        {!loading && items.length === 0 && <p className="p-5 text-fg-subtle">No events match.</p>}
      </Card>
      {next && !loading && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={() => void load(next)}>
            Load older events
          </Button>
        </div>
      )}
    </>
  );
}
