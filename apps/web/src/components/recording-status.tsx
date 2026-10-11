import { Pill } from './ui';
import type { RecordingStatus } from '@/lib/types';

const labels: Record<RecordingStatus, { label: string; tone: 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'primary' }> = {
  REQUESTED: { label: 'Requested', tone: 'warning' },
  STARTING: { label: 'Starting', tone: 'warning' },
  RECORDING: { label: 'Recording', tone: 'danger' },
  STOPPING: { label: 'Stopping', tone: 'warning' },
  FINALIZING: { label: 'Finalizing', tone: 'info' },
  COMPLETED: { label: 'Ready', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
};

export function RecordingStatusPill({ status }: { status: RecordingStatus }) {
  const { label, tone } = labels[status];
  return (
    <Pill tone={tone}>
      {status === 'RECORDING' && <span className="size-1.5 animate-rec-pulse rounded-full bg-danger" />}
      {label}
    </Pill>
  );
}

export const isInFlight = (s: RecordingStatus) => s !== 'COMPLETED' && s !== 'FAILED';
