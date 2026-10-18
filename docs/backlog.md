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

## Learn mode (topic learning without a work task)
- **What:** a second mode on the same system for "teach me about X" (Dinakar's real use case: learning history).
  - **Reused unchanged (about 90%):** question cards, pacing engine, help tools, bosses, story, XP, Codex, and cross-session review.
  - **What changes:**
    1. Intent offers the mode.
    2. The background sketch plans a short **learning path** (4–6 chapters) instead of work milestones; the learner can pick or reorder chapters.
    3. A **tutor prompt** replaces the work prompt: teach about 120 words, then a question, every chunk. History mappings: *decide* → "choose where we go next" or "take a position"; *predict* → "what do you think happened next?"; *spot the issue* → "spot the myth or anachronism".
    4. No code sandbox; optionally web search with citations so facts are checkable (P9).
    5. Pacing by mode: a question after every chunk instead of only at rare high-value moments. Bosses become chapter tests.
  - **Later:** topics become ongoing courses ("continue my Roman history course"), with sequel suggestions (from `alternative-projects/learning-quest/`).
- **Today:** a learning goal partly works already, since Claude's "work" becomes explaining. But the work-first prompt favors long explanations with few questions, there's no path or progress, and the question types are worded for tasks.
- **How it's accessed** (decided by Dinakar 2026-10-18: options 1 + 2 at launch, 3 soon after):
  1. `/learn` as a second entry phrase next to `/co-learn` (`/co-learn` = do real work with Claude and learn along the way; `/learn` = study a topic with Claude as tutor). The caption names both.
  2. A mode switch on the intent screen, preselected by the phrase typed.
  3. A "Study this" button on Codex concepts that starts a `/learn` session on that concept (a bridge from work to deeper learning).
  - Possibly a `/learn?topic=…` link for sharing.
- **Effort:** about half a day to a day (prompt, intent, path UI). Very little touches the engine.
- **Suggested timing:** after the take-home submission, on a branch. Mention it in the rationale as evidence the design generalizes.

## Faster, friendlier history compaction
- **Today (built 2026-10-18):** when a long session's history passes ~40k tokens, the next turn first summarizes the older messages (several seconds). The status line says "Tidying up my notes so far… (a few extra seconds)" while it runs.
- **Option C: summarize in the background** after a turn ends (e.g. Next's `after()`), so no learner-facing turn is ever slower.
  - Open questions: a message sent mid-summary (lock, or discard the summary if the history changed); cost of summarizing sessions that never continue.
- **Option D: turn it into a recap card** ("Here's what we've built so far"), shown to the learner as a short reflection moment, possibly with a question about it.
  - Why: turns a technical step into retrieval practice (P3/P4). Open questions: pacing (it shouldn't interrupt flow), and whether the API summary is written for the learner or for Claude (probably needs its own learner-facing summary).
- Alternatives considered at the time: a one-off transcript note ("I summarized our earlier work"), rejected as an implementation detail that clutters the chat.

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
