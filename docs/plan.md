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
- [x] **Novice primer** (Dinakar overruled skipping it, 2026-10-18 review; built and verified on production the same day).

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

## Next work session
- [x] **Novice primer** (decision log 2026-10-18), verified on production:
  - Appears during the first turn; the warm-up gives +5 XP.
  - "Skip" persists across reloads.
  - The work model is told which basics it covered.

## Learn mode + sources build (decided 2026-10-18 evening; decisions in docs/decision-log.md)
Order: Phase 1 helps both modes (and the Co-learn hero), so it goes first. Each phase ends green (typecheck, test, lint, build), deployed, and checked live in a test-mode tab.

### Phase 1: sources and "Learn more" (both modes) — done 2026-10-19, verified live
- [x] Web search in the work loop: `web_search_20250305` (direct; it can sit next to the code sandbox), at most 2 searches per response. Prompt: cite authoritative sources (official docs, textbooks, reputable references) when teaching or stating facts the learner may rely on; don't search for what the code output already shows.
- [x] Citations: capture `citations_delta` into assistant text items (url, title); render small numbered source links under the message. Search results are kept unchanged in history (required by the API).
- [x] "Learn more" at wrap-up: a separate Sonnet call with web search (no structured output; citations and structured outputs don't mix) returns 3-5 readings (title, site, one line on why) for the session's concepts. Only URLs that came back from a search are kept, so there are no made-up links. Saved with the session (shown again on reload).
- [x] Spend: search count recorded on the existing spend-cap path ($10 per 1,000).

### Phase 2: Learn mode core
- [ ] `mode` on the intent and session (`co-learn` | `learn`; missing = `co-learn`), from `lib/modes.ts` (story on for Learn). `/learn` unlock phrase; mode switch on the intent screen ("What do you want to learn?"); "▶ Try a sample: the fall of the Roman Republic".
- [ ] Tutor prompt: ~120 words of teaching, then a question, every chunk; question types reworded for topics (Take a position / What happened next? / Spot the myth / Explain it back / Fill the gap); no code sandbox; web search on.
- [ ] The path: the tutor calls `set_learning_path` in its first response (3 parts for 10 min, 4 for 20, 5-6 for 30); `milestone_reached` marks the current part done. Turn context shows the path and the current part.
- [ ] Predict questions are graded right away. Bosses are offered at the end of a part when the existing rule allows (≥3 concepts since the last one). Story chapters on.
- [ ] Mode-aware wording: boss, help, grading, wrap-up suggestions, summarizing (compaction), primer off in Learn mode, mode badge in the top bar, `sessionMode` on events.

### Phase 3: path card
- [ ] Path card at the top: parts with done / now / next; pick what's next or move parts up/down (saved; the tutor is told next turn); collapses to one line while reading.

### Phase 4: polish and checks
- [ ] Sources on question cards (concept cards) and "Teach me the idea first" lessons, if time allows.
- [ ] Live runs of both modes; docs (HANDOFF §0, testing guide, README).

## Remaining for Dinakar (before the Oct 21, 9:00 AM PT deadline)
- [ ] **Manual testing:** follow HANDOFF §8 "Manual testing guide" (Chrome, Safari, phone, sound on), and iterate on what you find.
- [ ] **Written design rationale** (`docs/design-rationale.md`, in your voice). The scaffold has headers, questions, and raw material. Run `/rationale-coach` in Claude Code for a guided, section-by-section session.
- [ ] **Video (≤ 8 min screenshare walkthrough):** required by the brief. Claude can write a timed script and shot list, and pre-stage demo sessions.
- [ ] **Transcripts (required, complete):** run `python3 scripts/collect_transcripts.py` at the very end, un-ignore `transcripts/raw/`, and commit.
- [x] Repo renamed to `claude-co-learn` (2026-10-18). [ ] **Repo access:** decided to make it public (2026-10-18). History secret scan done and clean (2026-10-18); re-scan the transcripts right before flipping visibility, after they're committed.
- [ ] **Reviewer access info:** include the prototype URL and the site password in the submission.
- [ ] **Budget:**
  - Check the Anthropic Console spend limit on the key covers the review period.
  - Daily caps in the app: $5 per browser, $25 per IP, $75 global.
- [ ] **Clear the test data** (Dinakar, 2026-10-18). Auto mode blocks the bulk delete, so run it yourself from the repo root:
  `! cd web && node --env-file=.env.local scripts/e2e/keys.mjs --delete "events:,mastery:,session:,user:,usage:"`
  Done by Dinakar (2026-10-18).
  **Test traffic from now on:** open any page with `?test=1` (e.g. `https://anthropic-take-home-10-17-26.vercel.app/?test=1`). That tab, and only that tab, tags its activity as test traffic ("Test traffic (this tab)" badge); `/insights` leaves it out unless you toggle "Include test traffic". Normal tabs count as real usage. `?test=0` or closing the tab ends it.
- [ ] **Submit via Greenhouse:** repo link, prototype link, transcripts, video, written doc.
