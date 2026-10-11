export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterSeconds?: number,
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

/** Same-origin JSON client for the NestJS API behind the reverse proxy (/api/*). */
export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
    cache: 'no-store',
    signal: init.signal,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const retry = body && typeof body === 'object' && 'retryAfterSeconds' in body ? Number((body as { retryAfterSeconds: number }).retryAfterSeconds) : undefined;
    throw new ApiError(res.status, messageFrom(body, res.status), retry);
  }
  return body as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429 && error.retryAfterSeconds) {
      const mins = Math.ceil(error.retryAfterSeconds / 60);
      return `${error.message} (about ${mins} minute${mins === 1 ? '' : 's'})`;
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}
