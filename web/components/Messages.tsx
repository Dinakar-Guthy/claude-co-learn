import type { Source } from "@/lib/contracts/session";
import { hostOf } from "@/lib/sources";
import { Markdown } from "./Markdown";

export function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-card rounded-br-md bg-surface-2 px-4 py-2.5 whitespace-pre-wrap break-words">
        <span className="sr-only">You: </span>
        {text}
      </div>
    </div>
  );
}

export function AssistantMessage({ text, sources = [], streaming = false }: { text: string; sources?: Source[]; streaming?: boolean }) {
  return (
    <div className="text-text" aria-busy={streaming || undefined}>
      <span className="sr-only">Claude: </span>
      <Markdown>{text}</Markdown>
      {streaming && <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 rounded-sm bg-accent motion-safe:animate-pulse" />}
      {sources.length > 0 && <SourceList sources={sources} />}
    </div>
  );
}

/** Numbered links for the [n] markers in a message: where a claim came from, so the learner can check it (P9). */
export function SourceList({ sources }: { sources: Source[] }) {
  return (
    <ol aria-label="Sources" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
      {sources.map((s, i) => (
        <li key={s.url}>
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline decoration-border underline-offset-2 hover:text-text">
            [{i + 1}] {s.title}
            {s.title !== hostOf(s.url) && <span className="ml-1 opacity-70">· {hostOf(s.url)}</span>}
          </a>
        </li>
      ))}
    </ol>
  );
}


/** A quiet system line (e.g. "Environment was reset", rate-limit messages). */
export function Notice({ text }: { text: string }) {
  return (
    <p role="status" className="rounded-2xl bg-surface-2 px-4 py-2.5 text-sm text-muted">
      {text}
    </p>
  );
}

export function MilestoneDivider({ label }: { label: string }) {
  return (
    <div role="separator" aria-label={`Milestone: ${label}`} className="flex items-center gap-3 py-2">
      <span className="h-px flex-1 bg-border" />
      <span className="rounded-full bg-surface px-3 py-1 text-xs font-bold tracking-wide text-muted shadow-soft">
        <span aria-hidden="true" className="text-primary">◆ </span>
        {label}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
