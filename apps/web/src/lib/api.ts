export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterSeconds?: number,
    /** Stable machine code from the API (e.g. ACCOUNT_SUSPENDED), when the server sends one. */
    readonly code?: string,
  ) {
    super(message);
  }
}

function messageFrom(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message: unknown }).message;
    if (Array.isArray(m)) return m.join('. ');
    if (typeof m === 'string') return m;
  }
  if (status === 401) return 'Your session has expired. Please sign in again.';
  return `Request failed (${status})`;
}

function codeFrom(body: unknown): string | undefined {
  return body && typeof body === 'object' && 'code' in body && typeof (body as { code: unknown }).code === 'string' ? (body as { code: string }).code : undefined;
}

/** Fetch against the API; throws ApiError for non-2xx and sends users who must change their password to /change-password. */
async function send(path: string, init: { method: string; body?: BodyInit | null; json?: unknown; signal?: AbortSignal }): Promise<Response> {
  const res = await fetch(`/api${path}`, {
    method: init.method,
    headers: init.json === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.json === undefined ? (init.body ?? undefined) : JSON.stringify(init.json),
    credentials: 'same-origin',
    cache: 'no-store',
    signal: init.signal,
  });
  if (res.ok) return res;
  const text = await res.text();
  const body = text ? (safeParse(text) as unknown) : undefined;
  const code = codeFrom(body);
  const onboarding = code === 'PASSWORD_CHANGE_REQUIRED' ? '/change-password' : code === 'PRIVACY_NOTICE_REQUIRED' ? '/privacy-notice' : undefined;
  if (onboarding && typeof window !== 'undefined' && window.location.pathname !== onboarding) window.location.assign(onboarding);
  const retry = body && typeof body === 'object' && 'retryAfterSeconds' in body ? Number((body as { retryAfterSeconds: number }).retryAfterSeconds) : undefined;
  throw new ApiError(res.status, messageFrom(body, res.status), retry, codeFrom(body));
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Same-origin JSON client for the NestJS API behind the reverse proxy (/api/*). */
export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = init.method ?? (init.body === undefined ? 'GET' : 'POST');
  const res = await send(path, { method, json: init.body, signal: init.signal });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** multipart/form-data upload (avatar, CSV import). */
export async function apiUpload<T>(path: string, form: FormData, method = 'POST'): Promise<T> {
  const res = await send(path, { method, body: form });
  return (await res.json()) as T;
}

/** Downloads a CSV the API returns (export, template, temporary passwords). The body is never kept in app state. */
export async function downloadCsv(path: string, init: { method?: string; json?: unknown } = {}): Promise<void> {
  const res = await send(path, { method: init.method ?? (init.json === undefined ? 'GET' : 'POST'), json: init.json });
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'download.csv';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429 && error.retryAfterSeconds) {
      const mins = Math.ceil(error.retryAfterSeconds / 60);
      return `Too many attempts. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`;
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}
