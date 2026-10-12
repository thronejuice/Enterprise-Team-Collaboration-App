import { canAccessMeeting, canManageMeeting, canViewRecordings } from './access';

const meeting = { hostId: 'host-1' };
const admin = { id: 'admin-1', role: 'ADMIN' as const };
const host = { id: 'host-1', role: 'HOST' as const };
const otherHost = { id: 'host-2', role: 'HOST' as const };
const member = { id: 'member-1', role: 'MEMBER' as const };
const joined = { firstJoinedAt: new Date(), revokedAt: null };
const admittedOnly = { firstJoinedAt: null, revokedAt: null };
const revoked = { firstJoinedAt: new Date(), revokedAt: new Date() };

describe('meeting access policy', () => {
  it('only the current host or an admin manages a meeting', () => {
    expect(canManageMeeting(host, meeting)).toBe(true);
    expect(canManageMeeting(admin, meeting)).toBe(true);
    expect(canManageMeeting(otherHost, meeting)).toBe(false);
    expect(canManageMeeting(member, meeting)).toBe(false);
  });

  it('removed participants lose meeting access', () => {
    expect(canAccessMeeting(member, meeting, admittedOnly)).toBe(true);
    expect(canAccessMeeting(member, meeting, revoked)).toBe(false);
    expect(canAccessMeeting(member, meeting, null)).toBe(false);
  });

  it('recordings require having actually joined', () => {
    expect(canViewRecordings(member, meeting, joined)).toBe(true);
    expect(canViewRecordings(member, meeting, admittedOnly)).toBe(false);
    expect(canViewRecordings(member, meeting, revoked)).toBe(false);
    expect(canViewRecordings(member, meeting, null)).toBe(false);
    expect(canViewRecordings(otherHost, meeting, null)).toBe(false);
    expect(canViewRecordings(host, meeting, null)).toBe(true);
    expect(canViewRecordings(admin, meeting, null)).toBe(true);
  });
});
