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
PROJECTS = Path.home() / ".claude" / "projects"
OUT = REPO / "transcripts"


def slug(path: Path) -> str:
    """Claude Code's transcript folder name for a working directory."""
    return re.sub(r"[^A-Za-z0-9]", "-", str(path))


# Claude Code files transcripts by working-directory path, and this repo has lived in several places
# (~/Documents/coding/anthropic_take_home, the same folder inside iCloud Drive, ~/code/claude-co-learn).
# Collect from every folder for any of them, plus wherever the repo is now.
FOLDER_NAMES = ("anthropic-take-home", "claude-co-learn")


def sources() -> list[Path]:
    found = {d for d in PROJECTS.iterdir() if d.is_dir() and d.name.endswith(FOLDER_NAMES)} if PROJECTS.exists() else set()
    current = PROJECTS / slug(REPO)
    if current.exists():
        found.add(current)
    return sorted(found)

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
    srcs = sources()
    if not srcs:
        raise SystemExit(f"No transcripts found under {PROJECTS}")
    raw_dir = OUT / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for src in srcs:
        for path in sorted(src.rglob("*.jsonl")):
            rel = path.relative_to(src)
            dest = raw_dir / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(redact(path.read_text(errors="replace")))
            count += 1
            if len(rel.parts) == 1:  # main session: also render markdown
                ts, md = render(path)
                (OUT / f"{(ts[:10] or 'undated')}-{path.stem[:8]}.md").write_text(md)
        for meta in src.rglob("*.meta.json"):
            dest = raw_dir / meta.relative_to(src)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(meta, dest)
    print(f"Collected {count} transcript files from {len(srcs)} folder(s) into {OUT.relative_to(REPO)}/")
    for src in srcs:
        print(f"  {src.name}")


if __name__ == "__main__":
    main()
