'use client';

import { createLocalAudioTrack, createLocalVideoTrack, LocalAudioTrack, LocalVideoTrack, Room, VideoPresets } from 'livekit-client';
import { Camera, CameraOff, Mic, MicOff, ShieldCheck, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, cx, ErrorText, Label, Pill, Select } from '@/components/ui';
import type { MeetingDetail } from '@/lib/types';

export interface MediaChoices {
  audioEnabled: boolean;
  videoEnabled: boolean;
  audioDeviceId?: string;
  videoDeviceId?: string;
}

function useDevices(kind: MediaDeviceKind, refreshKey: unknown) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      Room.getLocalDevices(kind, false)
        .then((d) => !cancelled && setDevices(d.filter((x) => x.deviceId)))
        .catch(() => undefined);
    void load();
    navigator.mediaDevices?.addEventListener('devicechange', load);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener('devicechange', load);
    };
  }, [kind, refreshKey]);
  return devices;
}

/** Live input level 0..1 for the microphone preview. */
function useAudioLevel(track: LocalAudioTrack | null) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!track) {
      setLevel(0);
      return;
    }
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      void ctx.close();
    };
  }, [track]);
  return level;
}

/** Own component so the per-frame level updates re-render only the bar, not the whole pre-join page. */
function MicLevelMeter({ track }: { track: LocalAudioTrack | null }) {
  const level = useAudioLevel(track);
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
      <div className="h-full rounded-full bg-cyan transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
    </div>
  );
}

function permissionMessage(error: unknown, what: string): string {
  const name = (error as { name?: string })?.name;
  const device = what.toLowerCase();
  if (name === 'NotAllowedError') return `${what} access is blocked. Allow it from the icon in the address bar, or join with your ${device} off.`;
  if (name === 'NotFoundError') return `No ${device} found. Connect one, or join with your ${device} off.`;
  if (name === 'NotReadableError') return `Another app is using your ${device}. Close it, then turn the ${device} off and on here.`;
  return `Your ${device} isn’t working (${(error as Error)?.message ?? 'unknown error'}). You can join with it off.`;
}

