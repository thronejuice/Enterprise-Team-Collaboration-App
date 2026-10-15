'use client';

import { Film, X } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { isInFlight, RecordingStatusPill } from '@/components/recording-status';
import { Card, EmptyState, ErrorText, PageHeader, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatBytes, formatDateTime, formatDuration } from '@/lib/format';
import type { Recording } from '@/lib/types';

function RecordingsList() {
  const params = useSearchParams();
  const meetingId = params.get('meeting');
  const [items, setItems] = useState<Recording[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api<Recording[]>(meetingId ? `/meetings/${meetingId}/recordings` : '/recordings');
        if (cancelled) return;
        setItems(data);
        setError('');
        if (data.some((r) => isInFlight(r.status))) timer = setTimeout(load, 4000);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [meetingId]);

  return (
    <>
      <PageHeader
        title="Recordings"
        subtitle={
          meetingId ? (
            <span className="inline-flex items-center gap-2">
              Showing one meeting.
              <Link href="/recordings" className="inline-flex items-center gap-1 text-info hover:underline">
                <X className="size-3.5" /> Show all
              </Link>
            </span>
          ) : (
            'Recordings of meetings you hosted or joined.'
          )
        }
      />
      <Card className="overflow-hidden">
        {error && <div className="p-5"><ErrorText>{error}</ErrorText></div>}
        {!items && !error && <div className="p-5"><Spinner /></div>}
        {items && items.length === 0 && (
          <EmptyState icon={<Film className="size-8" />} title="No recordings">
            When a host records a meeting you attended, it appears here once it has been saved.
          </EmptyState>
        )}
        {items && items.length > 0 && (
          <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-line/60 text-xs font-medium tracking-[0.015em] text-fg-subtle uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Meeting</th>
                <th className="px-5 py-3 font-medium">Recorded</th>
                <th className="px-5 py-3 font-medium">Duration</th>
                <th className="px-5 py-3 font-medium">Size</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {items.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-surface-2">
                  <td className="px-5 py-3">
                    <Link href={`/recordings/${r.id}`} className="font-medium hover:text-primary-soft">
                      {r.meetingTitle}
                    </Link>
                    <p className="text-xs text-fg-subtle">by {r.requestedBy ?? '—'}</p>
                  </td>
                  <td className="px-5 py-3 text-fg-muted">{formatDateTime(r.startedAt ?? r.createdAt)}</td>
                  <td className="tnum px-5 py-3 text-fg-muted">{formatDuration(r.durationMs)}</td>
                  <td className="tnum px-5 py-3 text-fg-muted">{formatBytes(r.fileSize)}</td>
                  <td className="px-5 py-3">
                    <RecordingStatusPill status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </>
  );
}

export default function RecordingsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <RecordingsList />
    </Suspense>
  );
}
