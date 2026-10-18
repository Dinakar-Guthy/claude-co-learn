"use client";

import { useId, useState } from "react";
import { Spinner, focusRing } from "./ui";

const PREVIEW_LINES = 12;

export interface CodeRunBlockProps {
  sessionId: string;
  language: "bash" | "python" | "file";
  code: string;
  stdout?: string;
  stderr?: string;
  returnCode?: number;
  fileIds?: string[];
  /** True between code_start and code_result. */
  running?: boolean;
}

const LANG_LABEL = { python: "Python", bash: "a command", file: "a file edit" } as const;

function lineCount(s: string) {
  return s ? s.replace(/\n$/, "").split("\n").length : 0;
}

/** Collapsed "▸ Ran Python · N lines"; output and charts stay visible below. */
export function CodeRunBlock({ sessionId, language, code, stdout = "", stderr = "", returnCode, fileIds = [], running = false }: CodeRunBlockProps) {
  const [open, setOpen] = useState(false);
  const codeId = useId();
  const lines = lineCount(code);
  const verb = running ? "Running" : "Ran";
  const hasOutput = Boolean(stdout || stderr);

  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={codeId}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 rounded-full px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-text ${focusRing}`}
      >
        <span aria-hidden="true" className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
        <span>
          {verb} {LANG_LABEL[language]} · {lines} {lines === 1 ? "line" : "lines"}
        </span>
        {running && <Spinner label="Code is running" />}
      </button>

      {open && (
        <pre id={codeId} className="overflow-x-auto rounded-xl border border-border bg-surface p-3 font-mono text-sm leading-relaxed">
          <code>{code}</code>
        </pre>
      )}

      {hasOutput && (
        <div className="space-y-1">
          {stdout && <OutputBox text={stdout} label="Output" />}
          {stderr && <OutputBox text={stderr} label="Messages" />}
        </div>
      )}
      {returnCode !== undefined && returnCode !== 0 && (
        <p className="text-xs text-muted">The code stopped early (exit code {returnCode}). Claude will take a look.</p>
      )}

      {fileIds.length > 0 && (
        <div className="grid gap-3">
          {fileIds.map((id, i) => (
            <FileImage key={id} src={`/api/files/${encodeURIComponent(id)}?sessionId=${encodeURIComponent(sessionId)}`} index={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function OutputBox({ text, label }: { text: string; label: string }) {
  const [expanded, setExpanded] = useState(false);
  const all = text.replace(/\n$/, "").split("\n");
  const truncated = !expanded && all.length > PREVIEW_LINES;
  const shown = truncated ? all.slice(0, PREVIEW_LINES).join("\n") : all.join("\n");
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <p className="sr-only">{label}</p>
      <pre className="overflow-x-auto font-mono text-sm leading-relaxed whitespace-pre-wrap text-muted">{shown}</pre>
      {all.length > PREVIEW_LINES && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className={`mt-1 rounded text-xs font-semibold text-text underline underline-offset-2 ${focusRing}`}
        >
          {expanded ? "Show less" : `Show more (${all.length - PREVIEW_LINES} more lines)`}
        </button>
      )}
    </div>
  );
}

function FileImage({ src, index }: { src: string; index: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="text-sm text-muted">Chart {index} couldn&apos;t be loaded.</p>;
  return (
    // Charts come from our authenticated file proxy, so next/image optimization doesn't apply.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`Chart ${index} produced by the code above`}
      loading="lazy"
      onError={() => setFailed(true)}
      // onError can fire before hydration; catch images that already failed.
      ref={(el) => { if (el?.complete && el.naturalWidth === 0) setFailed(true); }}
      className="w-full rounded-xl border border-border bg-surface"
    />
  );
}
