'use client';

import { DisconnectReason } from 'livekit-client';
import { ArrowLeft, CircleSlash, DoorOpen, Film, LogOut, WifiOff } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import type { MediaChoices } from '@/components/meeting/prejoin';
import { Logo } from '@/components/logo';
import { Button, buttonClass, ErrorText, Spinner } from '@/components/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useRequireUser } from '@/lib/auth';
import type { JoinToken, MeetingDetail } from '@/lib/types';

// WebRTC code only runs in the browser.
const PreJoin = dynamic(() => import('@/components/meeting/prejoin').then((m) => m.PreJoin), { ssr: false, loading: () => <Spinner /> });
const MeetingRoom = dynamic(() => import('@/components/meeting/room').then((m) => m.MeetingRoom), { ssr: false, loading: () => <Spinner label="Connecting…" /> });

type Stage =
  | { kind: 'loading' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'prejoin' }
  | { kind: 'room'; token: JoinToken; choices: MediaChoices }
  | { kind: 'left'; reason?: DisconnectReason };

function Centered({ icon, title, children, actions }: { icon: ReactNode; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-surface text-fg-subtle">{icon}</div>
        <h1 className="text-xl leading-7 font-semibold">{title}</h1>
        {children && <p className="mt-2 text-fg-subtle">{children}</p>}
        {actions && <div className="mt-6 flex justify-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const homeButton = (
  <Link href="/" className={buttonClass('secondary')}>
    <ArrowLeft className="size-4" /> Back to home
  </Link>
);

export default function MeetingPage() {
  const user = useRequireUser();
  const { id } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const load = useCallback(async () => {
    try {
      const detail = await api<MeetingDetail>(`/meetings/${id}`);
      setMeeting(detail);
      if (detail.status === 'ENDED') setStage({ kind: 'unavailable', message: 'This meeting has ended.' });
      else setStage({ kind: 'prejoin' });
    } catch (e) {
      const message =
        e instanceof ApiError && (e.status === 404 || e.status === 400)
          ? 'This meeting doesn’t exist, or you haven’t joined it yet. To join, enter its room code on Home.'
          : errorMessage(e);
      setStage({ kind: 'unavailable', message });
    }
  }, [id]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  async function join(choices: MediaChoices) {
    setJoining(true);
    setJoinError('');
    try {
      const token = await api<JoinToken>(`/meetings/${id}/token`, { method: 'POST' });
      setStage({ kind: 'room', token, choices });
    } catch (e) {
      setJoinError(errorMessage(e));
    } finally {
      setJoining(false);
    }
  }

  if (!user || stage.kind === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner />
      </div>
    );
  }

  if (stage.kind === 'room' && meeting) {
    return (
      <MeetingRoom
        meeting={meeting}
        token={stage.token.token}
        serverUrl={stage.token.url}
        isHost={stage.token.isHost}
        choices={stage.choices}
        onLeft={(reason) => setStage({ kind: 'left', reason })}
      />
    );
  }

  let body: ReactNode;
  if (stage.kind === 'unavailable') {
    body = (
      <Centered icon={<CircleSlash className="size-6" />} title="Meeting unavailable" actions={homeButton}>
        {stage.message}
      </Centered>
    );
  } else if (stage.kind === 'left') {
    const rejoin = (
      <Button onClick={() => void load()}>
        <DoorOpen className="size-4" /> Rejoin
      </Button>
    );
    switch (stage.reason) {
      case DisconnectReason.PARTICIPANT_REMOVED:
        body = (
          <Centered icon={<CircleSlash className="size-6" />} title="You were removed from this meeting" actions={homeButton}>
            The host removed you, so you can’t rejoin it, even with the room code.
          </Centered>
        );
        break;
      case DisconnectReason.ROOM_DELETED:
        body = (
          <Centered
            icon={<LogOut className="size-6" />}
            title="The meeting has ended"
            actions={
              <>
                {homeButton}
                <Link href={`/recordings?meeting=${id}`} className={buttonClass('secondary')}>
                  <Film className="size-4" /> Recordings
                </Link>
              </>
            }
          >
            The host ended this meeting for everyone.
          </Centered>
        );
        break;
      case DisconnectReason.DUPLICATE_IDENTITY:
        body = (
          <Centered icon={<WifiOff className="size-6" />} title="You joined from another tab or device" actions={<>{homeButton}{rejoin}</>}>
            Your account can be in a meeting from one place at a time. Rejoin to move the meeting back to this tab.
          </Centered>
        );
        break;
      case DisconnectReason.CLIENT_INITIATED:
        body = <Centered icon={<LogOut className="size-6" />} title="You left the meeting" actions={<>{homeButton}{rejoin}</>} />;
        break;
      default:
        body = (
          <Centered icon={<WifiOff className="size-6" />} title="You were disconnected" actions={<>{homeButton}{rejoin}</>}>
            The connection to the meeting dropped. Check your Wi-Fi or network cable, then rejoin.
          </Centered>
        );
    }
  } else if (meeting) {
    body = <PreJoin meeting={meeting} onJoin={join} joining={joining} error={joinError} />;
  } else {
    body = <ErrorText>Meeting not loaded.</ErrorText>;
  }

  return (
    <div className="min-h-dvh">
      <header className="flex h-14 items-center gap-3 border-b border-line/60 px-4">
        <Link href="/" className="flex items-center gap-2" aria-label="Home">
          <Logo className="size-8" />
          <span className="font-semibold">Nexus Meet</span>
        </Link>
      </header>
      {body}
    </div>
  );
}
