'use client';

import { CheckStatus, ConnectionCheck, type CheckInfo } from 'livekit-client';
import { CircleCheck, CircleDashed, CircleX, Loader2, MinusCircle } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, ErrorText, PageHeader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

const STEPS: { key: string; label: string; run: (c: ConnectionCheck) => Promise<CheckInfo> }[] = [
  { key: 'ws', label: 'Signaling over secure WebSocket (443)', run: (c) => c.checkWebsocket() },
  { key: 'rtc', label: 'WebRTC media connection', run: (c) => c.checkWebRTC() },
  { key: 'proto', label: 'Transport (UDP 7882 / TCP 7881 fallback)', run: (c) => c.checkConnectionProtocol() },
  { key: 'reconnect', label: 'Reconnection', run: (c) => c.checkReconnect() },
  { key: 'audio', label: 'Publish microphone audio', run: (c) => c.checkPublishAudio() },
  { key: 'video', label: 'Publish camera video', run: (c) => c.checkPublishVideo() },
];

function StatusIcon({ status }: { status?: CheckStatus }) {
  switch (status) {
    case CheckStatus.RUNNING:
      return <Loader2 className="size-5 animate-spin text-cyan" aria-label="running" />;
    case CheckStatus.SUCCESS:
      return <CircleCheck className="size-5 text-success" aria-label="passed" />;
    case CheckStatus.FAILED:
      return <CircleX className="size-5 text-danger" aria-label="failed" />;
    case CheckStatus.SKIPPED:
      return <MinusCircle className="size-5 text-fg-subtle" aria-label="skipped" />;
    default:
      return <CircleDashed className="size-5 text-fg-subtle" aria-label="not run" />;
  }
}

export default function DiagnosticsPage() {
  const [results, setResults] = useState<Record<string, CheckInfo | undefined>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [env, setEnv] = useState<{ secure: boolean; media: boolean; display: boolean } | null>(null);

  async function run() {
    setRunning(true);
    setError('');
    setResults({});
    setEnv({
      secure: window.isSecureContext,
      media: !!navigator.mediaDevices?.getUserMedia,
      display: !!navigator.mediaDevices?.getDisplayMedia,
    });
    try {
      const { token, url } = await api<{ token: string; url: string }>('/diagnostics/token', { method: 'POST' });
      const check = new ConnectionCheck(url, token);
      for (const step of STEPS) {
        setResults((r) => ({ ...r, [step.key]: { name: step.label, status: CheckStatus.RUNNING, description: '', logs: [] } as unknown as CheckInfo }));
        const info = await step.run(check).catch((e: Error) => ({ name: step.label, status: CheckStatus.FAILED, description: e.message, logs: [] }) as unknown as CheckInfo);
        setResults((r) => ({ ...r, [step.key]: info }));
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Connection test"
        subtitle="Checks that this device can reach the meeting server over HTTPS, WebSocket and WebRTC on this network."
        actions={
          <Button onClick={run} loading={running}>
            {Object.keys(results).length ? 'Run again' : 'Run test'}
          </Button>
        }
      />
      <ErrorText>{error}</ErrorText>
      {env && (
        <Card className="mb-4 grid gap-3 p-5 sm:grid-cols-3">
          {[
            ['Trusted HTTPS (secure context)', env.secure],
            ['Camera & microphone API', env.media],
            ['Screen sharing API', env.display],
          ].map(([label, ok]) => (
            <div key={label as string} className="flex items-center gap-2 text-[13px]">
              {ok ? <CircleCheck className="size-5 text-success" aria-label="passed" /> : <CircleX className="size-5 text-danger" aria-label="failed" />}
              {label}
            </div>
          ))}
        </Card>
      )}
      <Card className="divide-y divide-line/60">
        {STEPS.map((s) => {
          const info = results[s.key];
          const logs = (info as unknown as { logs?: { level: string; message: string }[] })?.logs ?? [];
          return (
            <div key={s.key} className="flex gap-3 px-5 py-4">
              <StatusIcon status={info?.status} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{s.label}</p>
                {logs.length > 0 && (
                  <ul className="mt-1 space-y-0.5 font-mono text-xs text-fg-subtle">
                    {logs.slice(-4).map((l, i) => (
                      <li key={i} className={l.level === 'error' ? 'text-red-300' : l.level === 'warning' ? 'text-warning' : ''}>
                        {l.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </Card>
      <div className="mt-4 space-y-1 text-[13px] text-fg-subtle">
        <p>If signaling succeeds but media fails, check that UDP 7882 and TCP 7881 are allowed by the host firewall and that Wi-Fi client isolation is off.</p>
        <p>Warnings about missing public IPv4 candidates or ICE/TCP are written for internet-facing servers and are expected on this LAN-only demo, as long as the candidates show the demo host&apos;s LAN address.</p>
      </div>
    </>
  );
}
