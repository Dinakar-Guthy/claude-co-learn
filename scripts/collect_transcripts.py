#!/usr/bin/env python3
"""
Collect every Claude Code transcript for this project into transcripts/ for submission.

- transcripts/raw/<session>.jsonl            complete, unmodified-except-redaction session logs
- transcripts/raw/<session>/subagents/*.jsonl subagent transcripts (research agents, build tracks)
- transcripts/<date>-<session8>.md            readable rendering (prompts, replies, tool calls; thinking omitted)

Re-run at the end of every session (it overwrites). Secrets matching known key patterns are redacted.
Usage: python3 scripts/collect_transcripts.py
"""
import json
import re
import shutil
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = Path.home() / ".claude" / "projects" / ("-" + str(REPO).strip("/").replace("/", "-").replace("_", "-"))
OUT = REPO / "transcripts"

SECRET_PATTERNS = [
    (re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,}"), "sk-ant-<REDACTED>"),
    (re.compile(r"(KV_REST_API_(?:READ_ONLY_)?TOKEN=)[A-Za-z0-9_\-]{20,}"), r"\1<REDACTED>"),
    (re.compile(r"(rediss?://)[^@\s\"']+@"), r"\1<REDACTED>@"),
]


def redact(text: str) -> str:
    for pattern, repl in SECRET_PATTERNS:
        text = pattern.sub(repl, text)
    return text


def block_text(content) -> str:
    if isinstance(content, str):
        return content
    parts = []
    for b in content or []:
        if not isinstance(b, dict):
            continue
        t = b.get("type")
        if t == "text":
            parts.append(b.get("text", ""))
        elif t == "tool_use":
            inp = b.get("input", {})
            desc = inp.get("description") or inp.get("prompt", "")[:200] or inp.get("command", "")[:200] or inp.get("file_path", "")
            parts.append(f"> 🔧 **{b.get('name')}**: {str(desc).strip()[:300]}")
        elif t == "tool_result":
            c = b.get("content")
            text = c if isinstance(c, str) else " ".join(x.get("text", "") for x in (c or []) if isinstance(x, dict))
            text = text.strip()
            if text:
                parts.append("> ↳ " + (text[:600] + (" …" if len(text) > 600 else "")).replace("\n", "\n> "))
    return "\n\n".join(p for p in parts if p)


def render(jsonl: Path) -> tuple[str, str]:
    lines, first_ts = [], ""
    for raw in jsonl.read_text(errors="replace").splitlines():
        try:
            d = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if d.get("type") not in ("user", "assistant"):
            continue
        first_ts = first_ts or d.get("timestamp", "")
        text = block_text(d.get("message", {}).get("content"))
        if not text.strip():
            continue
        who = "🧑 **User**" if d["type"] == "user" and not text.startswith("> ↳") else ("🤖 **Claude**" if d["type"] == "assistant" else "")
        lines.append(f"{who}\n\n{text}" if who else text)
    title = f"# Claude Code session {jsonl.stem}\n\nStarted {first_ts or 'unknown'}. Rendered from the raw JSONL in `transcripts/raw/` (thinking omitted; tool output truncated).\n"
    return first_ts, redact(title + "\n\n---\n\n".join(lines))


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"No transcripts found at {SRC}")
    raw_dir = OUT / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for path in sorted(SRC.rglob("*.jsonl")):
        rel = path.relative_to(SRC)
        dest = raw_dir / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(redact(path.read_text(errors="replace")))
        count += 1
        if len(rel.parts) == 1:  # main session: also render markdown
            ts, md = render(path)
            (OUT / f"{(ts[:10] or 'undated')}-{path.stem[:8]}.md").write_text(md)
    for meta in SRC.rglob("*.meta.json"):
        dest = raw_dir / meta.relative_to(SRC)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(meta, dest)
    print(f"Collected {count} transcript files into {OUT.relative_to(REPO)}/")


if __name__ == "__main__":
    main()
