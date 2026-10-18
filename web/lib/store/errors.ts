/** Typed storage failure. Routes map it to a friendly 503 (see `storeErrorResponse` in lib/platform/http.ts). */
export class StoreError extends Error {
  readonly code = "store_unavailable" as const;
  constructor(
    readonly op: string,
    options?: ErrorOptions,
  ) {
    super(`Store operation failed: ${op}`, options);
    this.name = "StoreError";
  }
}

export function isStoreError(e: unknown): e is StoreError {
  return e instanceof StoreError;
}

export const STORE_ERROR_MESSAGE = "Co-learn couldn't reach its storage just now. Please try again in a moment.";

/** Error text safe for logs: strips URLs and anything token-shaped, and caps length. */
export function redactError(e: unknown): string {
  const name = e instanceof Error ? e.name : typeof e;
  const message = e instanceof Error ? e.message : String(e);
  const safe = message
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/[A-Za-z0-9_\-=]{32,}/g, "<redacted>")
    .slice(0, 200);
  return `${name}: ${safe}`;
}
