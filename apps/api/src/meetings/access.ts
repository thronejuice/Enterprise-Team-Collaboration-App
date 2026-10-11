import type { Meeting, MeetingParticipant, UserRole } from '@prisma/client';

interface Actor {
  id: string;
  role: UserRole;
}
type MeetingRef = Pick<Meeting, 'createdById'>;
type ParticipantRef = Pick<MeetingParticipant, 'firstJoinedAt' | 'revokedAt'> | null | undefined;

/** Host controls (record, remove, mute, end) belong to the meeting creator and to admins. */
export const canManageMeeting = (actor: Actor, meeting: MeetingRef) =>
  actor.role === 'ADMIN' || meeting.createdById === actor.id;

/** Admitted (code accepted) and not removed. */
export const canAccessMeeting = (actor: Actor, meeting: MeetingRef, participant: ParticipantRef) =>
  canManageMeeting(actor, meeting) || (!!participant && !participant.revokedAt);

/** Recordings: people who actually joined the meeting, its host, and admins. */
export const canViewRecordings = (actor: Actor, meeting: MeetingRef, participant: ParticipantRef) =>
  canManageMeeting(actor, meeting) || (!!participant && !!participant.firstJoinedAt && !participant.revokedAt);