export function PreJoin({ meeting, onJoin, joining, error }: { meeting: MeetingDetail; onJoin: (c: MediaChoices) => void; joining: boolean; error: string }) {
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoDeviceId, setVideoDeviceId] = useState<string>();
  const [audioDeviceId, setAudioDeviceId] = useState<string>();
  const [videoTrack, setVideoTrack] = useState<LocalVideoTrack | null>(null);
  const [audioTrack, setAudioTrack] = useState<LocalAudioTrack | null>(null);
  const [videoError, setVideoError] = useState('');
  const [audioError, setAudioError] = useState('');
  const videoEl = useRef<HTMLVideoElement>(null);
  const cameras = useDevices('videoinput', videoTrack);
  const mics = useDevices('audioinput', audioTrack);

  useEffect(() => {
    if (!videoEnabled) return;
    let track: LocalVideoTrack | undefined;
    let cancelled = false;
    setVideoError('');
    createLocalVideoTrack({ deviceId: videoDeviceId, resolution: VideoPresets.h720.resolution })
      .then((t) => {
        if (cancelled) return t.stop();
        track = t;
        setVideoTrack(t);
      })
      .catch((e) => !cancelled && setVideoError(permissionMessage(e, 'Camera')));
    return () => {
      cancelled = true;
      track?.stop();
      setVideoTrack(null);
    };
  }, [videoEnabled, videoDeviceId]);

  useEffect(() => {
    if (!audioEnabled) return;
    let track: LocalAudioTrack | undefined;
    let cancelled = false;
    setAudioError('');
    createLocalAudioTrack({ deviceId: audioDeviceId, echoCancellation: true, noiseSuppression: true })
      .then((t) => {
        if (cancelled) return t.stop();
        track = t;
        setAudioTrack(t);
      })
      .catch((e) => !cancelled && setAudioError(permissionMessage(e, 'Microphone')));
    return () => {
      cancelled = true;
      track?.stop();
      setAudioTrack(null);
    };
  }, [audioEnabled, audioDeviceId]);

  useEffect(() => {
    const el = videoEl.current;
    if (videoTrack && el) {
      videoTrack.attach(el);
      return () => {
        videoTrack.detach(el);
      };
    }
  }, [videoTrack]);

  function join() {
    // Release the preview devices; the room publishes fresh tracks with the same choices.
    videoTrack?.stop();
    audioTrack?.stop();
    onJoin({
      videoEnabled: videoEnabled && !videoError,
      audioEnabled: audioEnabled && !audioError,
      videoDeviceId: videoDeviceId ?? videoTrack?.mediaStreamTrack.getSettings().deviceId,
      audioDeviceId: audioDeviceId ?? audioTrack?.mediaStreamTrack.getSettings().deviceId,
    });
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-10 lg:grid-cols-[1fr_340px]">
      <div>
        <div className="relative aspect-video overflow-hidden rounded-lg border border-line bg-surface">
          {videoTrack ? (
            <video ref={videoEl} className="size-full -scale-x-100 object-cover" muted playsInline autoPlay />
          ) : (
            <div className="grid size-full place-items-center text-fg-subtle">
              <div className="text-center">
                <CameraOff className="mx-auto mb-2 size-8" />
                <p>{videoEnabled ? (videoError ? 'Camera unavailable' : 'Starting camera…') : 'Camera is off'}</p>
              </div>
            </div>
          )}
          <div className="glass absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md p-1.5">
            <button
              onClick={() => setAudioEnabled((v) => !v)}
              aria-pressed={audioEnabled}
              aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
              className={cx('grid size-11 place-items-center rounded-full', audioEnabled ? 'bg-surface-3 hover:bg-line-strong' : 'bg-danger-hover text-white')}
            >
              {audioEnabled ? <Mic className="size-5" /> : <MicOff className="size-5" />}
            </button>
            <button
              onClick={() => setVideoEnabled((v) => !v)}
              aria-pressed={videoEnabled}
              aria-label={videoEnabled ? 'Turn camera off' : 'Turn camera on'}
              className={cx('grid size-11 place-items-center rounded-full', videoEnabled ? 'bg-surface-3 hover:bg-line-strong' : 'bg-danger-hover text-white')}
            >
              {videoEnabled ? <Camera className="size-5" /> : <CameraOff className="size-5" />}
            </button>
          </div>
        </div>
        <ErrorText>{videoError}</ErrorText>
        <ErrorText>{audioError}</ErrorText>
      </div>

      <div className="flex flex-col">
        <h1 className="text-[22px] leading-[30px] font-semibold tracking-[-0.015em]">{meeting.title}</h1>
        <p className="mt-1 text-fg-subtle">
          Hosted by {meeting.hostName} · Code <span className="tnum font-medium text-fg-muted">{meeting.roomCode}</span>
        </p>
        {meeting.activeRecording && (
          <Pill tone="danger" className="mt-3 self-start">
            <span className="size-1.5 animate-rec-pulse rounded-full bg-danger" /> This meeting is being recorded
          </Pill>
        )}

        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="cam">Camera</Label>
            <Select id="cam" value={videoDeviceId ?? videoTrack?.mediaStreamTrack.getSettings().deviceId ?? ''} onChange={(e) => setVideoDeviceId(e.target.value)} disabled={!videoEnabled || cameras.length === 0}>
              {cameras.length === 0 && <option value="">No camera found</option>}
              {cameras.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || 'Camera'}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="mic">Microphone</Label>
            <Select id="mic" value={audioDeviceId ?? audioTrack?.mediaStreamTrack.getSettings().deviceId ?? ''} onChange={(e) => setAudioDeviceId(e.target.value)} disabled={!audioEnabled || mics.length === 0}>
              {mics.length === 0 && <option value="">No microphone found</option>}
              {mics.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || 'Microphone'}
                </option>
              ))}
            </Select>
            <MicLevelMeter track={audioTrack} />
          </div>
        </div>

        <ErrorText>{error}</ErrorText>
        <Button icon={<Video className="size-4" />} size="lg" className="mt-6" onClick={join} loading={joining}>
          Join meeting
        </Button>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-subtle">
          <ShieldCheck className="size-3.5" /> Audio and video stay on this local network.
        </p>
      </div>
    </div>
  );
}
