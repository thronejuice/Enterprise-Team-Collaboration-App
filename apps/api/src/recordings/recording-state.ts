import type { RecordingStatus } from '@prisma/client';
import { EgressStatus } from 'livekit-server-sdk';

export const IN_FLIGHT_STATUSES: RecordingStatus[] = ['REQUESTED', 'STARTING', 'RECORDING', 'STOPPING', 'FINALIZING'];
export const TERMINAL_STATUSES: RecordingStatus[] = ['COMPLETED', 'FAILED'];

const RANK: Record<RecordingStatus, number> = {
  REQUESTED: 0,
  STARTING: 1,
  RECORDING: 2,
  STOPPING: 3,
  FINALIZING: 4,
  COMPLETED: 5,
  FAILED: 5,
};

/**
 * Maps an Egress status to our lifecycle. Egress "complete" only means the upload finished; the
 * recording becomes COMPLETED after the object is verified in storage, so it maps to FINALIZING.
 */
export function statusFromEgress(status: EgressStatus): RecordingStatus {
  switch (status) {
    case EgressStatus.EGRESS_STARTING:
      return 'STARTING';
    case EgressStatus.EGRESS_ACTIVE:
      return 'RECORDING';
    case EgressStatus.EGRESS_ENDING:
      return 'STOPPING';
    case EgressStatus.EGRESS_COMPLETE:
    case EgressStatus.EGRESS_LIMIT_REACHED:
      return 'FINALIZING';
    default:
      return 'FAILED';
  }
}

/**
 * Returns the status to move to, or null to stay. Webhooks can arrive late or out of order,
 * so transitions only move forward and terminal states never change.
 */
export function nextStatus(current: RecordingStatus, target: RecordingStatus): RecordingStatus | null {
  if (TERMINAL_STATUSES.includes(current)) return null;
  if (target === 'FAILED') return 'FAILED';
  return RANK[target] > RANK[current] ? target : null;
}
