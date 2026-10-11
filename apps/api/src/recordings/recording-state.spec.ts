import { EgressStatus } from 'livekit-server-sdk';
import { nextStatus, statusFromEgress } from './recording-state';

describe('statusFromEgress', () => {
  it('maps egress statuses to the recording lifecycle', () => {
    expect(statusFromEgress(EgressStatus.EGRESS_STARTING)).toBe('STARTING');
    expect(statusFromEgress(EgressStatus.EGRESS_ACTIVE)).toBe('RECORDING');
    expect(statusFromEgress(EgressStatus.EGRESS_ENDING)).toBe('STOPPING');
    expect(statusFromEgress(EgressStatus.EGRESS_COMPLETE)).toBe('FINALIZING');
    expect(statusFromEgress(EgressStatus.EGRESS_LIMIT_REACHED)).toBe('FINALIZING');
    expect(statusFromEgress(EgressStatus.EGRESS_FAILED)).toBe('FAILED');
    expect(statusFromEgress(EgressStatus.EGRESS_ABORTED)).toBe('FAILED');
  });
});

describe('nextStatus', () => {
  it('moves forward through the happy path', () => {
    expect(nextStatus('REQUESTED', 'STARTING')).toBe('STARTING');
    expect(nextStatus('STARTING', 'RECORDING')).toBe('RECORDING');
    expect(nextStatus('RECORDING', 'STOPPING')).toBe('STOPPING');
    expect(nextStatus('STOPPING', 'FINALIZING')).toBe('FINALIZING');
    expect(nextStatus('FINALIZING', 'COMPLETED')).toBe('COMPLETED');
  });

  it('ignores late or duplicate events', () => {
    expect(nextStatus('STOPPING', 'RECORDING')).toBeNull();
    expect(nextStatus('RECORDING', 'RECORDING')).toBeNull();
    expect(nextStatus('COMPLETED', 'FAILED')).toBeNull();
    expect(nextStatus('FAILED', 'RECORDING')).toBeNull();
  });

  it('allows failure from any in-flight state', () => {
    for (const s of ['REQUESTED', 'STARTING', 'RECORDING', 'STOPPING', 'FINALIZING'] as const) {
      expect(nextStatus(s, 'FAILED')).toBe('FAILED');
    }
  });

  it('can skip states when webhooks were missed', () => {
    expect(nextStatus('STARTING', 'FINALIZING')).toBe('FINALIZING');
  });
});
