'use client';

import { ArrowLeft, CircleAlert, Download, Loader2, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/modal';
import { isInFlight, RecordingStatusPill } from '@/components/recording-status';
import { useToast } from '@/components/toast';
import { Button, buttonClass, Card, ErrorText, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatBytes, formatDateTime, formatDuration } from '@/lib/format';
import type { Recording } from '@/lib/types';

export default function RecordingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [rec, setRec] = useState<Recording | null>(null);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api<Recording>(`/recordings/${id}`);
        if (cancelled) return;
        setRec(r);
        if (isInFlight(r.status)) timer = setTimeout(load, 3000);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  async function remove() {
    setDeleting(true);
    try {
      await api(`/recordings/${id}`, { method: 'DELETE' });
      toast('Recording deleted', 'success');
      router.replace('/recordings');
    } catch (e) {
      toast(errorMessage(e), 'error');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <Link href="/recordings" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-fg-subtle hover:text-fg">
        <ArrowLeft className="size-4" /> All recordings
      </Link>
      {error && <ErrorText>{error}</ErrorText>}
      {!rec && !error && <Spinner />}
      {rec && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <Card className="overflow-hidden">
            {rec.status === 'COMPLETED' ? (
              <video className="aspect-video w-full bg-black" controls preload="metadata" src={`/api/recordings/${rec.id}/file`} />
            ) : rec.status === 'FAILED' ? (
              <div className="grid aspect-video place-items-center p-8 text-center">
                <div>
                  <CircleAlert className="mx-auto mb-3 size-8 text-danger" />
                  <p className="font-semibold">This recording failed</p>
                  <p className="mt-1 max-w-md text-fg-subtle">{rec.errorMessage ?? 'No details were reported.'}</p>
                </div>
              </div>
            ) : (
              <div className="grid aspect-video place-items-center text-fg-subtle">
                <div className="flex items-center gap-2">
                  <Loader2 className="size-5 animate-spin" />
                  {rec.status === 'RECORDING' ? 'Recording in progress…' : 'Processing — the file is being saved…'}
                </div>
              </div>
            )}
          </Card>
          <Card className="h-fit p-5">
            <h1 className="text-xl leading-7 font-semibold tracking-[-0.015em]">{rec.meetingTitle}</h1>
            <div className="mt-2">
              <RecordingStatusPill status={rec.status} />
            </div>
            <dl className="mt-5 space-y-3 text-[13px]">
              {[
                ['Room code', rec.roomCode],
                ['Recorded by', rec.requestedBy ?? '—'],
                ['Started', formatDateTime(rec.startedAt)],
                ['Ended', formatDateTime(rec.endedAt)],
                ['Duration', formatDuration(rec.durationMs)],
                ['File size', formatBytes(rec.fileSize)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-fg-subtle">{k}</dt>
                  <dd className="tnum text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex flex-col gap-2">
              {rec.status === 'COMPLETED' && (
                <a href={`/api/recordings/${rec.id}/file?download=1`} className={buttonClass('primary', 'md', 'w-full')}>
                  <Download className="size-4" /> Download MP4
                </a>
              )}
              {rec.canManage && !isInFlight(rec.status) && (
                <Button variant="ghost" className="w-full text-danger hover:text-danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-4" /> Delete recording
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this recording?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} loading={deleting}>
              Delete permanently
            </Button>
          </>
        }
      >
        <p className="text-fg-muted">The video file is removed from storage for everyone. This cannot be undone.</p>
      </Modal>
    </>
  );
}
