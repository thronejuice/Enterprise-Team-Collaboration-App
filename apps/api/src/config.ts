function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Environment variable ${name} must be a non-negative integer`);
  }
  return value;
}

function intList(name: string, fallback: number[]): number[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  const values = raw.split(',').map((part) => Number.parseInt(part.trim(), 10));
  if (values.length === 0 || values.some((v) => !Number.isFinite(v) || v <= 0)) {
    throw new Error(`Environment variable ${name} must be a comma-separated list of positive integers`);
  }
  return values;
}

export interface AppConfig {
  port: number;
  /** Days to keep audit rows and recordings before the daily purge (0 = keep forever). */
  retention: { auditDays: number; recordingDays: number };
  publicOrigin: string;
  cookieSecure: boolean;
  sessionTtlSeconds: number;
  redisUrl: string;
  livekit: {
    apiUrl: string;
    publicUrl: string;
    apiKey: string;
    apiSecret: string;
    tokenTtlSeconds: number;
  };
  s3: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
  };
  limits: {
    maxParticipantsPerRoom: number;
    maxConcurrentRecordings: number;
  };
  rateLimit: {
    windowSeconds: number;
    maxFailuresPerUser: number;
    maxFailuresPerIp: number;
    lockoutScheduleSeconds: number[];
  };
  recording: {
    preset: string;
    layout: string;
  };
}

export function loadConfig(): AppConfig {
  const hostname = required('DEMO_HOSTNAME');
  return {
    port: int('API_PORT', 3001),
    publicOrigin: `https://${hostname}`,
    retention: { auditDays: int('AUDIT_RETENTION_DAYS', 365), recordingDays: int('RECORDING_RETENTION_DAYS', 180) },
    cookieSecure: process.env.COOKIE_SECURE !== 'false',
    sessionTtlSeconds: int('SESSION_TTL_HOURS', 12) * 3600,
    redisUrl: required('REDIS_URL'),
    livekit: {
      apiUrl: required('LIVEKIT_API_URL'),
      publicUrl: process.env.LIVEKIT_PUBLIC_URL || `wss://${hostname}/livekit`,
      apiKey: required('LIVEKIT_API_KEY'),
      apiSecret: required('LIVEKIT_API_SECRET'),
      tokenTtlSeconds: int('LIVEKIT_TOKEN_TTL_SECONDS', 600),
    },
    s3: {
      endpoint: required('S3_ENDPOINT'),
      region: process.env.S3_REGION || 'us-east-1',
      bucket: required('S3_BUCKET'),
      accessKey: required('S3_ACCESS_KEY'),
      secretKey: required('S3_SECRET_KEY'),
    },
    limits: {
      maxParticipantsPerRoom: int('MAX_PARTICIPANTS_PER_ROOM', 10),
      maxConcurrentRecordings: int('MAX_CONCURRENT_RECORDINGS', 1),
    },
    rateLimit: {
      windowSeconds: int('RATE_LIMIT_WINDOW_MINUTES', 15) * 60,
      maxFailuresPerUser: int('RATE_LIMIT_MAX_FAILURES_PER_USER', 5),
      maxFailuresPerIp: int('RATE_LIMIT_MAX_FAILURES_PER_IP', 20),
      lockoutScheduleSeconds: intList('RATE_LIMIT_LOCKOUT_MINUTES', [1, 5, 15]).map((m) => m * 60),
    },
    recording: {
      preset: process.env.RECORDING_PRESET || 'H264_720P_30',
      layout: process.env.RECORDING_LAYOUT || 'speaker',
    },
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
