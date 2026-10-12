export type UserRole = 'ADMIN' | 'HOST' | 'MEMBER';

/** The signed-in user (login and /auth/me). */
export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  mustChangePassword: boolean;
  privacyNoticeAccepted: boolean;
  avatarVersion: number | null;
}

export interface Department {
  id: string;
  name: string;
  isActive: boolean;
}

/** Public card: what other users may see (no phone, employee ID, role or suspension). */
export interface DirectoryUser {
  id: string;
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  department: Department | null;
  avatarVersion: number | null;
}

/** Own profile, or an admin viewing a full profile. */
export interface Profile extends DirectoryUser {
  phone: string | null;
  employeeId: string | null;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  anonymizedAt: string | null;
}

export type AccountStatus = 'ACTIVE' | 'LEAVING' | 'SUSPENDED' | 'ANONYMIZED';
export type SuspensionReason = 'RESIGNED' | 'TERMINATED' | 'LONG_LEAVE' | 'SECURITY' | 'OTHER';
export type SuspensionStatus = 'SCHEDULED' | 'ACTIVE' | 'CANCELLED' | 'LIFTED';

export interface Suspension {
  id: string;
  reason: SuspensionReason;
  note: string | null;
  status: SuspensionStatus;
  effectiveAt: string;
  handoverToId: string | null;
  createdAt: string;
  appliedAt: string | null;
  cancelledAt: string | null;
  liftedAt: string | null;
  liftNote: string | null;
}

/** Row in the admin users table. */
export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  employeeId: string | null;
  department: Department | null;
  role: UserRole;
  status: AccountStatus;
  effectiveAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  avatarVersion: number | null;
}

export interface AdminUserDetail extends Profile {
  status: AccountStatus;
  currentSuspension: Suspension | null;
  suspensionHistory: Suspension[];
}

export interface SessionInfo {
  publicId: string;
  deviceLabel: string;
  ip: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
  current: boolean;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminDepartment extends Department {
  activeUserCount: number;
}

export interface ImportPreviewRow {
  line: number;
  values: Record<string, string>;
  errors: { column: string; message: string }[];
}

export interface ImportPreview {
  importId: string;
  total: number;
  validCount: number;
  errorCount: number;
  rows: ImportPreviewRow[];
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
