/** Ownership-checked proxy for files produced by code execution (charts, CSVs). */
import Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/claude/client";
import { readAnonId } from "@/lib/platform/anon";
import { contentDisposition, isValidFileId, ownsFile, servableContentType } from "@/lib/platform/files";
import { jsonError, notFound, routeErrorResponse, unauthorized } from "@/lib/platform/http";
import { getStore } from "@/lib/store";

const isNotFound = (e: unknown) => e instanceof Anthropic.APIError && (e.status === 404 || e.status === 403);

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const anonId = await readAnonId();
  if (!anonId) return unauthorized();
  const { id } = await ctx.params;
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId || !isValidFileId(id)) return notFound();

  try {
    if (!ownsFile(await getStore().getSession(sessionId), anonId, id)) return notFound();

    const client = anthropic();
    const meta = await client.files.retrieveMetadata(id);
    if (meta.downloadable === false) return notFound();
    const contentType = servableContentType(meta.mime_type);
    if (!contentType) return jsonError(415, "That file type can't be shown here.", "unsupported_media_type");

    const file = await client.files.download(id);
    if (!file.ok || !file.body) return jsonError(502, "Couldn't fetch that file. Please try again.", "upstream");
    return new Response(file.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition(contentType, meta.filename),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (isNotFound(e)) return notFound();
    if (e instanceof Anthropic.APIError) return jsonError(502, "Couldn't fetch that file. Please try again.", "upstream");
    return routeErrorResponse(e, "GET /api/files/[id]");
  }
}
