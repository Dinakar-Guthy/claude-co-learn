# CLAUDE.md — project context for Claude Code

## What this is
Dinakar's take-home for the **Full Stack Engineer, Education Labs** role at Anthropic.
Build a deployed prototype (using the Claude API) that enhances human learning and agency,
plus a written design rationale and a ≤8-minute video. Full brief: `docs/assignment-brief.md`.

Official deadline: **Oct 21, 2026, 9:00 AM PT**. Personal target: Oct 20. Expected effort: < 1 day; depth over breadth.

## Working agreements (important)
- **Dinakar owns the design decisions.** The evaluators assess *his* judgment in guiding Claude,
  not Claude's raw output. When a design choice comes up, present options with trade-offs and a
  recommendation — don't silently decide. Ask for his reasoning when it isn't stated.
- **Log decisions.** When Dinakar makes a meaningful design/technical decision, append it to
  `docs/decision-log.md` (date, decision, alternatives considered, his rationale).
- **Never commit secrets.** API keys live in `.env` (gitignored). Use `.env.example` for placeholders.
- Only commit/push when asked.
- Prefer simple and thoughtful over complex. Pick one specific user journey and go deep.

## Direction (2026-10-17)
Option B: **Co-learn**, a Claude mode where users do real work with Claude and get short, game-like learning moments
triggered by their work. Demo: a working professional training an ML model. See `docs/product-vision.md`.

## Key docs
- `docs/design-principles.md` — Dinakar's design principles (don't change without proposing first)
- `docs/product-vision.md` — Co-learn experience, learning moments, pacing engine
- `docs/context-persistence.md` — storage and model-context plan
- `reference/research/` — research reports; `reference/ascii-characters.md` — character art
- `alternative-projects/` — archived ideas, not part of the submission

## Repo layout
See `README.md`.
