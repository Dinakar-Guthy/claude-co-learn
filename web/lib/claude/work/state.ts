/**
 * Mutable state for one work turn, plus race-safe persistence.
 *
 * History is append-only (preserved thinking): messages are only ever appended, never edited once sent.
 * New messages are "pending" until a model response for them succeeds ("committed"), so a failed first
 * request never leaves a dangling user + system pair in stored history.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { ApiMessages, Session, TranscriptItem } from "@/lib/contracts/session";
import type { Store } from "@/lib/contracts/store";
import { codeResult, fileIdsFromContent, transcriptFromContent } from "./blocks";

export type ApiMessage = Anthropic.Beta.BetaMessageParam;

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
    return [...this.history, ...this.pending];
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

  /** Appends an assistant response exactly as returned, plus its transcript items and output files. */
  appendAssistant(message: Anthropic.Beta.BetaMessage): void {
    // An empty assistant turn would be rejected on the next request; it carries nothing to preserve.
    const content: Anthropic.Beta.BetaContentBlockParam[] = message.content.length ? message.content : [{ type: "text", text: "…" }];
    this.push({ role: "assistant", content });
    for (const item of transcriptFromContent(message.id, message.content)) this.upsert(item);
    // A code result can land in a later message than its tool call (e.g. across pause_turn).
    for (const block of message.content) {
      const result = codeResult(block);
      const run = result && this.items.get(result.toolUseId);
      if (result && run?.kind === "code_run" && run.returnCode === undefined) {
        this.upsert({ ...run, stdout: result.stdout, stderr: result.stderr, returnCode: result.returnCode, fileIds: result.fileIds });
      }
    }
    const files = fileIdsFromContent(message.content);
    if (files.length) this.session.fileIds = [...new Set([...this.session.fileIds, ...files])];
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
    // ApiMessages is typed with the non-beta MessageParam; beta blocks (e.g. `fallback`) are wire-compatible.
    await store.putApiMessages(session.id, [...this.history, ...this.pending.slice(0, this.committed)] as unknown as ApiMessages);
    if (this.items.size) {
      const transcript = await store.getTranscript(session.id);
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
