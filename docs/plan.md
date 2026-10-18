# Plan

Official deadline: Oct 21, 9:00 AM PT. **Target: complete by end of Sun Oct 18.** Phases are defined in `docs/design-plan.md` §16.

## Sat Oct 17
- [x] Repo + tooling setup
- [x] Choose option (B: Co-learn); target user (working professional); journey (training a churn model)
- [x] Research, principles, product vision, detailed design plan
- [x] Design plan sign-off
- [x] Vercel account + CLI login; API key, Upstash, SITE_PASSWORD, DEMO_FILE_ID in Vercel env
- [x] P0 skeleton + contracts, first deploy (+ reviewer password gate)
- [x] P1 parallel tracks A–E built and merged (358 tests)
- [x] P2 integration (overnight session; see the Morning report in docs/HANDOFF.md)

## Sun Oct 18
- [x] Review and merge P1 tracks
- [x] P2 integration → deployed to production; demo journey verified on the live URL (3 full runs + 1 SQL run)
- [ ] P3 tuning + bug bash; 2 pm cut-line checkpoint (started overnight: prompt tuning from live runs; Dinakar to review pending decisions + test in Chrome/Safari/mobile)
- [ ] P4 rationale doc (Dinakar's voice), video ≤ 8 min, transcripts export
- [ ] Submit (or Monday morning after a fresh-eyes check)

## Mon Oct 19 – Wed Oct 21 9:00 AM PT
- Buffer only

## Overnight run 2, early Oct 18 (approved by Dinakar; decisions in docs/decision-log.md, 2026-10-18)
Rules: small commits pushed to `main`, all checks green; live API budget well under $10; verify each tier on production
with the browser driver before moving on; new judgment calls marked "pending Dinakar's review".

### Tier 1: critical (build, unit-test, verify live)
- [x] **Help tools on every question card**
  - **Card layout:**
    - "Give me a hint" (up to 2, Haiku) joins the quieter right-hand actions: Show options, Skip, Quiz me later. That group gets a lighter visual treatment.
    - "Help me learn this" opens a panel with "Teach me" (a short lesson with a similar worked example; then the learner answers the original question) and "Ask Claude…" (a small thread; Sonnet, low effort).
  - **Reveal rules:**
    - Help never reveals the answer before an attempt.
    - "Just tell me" is declined once per question; the second ask reveals the answer and closes the question as revealed (no credit, concept goes to review).
    - The Ask box stays open after answering.
    - After Skip, the card shows "See the answer".
  - **Where help applies:**
    - Bosses get hints only.
    - The wrap-up quiz gets all three.
    - The work model is told when help was used.
  - **Guard:** prompt rules plus adversarial leak tests.
- [x] **Credit after help:**

  | How the learner got there | Mastery | XP |
  |---|---|---|
  | Correct after hints | 0.8 | 8 |
  | Correct after teach/chat | 0.6 | 5 |
  | Partial after help | 0.4 | 3 |
  | Help then options | 0.5 | 4 |

- [x] **Boss exits:**
  - An opt-in card before generation ("Take it on / Keep working"), re-offered at every later milestone.
  - "Skip this boss" during a fight (no XP for the skipped part, no chapter, concepts to review, work resumes).
- [x] **Saved-for-later questions:**
  - Self-contained question wording.
  - A "See where this came up" link in the wrap-up.
  - Saved predict questions become "explain what happened" questions, graded against the session.
- [x] **Gaps:**
  - History compaction (rolling summary when long).
  - Reporting an answered question takes back its XP and mastery.
  - The boss-start reload edge case.

### Tier 2: future items pulled in (after Tier 1 is verified live)
- [x] **Boss challenges on/off** setting (Settings, next to guardrails)
- [x] **Spaced review across sessions:** concepts due for review are fed into the next session's context, so Claude can resurface them naturally (shown as "Review next time" in the Codex and the wrap-up)
- [x] **Codex across sessions:** a Codex view (from the top bar/settings) listing every concept learned, its mastery, and when it was last practised
- [x] **Measuring success:**
  - A "Did you learn something?" thumbs prompt at wrap-up.
  - A gated `/insights` page summarizing events: answer/skip/defer/help rates, accuracy vs the ~80% target band, boss outcomes, sessions completed.
- [x] **Hard delete** option on reset (actually remove the old identity's data)
- [~] **Novice primer:** not built (decision log: Teach me covers it). for "New to this", a 60-second intro card at the start of the session (only if Teach me doesn't already cover it well)

### Not planned (reasons; also listed in docs/backlog.md for triage)
- Upload your own CSV: moved to `docs/backlog.md` (Dinakar, 2026-10-18)
- Explicit topic learning (a different product mode; too large for one night)
- Cross-device resume (needs accounts or a resume code, which has security trade-offs; worth a design conversation first)
- Model-agnostic providers (low value for the demo)
- Replayed-run fallback
- Local Claude Code bridge
- Tuning guardrail defaults (needs real usage data)
- More themes and sound packs (low value)

### Morning report
- What works and what doesn't, what needs Dinakar, and next steps.
- A **manual testing guide**: step-by-step scripts to exercise every feature, including the new ones, with what to expect at each step.
