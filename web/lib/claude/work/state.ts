/**
 * Mutable state for one work turn, plus race-safe persistence.
 *
 * History is append-only (preserved thinking): messages are only ever appended, never rewritten, with one
 * exception: server tool calls that never got a result are dropped (see `sanitizeHistory`), because the API
 * rejects them. New messages are "pending" until a model response for them succeeds ("committed"), so a failed first
 * request never leaves a dangling user + system pair in stored history.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { ApiMessages, Session, TranscriptItem } from "@/lib/contracts/session";
import type { Store } from "@/lib/contracts/store";
import { codeResult, dropOrphanServerToolUses, fileIdsFromContent, isPausedAssistant, serverResultIds, transcriptFromContent } from "./blocks";

export type ApiMessage = Anthropic.Beta.BetaMessageParam;
type ContentParam = Anthropic.Beta.BetaContentBlockParam;

/** An assistant turn the API will accept: something besides thinking (an empty turn carries nothing to preserve). */
function acceptableAssistantContent(content: ContentParam[]): ContentParam[] {
  const visible = content.some((b) => b.type !== "thinking" && b.type !== "redacted_thinking");
  return visible ? content : [...content, { type: "text", text: "…" }];
}

/**
 * Drops server tool calls that have no result anywhere in the conversation (a result can land in the next
 * assistant message across pause_turn, so ids are matched globally). A trailing paused assistant message is
 * left as-is: it is resumed by re-sending it, and the API supplies the result. Inputs are never mutated.
 */
export function sanitizeHistory(messages: ApiMessage[]): { messages: ApiMessage[]; dropped: string[] } {
  const results = new Set(messages.flatMap((m) => (typeof m.content === "string" ? [] : serverResultIds(m.content))));
  const dropped: string[] = [];
  const out = messages.map((m, i) => {
    if (m.role !== "assistant" || typeof m.content === "string") return m;
    if (i === messages.length - 1 && isPausedAssistant(m)) return m;
    const r = dropOrphanServerToolUses(m.content, results);
    if (!r.dropped.length) return m;
    dropped.push(...r.dropped);
    return { ...m, content: acceptableAssistantContent(r.content) };
  });
  return { messages: dropped.length ? out : messages, dropped };
}

/** Session fields the work loop owns; everything else may be patched concurrently by other routes. */
export type OwnedSessionFields = Pick<Session, "engine" | "containerId" | "fileIds" | "demoFileAttached">;

export class TurnState {
  private pending: ApiMessage[] = [];
  private committed = 0;
  private items = new Map<string, TranscriptItem>();
  private staged: TranscriptItem[] = [];
  private onCommit: (() => void)[] = [];
  dirty = false;
  readonly store: Store;
  readonly session: Session;
  private readonly history: ApiMessage[];

  constructor(store: Store, session: Session, history: ApiMessage[]) {
    this.store = store;
    this.session = session;
    this.history = history;
  }

  /** Full message list for the next request. */
  messages(): ApiMessage[] {
    return sanitizeHistory([...this.history, ...this.pending]).messages;
  }

  lastStoredMessage(): ApiMessage | undefined {
    return this.history.at(-1);
  }

  push(message: ApiMessage): void {
    this.pending.push(message);
  }

  /** Transcript item that only becomes visible once the turn's first request succeeds. */
  stage(item: TranscriptItem): void {
    this.staged.push(item);
  }

  /** Runs once, at the first commit (e.g. mark the demo file attached). */
  whenCommitted(fn: () => void): void {
    this.onCommit.push(fn);
  }

  /** Last uncommitted user message (still safe to amend: the API has never accepted it). */
  uncommittedUserMessage(): ApiMessage | undefined {
    return this.pending.slice(this.committed).findLast((m) => m.role === "user");
  }

  commit(): void {
    this.committed = this.pending.length;
    if (this.staged.length) {
      // Staged items (the user's message) come before anything the response produced.
      this.items = new Map([...this.staged.splice(0).map((i) => [i.id, i] as const), ...this.items]);
    }
    for (const fn of this.onCommit.splice(0)) fn();
    this.dirty = true;
  }

  /**
   * Appends an assistant response as returned, plus its transcript items and output files. Unless the response
   * paused (and will be resumed), server tool calls without a result in it were never run and are dropped.
   * Returns the dropped tool-call ids.
   */
  appendAssistant(message: Anthropic.Beta.BetaMessage): string[] {
    const paused = message.stop_reason === "pause_turn";
    const { content: blocks, dropped } = paused
      ? { content: message.content, dropped: [] }
      : dropOrphanServerToolUses(message.content, new Set(serverResultIds(message.content)));
    this.push({ role: "assistant", content: acceptableAssistantContent(blocks) });
    for (const item of transcriptFromContent(message.id, blocks)) this.upsert(item);
    // A code result can land in a later message than its tool call (e.g. across pause_turn).
    for (const block of blocks) {
      const result = codeResult(block);
      const run = result && this.items.get(result.toolUseId);
      if (result && run?.kind === "code_run" && run.returnCode === undefined) {
        this.upsert({ ...run, stdout: result.stdout, stderr: result.stderr, returnCode: result.returnCode, fileIds: result.fileIds });
      }
    }
    const files = fileIdsFromContent(blocks);
    if (files.length) this.session.fileIds = [...new Set([...this.session.fileIds, ...files])];
    return dropped;
  }

  addItem(item: TranscriptItem): void {
    this.upsert(item);
    this.dirty = true;
  }

  markDirty(): void {
    this.dirty = true;
  }

  private upsert(item: TranscriptItem): void {
    this.items.set(item.id, item);
  }

  /** Writes owned session fields onto the latest stored session, committed history, and new transcript items. */
  async persist(): Promise<void> {
    const { store, session } = this;
    const latest = (await store.getSession(session.id)) ?? session;
    const owned: OwnedSessionFields = {
      engine: session.engine,
      containerId: session.containerId,
      fileIds: [...new Set([...latest.fileIds, ...session.fileIds])],
      demoFileAttached: latest.demoFileAttached || session.demoFileAttached,
    };
    await store.putSession({ ...latest, ...owned });
    const { messages, dropped } = sanitizeHistory([...this.history, ...this.pending.slice(0, this.committed)]);
    // ApiMessages is typed with the non-beta MessageParam; beta blocks (e.g. `fallback`) are wire-compatible.
    await store.putApiMessages(session.id, messages as unknown as ApiMessages);
    // Code runs whose calls were dropped never ran; don't leave them in the transcript.
    for (const id of dropped) this.items.delete(id);
    if (this.items.size || dropped.length) {
      const orphan = new Set(dropped);
      const transcript = (await store.getTranscript(session.id)).filter((t) => !(t.kind === "code_run" && orphan.has(t.id)));
      const index = new Map(transcript.map((t, i) => [t.id, i]));
      for (const item of this.items.values()) {
        const at = index.get(item.id);
        if (at === undefined) transcript.push(item);
        else transcript[at] = item;
      }
      await store.putTranscript(session.id, transcript);
    }
    this.dirty = false;
  }
}
