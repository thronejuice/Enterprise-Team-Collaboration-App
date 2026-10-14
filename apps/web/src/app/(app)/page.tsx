'use client';

import { ArrowRight, CalendarClock, Copy, DoorOpen, Film, Plus, Video } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { RoomCodeInput } from '@/components/room-code-input';
import { useToast } from '@/components/toast';
import { Button, buttonClass, Card, EmptyState, ErrorText, Input, Label, PageHeader, Pill, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatRelative } from '@/lib/format';
import type { Meeting } from '@/lib/types';

function JoinCard() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{4}$/.test(code)) {
      setError('Enter all four digits.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api<{ meetingId: string }>('/meetings/join', { body: { roomCode: code } });
      router.push(`/meetings/${res.meetingId}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Card className="px-6 py-10">
      <div className="mb-6 flex items-center justify-center gap-2">
        <DoorOpen className="size-5 text-cyan" />
        <h2 className="text-xl leading-7 font-semibold tracking-[-0.015em]">Join with a room code</h2>
      </div>
      <form onSubmit={submit} className="flex flex-col items-center space-y-4">
        <RoomCodeInput value={code} onChange={setCode} disabled={busy} />
        <ErrorText>{error}</ErrorText>
        <Button icon={<ArrowRight className="size-4" />} type="submit" size="lg" loading={busy} disabled={code.length !== 4}>
          Continue
        </Button>
      </form>
    </Card>
  );
}

function CreateCard({ onCreated }: { onCreated: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [created, setCreated] = useState<Meeting | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const meeting = await api<Meeting>('/meetings', { body: { title } });
      setCreated(meeting);
      setTitle('');
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <Card className="p-6">
        <h2 className="truncate text-base leading-6 font-semibold" title={created.title}>
          {created.title}
        </h2>
        <div className="mt-4 flex items-center gap-3">
          <span className="tnum text-[40px] leading-none font-bold tracking-[0.2em] text-primary-soft">{created.roomCode}</span>
          <button
            className="rounded p-2 text-fg-subtle hover:bg-surface-3 hover:text-fg"
            aria-label={`Copy room code ${created.roomCode}`}
            onClick={() => navigator.clipboard?.writeText(created.roomCode).then(() => toast('Room code copied', 'success'))}
          >
            <Copy className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-[13px] text-fg-subtle">Meeting created. Share this code with the people you’re inviting. They sign in and enter it on Home.</p>
        <div className="mt-5 flex gap-2">
          <Link href={`/meetings/${created.id}`} className={buttonClass()}>
            <Video className="size-4" /> Enter meeting
          </Link>
          <Button icon={<Plus className="size-4" />} variant="ghost" onClick={() => setCreated(null)}>
            Create another
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="px-5 py-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <Label htmlFor="title">Meeting title</Label>
          <Input id="title" required maxLength={120} placeholder="Start a new meeting, e.g. Sprint review" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <Button icon={<Plus className="size-4" />} type="submit" variant="secondary" loading={busy} disabled={!title.trim()}>
          Create meeting
        </Button>
      </form>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function MeetingRow({ meeting }: { meeting: Meeting }) {
  const active = meeting.status === 'ACTIVE';
  return (
    <li className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2">
      <div className={`grid size-10 place-items-center rounded-md ${active ? 'bg-success/15 text-success' : 'bg-surface-3 text-fg-subtle'}`}>
        <Video className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium" title={meeting.title}>
            {meeting.title}
          </p>
          {meeting.isHost && <Pill tone="primary">Host</Pill>}
        </div>
        <p className="text-[13px] text-fg-subtle">
          Code <span className="tnum font-medium text-fg-muted">{meeting.roomCode}</span> · {meeting.hostName ?? 'Unknown host'} · {formatRelative(meeting.createdAt)}
        </p>
      </div>
      {active ? (
        <Link href={`/meetings/${meeting.id}`} className={buttonClass('primary', 'sm')}>
          Rejoin
        </Link>
      ) : (
        <div className="flex items-center gap-2">
          <Pill>Ended</Pill>
          <Link href={`/recordings?meeting=${meeting.id}`} className="text-fg-subtle hover:text-fg" title="Recordings" aria-label={`Recordings for ${meeting.title}`}>
            <Film className="size-4" />
          </Link>
        </div>
      )}
    </li>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<Meeting[]>('/meetings')
      .then(setMeetings)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  const active = meetings?.filter((m) => m.status === 'ACTIVE') ?? [];
  const ended = meetings?.filter((m) => m.status === 'ENDED') ?? [];

  return (
    <>
      <PageHeader title={`Welcome, ${user?.displayName ?? ''}`} subtitle="Join a meeting with its 4-digit code, or rejoin one you are already part of." />
      {error && <ErrorText>{error}</ErrorText>}

      {active.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line/60 px-5 py-4">
            <h2 className="font-semibold">Live now</h2>
            <Pill tone="success">{active.length} live</Pill>
          </div>
          <ul className="divide-y divide-line/60">
            {active.map((m) => (
              <MeetingRow key={m.id} meeting={m} />
            ))}
          </ul>
        </Card>
      )}

      <div className="space-y-6">
        <JoinCard />
        <CreateCard onCreated={load} />
      </div>

      <Card className="mt-8 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line/60 px-5 py-4">
          <CalendarClock className="size-4 text-fg-subtle" />
          <h2 className="font-semibold">Recent</h2>
        </div>
        {!meetings && !error && <div className="p-5"><Spinner /></div>}
        {meetings && ended.length === 0 && (
          <EmptyState icon={<Video className="size-8" />} title="No past meetings yet">
            Meetings that have ended appear here, with their recordings.
          </EmptyState>
        )}
        {ended.length > 0 && (
          <ul className="divide-y divide-line/60">
            {ended.map((m) => (
              <MeetingRow key={m.id} meeting={m} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
