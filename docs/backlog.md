# Feature backlog (untriaged)

Ideas parked for Dinakar to review, refine, and prioritize later. Nothing here is scheduled.
Each item: what it is, why it might matter, open questions.

## Upload your own data (CSV)
- **What:** let learners attach their own file so Claude works on their real data, not only the churn demo.
  - Option 1: an optional "Add a file" in the intent step. The session's first turn starts automatically, so the file must be in the sandbox before it.
  - Option 2: a paperclip on the chat input (like Claude.ai), to add files at any time.
  - Possibly both.
- **Why:** professionals arrive with their own work. Today a non-demo session can only use text pasted into chat (≤ 4,000 characters) or data Claude makes up.
- **Open questions:**
  - File types and size cap.
  - Privacy: files are stored in Anthropic's Files API.
  - Messy data.
  - Cost.
  - Moment quality on untested data.
  - Whether it's worth it given "depth over breadth" and that reviewers will mostly use the demo.
- Dropped from the overnight run 2 plan (early Oct 18) by Dinakar.

## Explicit topic learning
- **What:** "teach me about X" sessions, where the goal is to learn a subject rather than do a task.
- **Why:** partly covered already, since Claude's "work" becomes explaining. A full version would bring back structured sections and bosses from `alternative-projects/learning-quest/`.
- **Open question:** a different product mode; how does it coexist with Co-learn?

## Cross-device resume
- **What:** continue your progress in another browser (resume code or accounts).
- **Open question:** resume codes are effectively bearer tokens, a security trade-off; accounts add sign-up friction for reviewers.

## Model-agnostic providers
- **What:** run the work loop on other model providers via `lib/claude/models.ts`.
- **Why it's low priority:** little value for the demo.

## Replayed-run fallback
- **What:** replay a recorded session if the live API or sandbox is unavailable.

## Local mode (bridge to the user's own Claude Code)
- **What:** use the learner's own Claude Code session as the work engine.
- **Open question:** a hosted server can't reach a laptop, so this needs a local bridge.

## Tune guardrail defaults from usage data
- **What:** pick default pacing from real answer/skip/defer data.
- **Open question:** needs real users first.

## More themes and sound packs
- **What:** more cosmetic unlocks.
- **Why it's low priority:** cosmetic only.

## Relax the boss nudge for a real launch
- **What:** once 3 concepts are practised, the turn context currently tells Claude to call `milestone_reached` at the next checkpoint, so a boss reliably appears within a 10-minute demo.
- **Why it's here:** Dinakar (2026-10-18): fine for the demo, but for a production launch milestones and bosses should follow the work more naturally. Relax or remove the nudge, and tune boss frequency from usage data (`/insights`: offered/declined/skipped rates).
