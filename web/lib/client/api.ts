/**
 * Browser JSON helper for the app's routes. Errors become ApiError with the server's friendly message;
 * the limits-degraded warning (X-Colearn-Warning header, fail-open policy) is broadcast to subscribers.
 */

export const WARNING_HEADER = "X-Colearn-Warning";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryable: boolean;
  constructor(status: number, message: string, code?: string, retryable?: boolean) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable ?? (status >= 500 || status === 429);
  }
}

type Listener = (warning: string) => void;
const listeners = new Set<Listener>();

/** Subscribe to limits warnings from any API response. Returns an unsubscribe function. */
export function onApiWarning(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reportWarning(warning: string): void {
  for (const l of listeners) l(warning);
}

function readWarning(res: Response): string | null {
  const raw = res.headers.get(WARNING_HEADER);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Fetches JSON from an app route. Throws ApiError (with a user-facing message) on failure. */
export async function apiFetch<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
      headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init?.signal,
      cache: "no-store",
    });
  } catch (err) {
    if (init?.signal?.aborted) throw err;
    throw new ApiError(0, "Couldn't reach the server. Check your connection and try again.", "network", true);
  }
  const warning = readWarning(res);
  if (warning) reportWarning(warning);
  const body = (await res.json().catch(() => null)) as (T & { error?: string; code?: string; retryable?: boolean }) | null;
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? "Something went wrong. Please try again.", body?.code, body?.retryable);
  }
  return body as T;
}

export const apiGet = <T>(path: string, signal?: AbortSignal) => apiFetch<T>(path, { signal });
export const apiPost = <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body });
export const apiPatch = <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "PATCH", body });

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong. Please try again.");
