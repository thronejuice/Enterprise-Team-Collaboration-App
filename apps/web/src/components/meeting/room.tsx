'use client';

import {
  isTrackReference,
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useConnectionState,
  useDataChannel,
  useIsRecording,
  useParticipants,
  useRoomContext,
  useTrackToggle,
  useTracks,
} from '@livekit/components-react';
import { ConnectionState, DisconnectReason, MediaDeviceFailure, Participant, RoomOptions, ScreenSharePresets, Track, VideoPresets } from 'livekit-client';
import { Camera, CameraOff, Circle, Copy, Loader2, Mic, MicOff, MonitorUp, MonitorX, PhoneOff, Square, UserMinus, Users, VolumeX, WifiOff, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/modal';
import { useToast } from '@/components/toast';
import { Button, cx, Pill } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import type { MeetingDetail, Recording } from '@/lib/types';
import type { MediaChoices } from './prejoin';
import { isHostParticipant, ParticipantTile } from './tiles';

interface RoomProps {
  meeting: MeetingDetail;
  token: string;
  serverUrl: string;
  isHost: boolean;
  choices: MediaChoices;
  onLeft: (reason?: DisconnectReason) => void;
}

function deviceFailureMessage(failure?: MediaDeviceFailure): string {
  switch (failure) {
    case MediaDeviceFailure.PermissionDenied:
      return 'Camera or microphone access is blocked. Allow it from the icon in the address bar.';
    case MediaDeviceFailure.NotFound:
      return 'No camera or microphone found. Connect one and try again.';
    case MediaDeviceFailure.DeviceInUse:
      return 'Another app is using your camera or microphone. Close it and try again.';
    default:
      return 'Your camera or microphone stopped working. Turn it off and on to retry.';
  }
}

export function MeetingRoom({ meeting, token, serverUrl, isHost, choices, onLeft }: RoomProps) {
  const options = useMemo<RoomOptions>(
    () => ({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: { deviceId: choices.videoDeviceId, resolution: VideoPresets.h720.resolution },
      audioCaptureDefaults: { deviceId: choices.audioDeviceId, echoCancellation: true, noiseSuppression: true },
      publishDefaults: { simulcast: true, screenShareEncoding: ScreenSharePresets.h1080fps15.encoding },
    }),
    [choices.videoDeviceId, choices.audioDeviceId],
  );
  const toast = useToast();

  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect
      audio={choices.audioEnabled}
      video={choices.videoEnabled}
      options={options}
      onDisconnected={onLeft}
      onError={(e) => toast(errorMessage(e), 'error')}
      onMediaDeviceFailure={(failure) => toast(deviceFailureMessage(failure), 'error')}
      className="flex h-dvh flex-col bg-canvas"
    >
      <RoomBody meeting={meeting} isHost={isHost} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function useElapsed(): string {
  const start = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return formatDuration(now - start.current);
}

function RoomBody({ meeting, isHost }: { meeting: MeetingDetail; isHost: boolean }) {
  const toast = useToast();
  const room = useRoomContext();
  const connection = useConnectionState();
  const isRecording = useIsRecording();
  const participants = useParticipants();
  const elapsed = useElapsed();
  const [panelOpen, setPanelOpen] = useState(false);
  const firstRecordingState = useRef(true);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const screens = tracks.filter((t) => t.source === Track.Source.ScreenShare && isTrackReference(t));
  const cameras = tracks.filter((t) => t.source === Track.Source.Camera);

  // Everyone is told when recording starts or stops (state comes from the server, not the host's UI).
  useEffect(() => {
    if (firstRecordingState.current) {
      firstRecordingState.current = false;
      if (isRecording) toast('This meeting is being recorded.', 'recording');
      return;
    }
    toast(isRecording ? 'Recording started. Everyone in the meeting can see this.' : 'Recording stopped.', isRecording ? 'recording' : 'info');
  }, [isRecording, toast]);

  useDataChannel('moderation', (msg) => {
    // Only the server (RoomService.SendData) may send moderation messages, and those have no sender.
    // Any participant can publish data on this topic, so a message with a sender is a forgery.
    if (msg.from) return;
    try {
      const payload = JSON.parse(new TextDecoder().decode(msg.payload)) as { type?: string; by?: string };
      if (payload.type === 'muted_by_host') toast(`${payload.by ?? 'The host'} muted your microphone.`, 'info');
    } catch {
      /* ignore malformed messages */
    }
  });

  const gridCols = cameras.length <= 1 ? 'grid-cols-1' : cameras.length <= 4 ? 'grid-cols-2' : cameras.length <= 9 ? 'grid-cols-3' : 'grid-cols-4';

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line/60 px-4">
        <h1 className="truncate text-base leading-6 font-semibold">{meeting.title}</h1>
        <button
          onClick={() => navigator.clipboard?.writeText(meeting.roomCode).then(() => toast('Room code copied', 'success'))}
          className="tnum flex items-center gap-1.5 rounded border border-line px-2 py-0.5 text-xs text-fg-muted hover:bg-surface"
          title="Copy room code"
          aria-label={`Copy room code ${meeting.roomCode}`}
        >
          Code {meeting.roomCode} <Copy className="size-3" />
        </button>
        {isRecording && (
          <Pill tone="danger">
            <span className="size-1.5 animate-rec-pulse rounded-full bg-danger" /> REC
          </Pill>
        )}
        <div className="ml-auto flex items-center gap-3 text-[13px] text-fg-subtle">
          <span className="tnum">{elapsed}</span>
          <span className="tnum flex items-center gap-1" title={`${participants.length} of ${meeting.maxParticipants} participants`}>
            <Users className="size-4" aria-hidden /> {participants.length}/{meeting.maxParticipants}
          </span>
        </div>
      </header>

      {connection === ConnectionState.Reconnecting && (
        <div className="flex items-center justify-center gap-2 bg-warning/15 py-1.5 text-[13px] text-warning" role="status">
          <WifiOff className="size-4" /> Connection lost — reconnecting…
        </div>
      )}
      {connection === ConnectionState.Connecting && (
        <div className="flex items-center justify-center gap-2 bg-surface py-1.5 text-[13px] text-fg-subtle" role="status">
          <Loader2 className="size-4 animate-spin" /> Connecting…
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 p-4">
          {screens.length > 0 ? (
            <div className="flex h-full gap-3">
              <ParticipantTile trackRef={screens[0]} className="min-w-0 flex-1" />
              <div className="flex w-56 shrink-0 flex-col gap-3 overflow-y-auto">
                {cameras.map((t) => (
                  <ParticipantTile key={`${t.participant.identity}-cam`} trackRef={t} className="aspect-video shrink-0" />
                ))}
              </div>
            </div>
          ) : (
            <div className={cx('grid h-full auto-rows-fr gap-3', gridCols)}>
              {cameras.map((t) => (
                <ParticipantTile key={`${t.participant.identity}-cam`} trackRef={t} className="min-h-0" />
              ))}
            </div>
          )}
        </div>
        {panelOpen && <ParticipantsPanel meeting={meeting} isHost={isHost} participants={participants} onClose={() => setPanelOpen(false)} />}
      </div>

      <StartAudio label="Your browser paused meeting audio. Click to hear the meeting." className="fixed top-20 left-1/2 z-50 -translate-x-1/2 rounded bg-primary px-4 py-2 font-medium text-white shadow-float" />

      <ControlBar meeting={meeting} isHost={isHost} panelOpen={panelOpen} onTogglePanel={() => setPanelOpen((v) => !v)} onLeave={() => void room.disconnect()} />
    </>
  );
}

function RoundButton({
  onClick,
  active,
  danger,
  label,
  children,
  disabled,
}: {
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cx(
        'grid size-11 place-items-center rounded-full transition-colors disabled:opacity-50',
        danger ? 'bg-danger text-white hover:bg-danger-hover' : active ? 'bg-primary text-white hover:bg-primary-hover' : 'bg-surface-3 text-fg hover:bg-line-strong',
      )}
    >
      {children}
    </button>
  );
}

function ControlBar({
  meeting,
  isHost,
  panelOpen,
  onTogglePanel,
  onLeave,
}: {
  meeting: MeetingDetail;
  isHost: boolean;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onLeave: () => void;
}) {
  const toast = useToast();
  const onDeviceError = (e: Error) => toast(e.message || 'Device error', 'error');
  const mic = useTrackToggle({ source: Track.Source.Microphone, onDeviceError });
  const cam = useTrackToggle({ source: Track.Source.Camera, onDeviceError });
  const screen = useTrackToggle({
    source: Track.Source.ScreenShare,
    captureOptions: { audio: true, selfBrowserSurface: 'exclude', surfaceSwitching: 'include' },
    onDeviceError: (e) => {
      if ((e as { name?: string }).name !== 'NotAllowedError') onDeviceError(e);
    },
  });
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);

  async function endMeeting() {
    setEnding(true);
    try {
      await api(`/meetings/${meeting.id}/end`, { method: 'POST' });
      // LiveKit deletes the room and disconnects everyone (ROOM_DELETED).
    } catch (e) {
      toast(errorMessage(e), 'error');
      setEnding(false);
      setConfirmEnd(false);
    }
  }

  return (
    <footer className="flex h-20 shrink-0 items-center justify-center gap-3 border-t border-line/60 px-4">
      <div className="glass flex items-center gap-2 rounded-md p-1.5 shadow-float">
        <RoundButton onClick={() => void mic.toggle()} label={mic.enabled ? 'Mute microphone' : 'Unmute microphone'} danger={!mic.enabled} disabled={mic.pending}>
          {mic.enabled ? <Mic className="size-5" /> : <MicOff className="size-5" />}
        </RoundButton>
        <RoundButton onClick={() => void cam.toggle()} label={cam.enabled ? 'Turn camera off' : 'Turn camera on'} danger={!cam.enabled} disabled={cam.pending}>
          {cam.enabled ? <Camera className="size-5" /> : <CameraOff className="size-5" />}
        </RoundButton>
        <RoundButton onClick={() => void screen.toggle()} label={screen.enabled ? 'Stop sharing screen' : 'Share screen'} active={screen.enabled} disabled={screen.pending}>
          {screen.enabled ? <MonitorX className="size-5" /> : <MonitorUp className="size-5" />}
        </RoundButton>
        <RoundButton onClick={onTogglePanel} label="Participants" active={panelOpen}>
          <Users className="size-5" />
        </RoundButton>
        {isHost && <RecordButton meetingId={meeting.id} />}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={onLeave}>
          <PhoneOff className="size-4" /> Leave
        </Button>
        {isHost && (
          <Button icon={<PhoneOff className="size-4" />} variant="danger" onClick={() => setConfirmEnd(true)}>
            End meeting
          </Button>
        )}
      </div>
      <Modal
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title="End meeting for everyone?"
        footer={
          <>
            <Button icon={<X className="size-4" />} variant="secondary" onClick={() => setConfirmEnd(false)}>
              Cancel
            </Button>
            <Button icon={<PhoneOff className="size-4" />} variant="danger" onClick={endMeeting} loading={ending}>
              End meeting
            </Button>
          </>
        }
      >
        <p className="text-fg-muted">All participants will be disconnected, any recording will be stopped and saved, and room code {meeting.roomCode} will stop working.</p>
      </Modal>
    </footer>
  );
}

/** Host-only recording control backed by the API; the REC indicator itself comes from LiveKit room state. */
function RecordButton({ meetingId }: { meetingId: string }) {
  const toast = useToast();
  const isRecording = useIsRecording();
  const [current, setCurrent] = useState<Recording | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const detail = await api<MeetingDetail>(`/meetings/${meetingId}`);
    if (detail.activeRecording) {
      setCurrent(await api<Recording>(`/recordings/${detail.activeRecording.id}`));
    } else {
      setCurrent((prev) => {
        if (prev && prev.status !== 'COMPLETED' && prev.status !== 'FAILED') {
          // It just left the in-flight states: fetch its final status once to report failures.
          void api<Recording>(`/recordings/${prev.id}`).then((r) => {
            if (r.status === 'FAILED') toast(r.errorMessage ?? 'Recording failed.', 'error');
            if (r.status === 'COMPLETED') toast('Recording saved. Find it under Recordings.', 'success');
          });
        }
        return null;
      });
    }
  }, [meetingId, toast]);

  useEffect(() => {
    void refresh().catch(() => undefined);
    const t = setInterval(() => void refresh().catch(() => undefined), 4000);
    return () => clearInterval(t);
  }, [refresh, isRecording]);

  async function start() {
    setBusy(true);
    try {
      setCurrent(await api<Recording>(`/meetings/${meetingId}/recordings`, { method: 'POST' }));
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!current) return;
    setBusy(true);
    try {
      setCurrent(await api<Recording>(`/recordings/${current.id}/stop`, { method: 'POST' }));
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  // LiveKit's room state flips to "recording" as soon as Egress is live; trust it over a stale poll.
  const status = isRecording && (current?.status === 'REQUESTED' || current?.status === 'STARTING') ? 'RECORDING' : current?.status;
  if (status === 'STOPPING' || status === 'FINALIZING') {
    return (
      <button disabled className="flex h-11 items-center gap-2 rounded-full bg-surface-3 px-4 text-[13px] text-fg-subtle">
        <Loader2 className="size-4 animate-spin" /> Saving…
      </button>
    );
  }
  if (status === 'REQUESTED' || status === 'STARTING' || status === 'RECORDING') {
    return (
      <button onClick={stop} disabled={busy} className="flex h-11 items-center gap-2 rounded-full border border-danger bg-danger/15 px-4 text-[13px] font-semibold text-danger hover:bg-danger/25" aria-label="Stop recording">
        {status === 'RECORDING' ? <Square className="size-3.5 fill-current" /> : <Loader2 className="size-4 animate-spin" />}
        {status === 'RECORDING' ? 'Stop recording' : 'Starting…'}
      </button>
    );
  }
  return (
    <button onClick={start} disabled={busy} className="flex h-11 items-center gap-2 rounded-full bg-surface-3 px-4 text-[13px] font-medium hover:bg-line-strong disabled:opacity-50" aria-label="Start recording">
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Circle className="size-3.5 fill-danger text-danger" />} Record
    </button>
  );
}

