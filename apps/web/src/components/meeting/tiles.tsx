'use client';

import { isTrackReference, TrackReferenceOrPlaceholder, useIsMuted, useIsSpeaking, VideoTrack } from '@livekit/components-react';
import { Participant, Track } from 'livekit-client';
import { MicOff, MonitorUp } from 'lucide-react';
import { Avatar } from '@/components/avatar';
import { cx } from '@/components/ui';

export function isHostParticipant(p: Participant): boolean {
  try {
    return JSON.parse(p.metadata || '{}').role === 'host';
  } catch {
    return false;
  }
}

function avatarVersionOf(p: Participant): number | null {
  try {
    const v = JSON.parse(p.metadata || '{}').avatarVersion;
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}

function NameBadge({ participant, screen }: { participant: Participant; screen?: boolean }) {
  const publication = participant.getTrackPublication(Track.Source.Microphone);
  const micMuted = useIsMuted(
    publication ? { participant, source: Track.Source.Microphone, publication } : { participant, source: Track.Source.Microphone },
  );
  return (
    <div className="glass absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded px-2 py-1 text-xs font-medium">
      {screen && <MonitorUp className="size-3.5 shrink-0 text-success" />}
      {!screen && micMuted && <MicOff className="size-3.5 shrink-0 text-danger" aria-label="Muted" />}
      <span className="truncate">
        {participant.name || participant.identity}
        {participant.isLocal && ' (you)'}
        {screen && ' is presenting'}
      </span>
    </div>
  );
}

export function ParticipantTile({ trackRef, className }: { trackRef: TrackReferenceOrPlaceholder; className?: string }) {
  const participant = trackRef.participant;
  const speaking = useIsSpeaking(participant);
  const isScreen = trackRef.source === Track.Source.ScreenShare;
  const hasVideo = isTrackReference(trackRef) && !trackRef.publication.isMuted && !!trackRef.publication.track;

  return (
    <div
      className={cx(
        'relative overflow-hidden rounded-md bg-surface ring-2 transition-shadow',
        speaking && !isScreen ? 'ring-cyan' : 'ring-transparent',
        isScreen && 'border border-line',
        className,
      )}
    >
      {hasVideo ? (
        <VideoTrack
          trackRef={trackRef}
          className={cx('size-full', isScreen ? 'object-contain bg-black' : 'object-cover', participant.isLocal && !isScreen && '-scale-x-100')}
        />
      ) : (
        <div className="grid size-full place-items-center">
          <Avatar userId={participant.identity} name={participant.name || participant.identity} avatarVersion={avatarVersionOf(participant)} size="xl" className="text-fg-muted" />
        </div>
      )}
      <NameBadge participant={participant} screen={isScreen} />
    </div>
  );
}
