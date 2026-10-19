/**
 * Pure reducer that builds transcript state from chat stream events. Item ids match the server's persisted
 * transcript, so a reloaded session (GET /api/session/[id]) renders the same items.
 */
import type { TranscriptItem } from "@/lib/contracts/session";
import type { ChatStreamEvent } from "@/lib/contracts/stream";

type CodeRun = Extract<TranscriptItem, { kind: "code_run" }>;

function upsert(items: TranscriptItem[], id: string, make: () => TranscriptItem, update: (item: TranscriptItem) => TranscriptItem): TranscriptItem[] {
  const at = items.findIndex((i) => i.id === id);
  if (at === -1) return [...items, make()];
  const next = items.slice();
  next[at] = update(items[at]);
  return next;
}

const addOnce = (items: TranscriptItem[], item: TranscriptItem) => (items.some((i) => i.id === item.id) ? items : [...items, item]);

/** Returns the next transcript (a new array when something changed; the same array otherwise). */
export function applyEvent(items: TranscriptItem[], event: ChatStreamEvent): TranscriptItem[] {
  switch (event.type) {
    case "text_delta":
      return upsert(
        items,
        event.itemId,
        () => ({ kind: "assistant_text", id: event.itemId, text: event.text }),
        (item) => (item.kind === "assistant_text" ? { ...item, text: item.text + event.text } : item),
      );
    case "sources":
      return upsert(
        items,
        event.itemId,
        () => ({ kind: "assistant_text", id: event.itemId, text: "", sources: event.sources }),
        (item) => (item.kind === "assistant_text" ? { ...item, sources: event.sources } : item),
      );
    case "code_start":
      return upsert(
        items,
        event.itemId,
        () => ({ kind: "code_run", id: event.itemId, language: event.language, code: event.code, fileIds: [] }),
        (item) => (item.kind === "code_run" ? { ...item, language: event.language, code: event.code } : item),
      );
    case "code_result": {
      const result = { stdout: event.stdout, stderr: event.stderr, returnCode: event.returnCode, fileIds: event.fileIds };
      return upsert(
        items,
        event.itemId,
        (): CodeRun => ({ kind: "code_run", id: event.itemId, language: "bash", code: "", ...result }),
        (item) => (item.kind === "code_run" ? { ...item, ...result } : item),
      );
    }
    case "moment":
      return addOnce(items, { kind: "moment", id: event.itemId, momentId: event.moment.id });
    case "prediction_reveal":
      return addOnce(items, {
        kind: "prediction_reveal",
        id: event.itemId,
        momentId: event.momentId,
        actualResult: event.actualResult,
        verdict: event.verdict,
        why: event.why,
        xp: event.xp.amount,
      });
    case "milestone":
      return addOnce(items, { kind: "milestone", id: event.itemId, label: event.label });
    case "notice":
      return addOnce(items, { kind: "notice", id: event.itemId, text: event.text });
    case "status":
    case "turn_end":
    case "error":
      return items;
  }
}