function ParticipantsPanel({ meeting, isHost, participants, onClose }: { meeting: MeetingDetail; isHost: boolean; participants: Participant[]; onClose: () => void }) {
  const toast = useToast();
  const [removing, setRemoving] = useState<Participant | null>(null);
  const [busy, setBusy] = useState(false);

  async function mute(p: Participant) {
    try {
      const r = await api<{ muted: number }>(`/meetings/${meeting.id}/participants/${p.identity}/mute`, { method: 'POST' });
      toast(r.muted > 0 ? `Muted ${p.name}` : `${p.name} is already muted`, 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await api(`/meetings/${meeting.id}/participants/${removing.identity}/remove`, { method: 'POST' });
      toast(`${removing.name} was removed and cannot rejoin this meeting.`, 'success');
      setRemoving(null);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-line/60 bg-surface" aria-label="Participants">
      <div className="flex h-12 items-center justify-between border-b border-line/60 px-4">
        <h2 className="font-semibold">
          Participants <span className="tnum text-fg-subtle">({participants.length})</span>
        </h2>
        <button onClick={onClose} className="rounded p-1 text-fg-subtle hover:bg-surface-3 hover:text-fg" aria-label="Close participants">
          <X className="size-4" />
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {participants.map((p) => (
          <li key={p.identity} className="group flex items-center gap-2 rounded px-2 py-2 hover:bg-surface-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">
                {p.name || p.identity}
                {p.isLocal && <span className="text-fg-subtle"> (you)</span>}
              </p>
              {isHostParticipant(p) && <p className="text-[11px] font-semibold tracking-[0.03em] text-primary-soft uppercase">Host</p>}
            </div>
            {p.isMicrophoneEnabled ? <Mic className="size-4 text-fg-subtle" /> : <MicOff className="size-4 text-danger" />}
            {p.isCameraEnabled ? <Camera className="size-4 text-fg-subtle" /> : <CameraOff className="size-4 text-fg-subtle" />}
            {isHost && !p.isLocal && (
              <div className="flex gap-1">
                <button
                  onClick={() => mute(p)}
                  disabled={!p.isMicrophoneEnabled}
                  className="rounded p-1.5 text-fg-subtle hover:bg-surface-3 hover:text-fg disabled:opacity-30"
                  title={`Mute ${p.name}`}
                  aria-label={`Mute ${p.name}`}
                >
                  <VolumeX className="size-4" />
                </button>
                {!isHostParticipant(p) && (
                  <button onClick={() => setRemoving(p)} className="rounded p-1.5 text-fg-subtle hover:bg-danger/20 hover:text-danger" title={`Remove ${p.name}`} aria-label={`Remove ${p.name}`}>
                    <UserMinus className="size-4" />
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? ''}?`}
        footer={
          <>
            <Button icon={<X className="size-4" />} variant="secondary" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button icon={<UserMinus className="size-4" />} variant="danger" onClick={remove} loading={busy}>
              Remove
            </Button>
          </>
        }
      >
        <p className="text-fg-muted">They will be disconnected immediately and will not be able to rejoin this meeting, even with the room code.</p>
      </Modal>
    </aside>
  );
}
