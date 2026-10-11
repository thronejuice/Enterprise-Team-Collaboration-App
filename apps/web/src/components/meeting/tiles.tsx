'use client';

import { isTrackReference, TrackReferenceOrPlaceholder, useIsMuted, useIsSpeaking, VideoTrack } from '@livekit/components-react';
import { Participant, Track } from 'livekit-client';
import { MicOff, MonitorUp } from 'lucide-react';
import { initials } from '@/components/app-shell';
import { cx } from '@/components/ui';

export function isHostParticipant(p: Participant): boolean {
  try {
    return JSON.parse(p.metadata || '{}').role === 'host';
  } catch {
    return false;
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
          <div className="grid size-16 place-items-center rounded-full bg-surface-3 text-lg font-semibold text-fg-muted">
            {initials(participant.name || participant.identity)}
          </div>
        </div>
      )}
      <NameBadge participant={participant} screen={isScreen} />
    </div>
  );
}
