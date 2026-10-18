/** Rules for the /api/files/[id] proxy: who may fetch a file and which content types we serve. */
import type { Session } from "@/lib/contracts/session";

/** Anthropic file IDs are opaque; constrain them before they reach a URL path. */
export const isValidFileId = (id: string) => /^[A-Za-z0-9_-]{1,128}$/.test(id);

export function ownsFile(session: Session | null, anonId: string, fileId: string): boolean {
  return !!session && session.anonId === anonId && session.fileIds.includes(fileId);
}

/**
 * Normalised content type if we serve it, else null. Images (charts) and CSV only.
 * SVG is refused: served from our origin it could run script.
 */
export function servableContentType(mime: string | null | undefined): string | null {
  const type = (mime ?? "").split(";")[0].trim().toLowerCase();
  if (type === "text/csv") return "text/csv; charset=utf-8";
  if (/^image\/[a-z0-9.+-]+$/.test(type) && type !== "image/svg+xml") return type;
  return null;
}

/** Content-Disposition with a header-safe filename. */
export function contentDisposition(contentType: string, filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100) || "file";
  return `${contentType.startsWith("text/csv") ? "attachment" : "inline"}; filename="${safe}"`;
}
