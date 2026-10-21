# Transcripts

Complete Claude Code transcripts for this take-home (a required submission item).

- `YYYY-MM-DD-<session>.md`: readable renderings of each main session (prompts, replies, tool calls; thinking omitted, tool output truncated).
- `ALL-SESSIONS.md`: every readable session in one file, oldest first.
- `raw/`: the complete original JSONL logs, including every subagent (research agents and parallel build tracks).
  Kept out of git until final submission because they're large and regenerated each session.

Regenerate at the end of every session (overwrites): `python3 scripts/collect_transcripts.py`.
Known secret patterns (Anthropic keys, Upstash tokens, Redis URLs) are redacted automatically.
