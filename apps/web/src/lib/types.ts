export type UserRole = 'ADMIN' | 'HOST' | 'MEMBER';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface AdminUser extends User {
  isActive: boolean;
  createdAt: string;
}

export type MeetingStatus = 'ACTIVE' | 'ENDED';

export interface Meeting {
  id: string;
  roomCode: string;
  title: string;
  status: MeetingStatus;
  createdAt: string;
  endedAt: string | null;
  hostId: string;
  hostName?: string;
  isHost: boolean;
}

export interface MeetingDetail extends Meeting {
  activeRecording: { id: string; status: RecordingStatus; startedAt: string | null } | null;
  maxParticipants: number;
}

export type RecordingStatus = 'REQUESTED' | 'STARTING' | 'RECORDING' | 'STOPPING' | 'FINALIZING' | 'COMPLETED' | 'FAILED';

export interface Recording {
  id: string;
  meetingId: string;
  meetingTitle: string;
  roomCode: string;
  status: RecordingStatus;
  requestedBy?: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  fileSize: number | null;
  errorMessage: string | null;
  canManage: boolean;
}

export interface AuditItem {
  id: string;
  createdAt: string;
  action: string;
  success: boolean;
  actor: { id: string; email?: string; displayName?: string } | null;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  metadata: Record<string, unknown> | null;
}

export interface JoinToken {
  token: string;
  url: string;
  isHost: boolean;
}
