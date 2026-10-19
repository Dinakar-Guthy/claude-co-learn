/**
 * Pure mappers from Claude content blocks (code execution, text) to stream events and transcript items.
 * Item ids are deterministic so streamed events and the persisted transcript line up:
 * text → `${messageId}:${blockIndex}`, code run → the server_tool_use block id.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Source, TranscriptItem } from "@/lib/contracts/session";
import { hostOf, isWebUrl } from "@/lib/sources";

type Block = Anthropic.Beta.BetaContentBlock;
type CodeRun = Extract<TranscriptItem, { kind: "code_run" }>;
export type CodeLanguage = CodeRun["language"];

/** Cap tool output we stream and persist (the model still sees the full output). */
export const MAX_OUTPUT_CHARS = 20_000;
const cap = (s: string) => (s.length > MAX_OUTPUT_CHARS ? `${s.slice(0, MAX_OUTPUT_CHARS)}\n… (output truncated)` : s);

export const textItemId = (messageId: string, index: number) => `${messageId}:${index}`;

export const isCodeToolName = (name: string) => name === "bash_code_execution" || name === "text_editor_code_execution";

/** Web search citations of a text block (other citation kinds have no link). */
export function webCitations(citations: readonly Anthropic.Beta.BetaTextCitation[] | null | undefined): Source[] {
  return (citations ?? []).flatMap((c) => (c.type === "web_search_result_location" && isWebUrl(c.url) ? [{ url: c.url, title: c.title?.trim() || hostOf(c.url) }] : []));
}


/**
 * Groups consecutive text blocks into one transcript item (web search splits a cited answer into many blocks) and
 * numbers their sources. Shared by the live stream and the persisted transcript, so both produce the same text.
 */
export class TextGroups {
  private groupId: string | null = null;
  private sources: Source[] = [];
  constructor(private readonly messageId: string) {}

  /** Call at every block start, in order; returns the item id for a text block, null otherwise. */
  start(index: number, isText: boolean): string | null {
    if (!isText) {
      this.groupId = null;
      return null;
    }
    if (!this.groupId) {
      this.groupId = textItemId(this.messageId, index);
      this.sources = [];
    }
    return this.groupId;
  }

  /** At the end of a text block: the marker to append (e.g. " [1][2]") and the group's numbered sources so far. */
  cite(citations: Source[]): { marker: string; sources: Source[] } {
    const numbers: number[] = [];
    for (const c of citations) {
      let at = this.sources.findIndex((s) => s.url === c.url);
      if (at === -1) {
        this.sources = [...this.sources, c];
        at = this.sources.length - 1;
      }
      if (!numbers.includes(at + 1)) numbers.push(at + 1);
    }
    return { marker: numbers.length ? ` ${numbers.map((n) => `[${n}]`).join("")}` : "", sources: this.sources };
  }
}

const HEREDOC = /^\s*python3?\s*(?:-\s*)?<<-?\s*['"]?(\w+)['"]?[^\n]*\n([\s\S]*?)\n\s*\1\s*$/;
const RUNS_PYTHON = /(^|[\s;&|(])python3?(\s|$)/;

/** Language + display code for a server_tool_use input. */
export function describeCode(name: string, input: unknown): { language: CodeLanguage; code: string } {
  const i = (input ?? {}) as Record<string, unknown>;
  if (name === "text_editor_code_execution") {
    const path = String(i.path ?? "");
    switch (i.command) {
      case "create":
        return { language: "file", code: `# create ${path}\n${String(i.file_text ?? "")}` };
      case "str_replace":
        return { language: "file", code: `# edit ${path}\n- ${String(i.old_str ?? "")}\n+ ${String(i.new_str ?? "")}` };
      default:
        return { language: "file", code: `# ${String(i.command ?? "view")} ${path}` };
    }
  }
  const command = String(i.command ?? i.code ?? "");
  const heredoc = HEREDOC.exec(command);
  if (heredoc) return { language: "python", code: heredoc[2] };
  return { language: RUNS_PYTHON.test(command) ? "python" : "bash", code: command };
}

export interface CodeResult {
  toolUseId: string;
  stdout: string;
  stderr: string;
  returnCode: number;
  fileIds: string[];
}

/** Normalizes a bash / text-editor tool result block; null for any other block. */
export function codeResult(block: Block): CodeResult | null {
  if (block.type === "bash_code_execution_tool_result") {
    const c = block.content;
    if (c.type === "bash_code_execution_tool_result_error") {
      return { toolUseId: block.tool_use_id, stdout: "", stderr: `Code execution error: ${c.error_code}`, returnCode: 1, fileIds: [] };
    }
    return {
      toolUseId: block.tool_use_id,
      stdout: cap(c.stdout),
      stderr: cap(c.stderr),
      returnCode: c.return_code,
      fileIds: c.content.map((f) => f.file_id),
    };
  }
  if (block.type === "text_editor_code_execution_tool_result") {
    const c = block.content;
    const base = { toolUseId: block.tool_use_id, stderr: "", returnCode: 0, fileIds: [] };
    switch (c.type) {
      case "text_editor_code_execution_tool_result_error":
        return { ...base, stdout: "", stderr: `File operation error: ${c.error_code}${c.error_message ? `: ${c.error_message}` : ""}`, returnCode: 1 };
      case "text_editor_code_execution_view_result":
        return { ...base, stdout: cap(c.file_type === "text" ? c.content : `(${c.file_type} file)`) };
      case "text_editor_code_execution_create_result":
        return { ...base, stdout: c.is_file_update ? "File updated." : "File created." };
      case "text_editor_code_execution_str_replace_result":
        return { ...base, stdout: "File edited." };
    }
  }
  return null;
}

/** Transcript items (assistant text + code runs) for one assistant message, in block order. */
export function transcriptFromContent(messageId: string, content: Block[]): TranscriptItem[] {
  const items: TranscriptItem[] = [];
  const runs = new Map<string, CodeRun>();
  const groups = new TextGroups(messageId);
  content.forEach((block, index) => {
    const groupId = groups.start(index, block.type === "text");
    if (block.type === "text") {
      const { marker, sources } = groups.cite(webCitations(block.citations));
      const text = block.text + marker;
      const item = items.find((i) => i.id === groupId);
      if (item?.kind === "assistant_text") {
        item.text += text;
        if (sources.length) item.sources = sources;
      } else if (text) {
        items.push({ kind: "assistant_text", id: groupId!, text, ...(sources.length ? { sources } : {}) });
      }
    } else if (block.type === "server_tool_use" && isCodeToolName(block.name)) {
      const run: CodeRun = { kind: "code_run", id: block.id, ...describeCode(block.name, block.input), fileIds: [] };
      runs.set(block.id, run);
      items.push(run);
    } else {
      const result = codeResult(block);
      const run = result && runs.get(result.toolUseId);
      if (result && run) Object.assign(run, { stdout: result.stdout, stderr: result.stderr, returnCode: result.returnCode, fileIds: result.fileIds });
    }
  });
  return items;
}

/** All output file ids produced in an assistant message. */
export function fileIdsFromContent(content: Block[]): string[] {
  return content.flatMap((b) => codeResult(b)?.fileIds ?? []);
}

type AnyBlock = { type: string };

/** An assistant turn cut off by pause_turn ends with a server tool call; it is resumed by re-sending as-is. */
export function isPausedAssistant(message: { role: string; content: unknown } | undefined): boolean {
  if (message?.role !== "assistant" || !Array.isArray(message.content)) return false;
  const last = message.content.at(-1) as { type?: string } | undefined;
  return last?.type === "server_tool_use";
}

/** A server tool's result block (`bash_code_execution_tool_result`, `web_search_tool_result`, ...), not a client `tool_result`. */
function serverResultId(block: AnyBlock): string | undefined {
  if (block.type === "tool_result" || !block.type.endsWith("_tool_result")) return undefined;
  const id = (block as { tool_use_id?: unknown }).tool_use_id;
  return typeof id === "string" ? id : undefined;
}

/** Ids of every server tool result in `content`. */
export function serverResultIds(content: readonly AnyBlock[]): string[] {
  return content.flatMap((b) => serverResultId(b) ?? []);
}

/**
 * Removes `server_tool_use` blocks whose id isn't in `resultIds`. The API rejects a server tool call without its
 * result, and it doesn't run server tools in a response that stops for a client tool (or hits max_tokens).
 */
export function dropOrphanServerToolUses<T extends AnyBlock>(content: T[], resultIds: ReadonlySet<string>): { content: T[]; dropped: string[] } {
  const dropped: string[] = [];
  const kept = content.filter((b) => {
    if (b.type !== "server_tool_use") return true;
    const id = String((b as { id?: unknown }).id);
    if (resultIds.has(id)) return true;
    dropped.push(id);
    return false;
  });
  return { content: dropped.length ? kept : content, dropped };
}
