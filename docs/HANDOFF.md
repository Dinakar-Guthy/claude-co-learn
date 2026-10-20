# Handoff: start here in a fresh session

Last updated: 2026-10-18 afternoon. **Start with §0 Current status** (the most recent). §8 and §7 are the overnight reports, with the manual testing guide in §8.
**Next: P3 (Dinakar's playthrough, pending decisions, prompt polish) and P4 (rationale, video, transcripts).**
§3 below is the P2 checklist as it was planned (now done; kept for reference).

## 0. Current status (2026-10-19, latest)
**Next session, in order** (details below and in `docs/plan.md`):
1. Dinakar's manual testing with **`docs/testing-guide.md`** (tiers 1-3); fix what he reports.
2. Open items done 2026-10-19: Learn stories built from the topic; Learn lessons prefer strong sources; citation markers renumbered to match the sources shown (live bug). Each Learn lesson now shows as soon as it's written (live: path 7s, first lesson 14s instead of ~25s, question 24s).
3. `/rationale-coach` for `docs/design-rationale.md`, then the video script, shot list, and pre-staged demo sessions (test-mode tabs).
4. Pre-submission: make the repo public (history scan was clean; re-scan transcripts after collecting), collect transcripts, final health check, Greenhouse text.
- Known API behavior: on Sonnet 5.5, text written between two tool calls comes back as a hidden thinking block. Learn lessons go through the `teach` tool for that reason; Co-learn explanations written between two code runs may be hidden too (final answers show).

- **The prototype is feature-complete for the submission** and deployed:
  - https://anthropic-take-home-10-17-26.vercel.app
  - Repo: https://github.com/Dinakar-Guthy/claude-co-learn (private; renamed from `anthropic-take-home-10-17-26`; Vercel still deploys from it).
  - 500+ tests; typecheck, lint, and build clean.
- **Built since the §8 report:**
  - **Novice primer**, for "New to this".
  - **Test traffic is tagged per request:** open any page with `?test=1` and that tab (only) tags its events; `/insights` excludes them unless "Include test traffic" is on.
  - **Production data cleared** by Dinakar (2026-10-18).
  - **Compaction status line:** while a long history is summarized (several seconds), the status reads "Tidying up my notes so far… (a few extra seconds)". Verified locally with a lowered threshold (~13s summary). Background compaction and a recap card are in `docs/backlog.md`.
  - **Repo:** decided to make it public at submission time; history secret scan is clean (2026-10-18).
  - **Sources and "Learn more" (both modes):** Claude web-searches before explaining a concept and its cited sentences get [n] markers with source links; wrap-up ends with "Learn more" (3-5 real readings from a search, saved with the session). Verified live: a cited answer with 3 sources; 4 readings (arXiv, scikit-learn docs), all links load.
  - **Learn mode (`/learn`)** — built and verified live with the Roman Republic sample: the tutor plans a 3-part path (path card at the top, reorderable), teaches ~120-word cited lessons through a `teach` tool (Sonnet 5.5 hides text written between tool calls, so lessons can't be plain text there), asks a question after each (Take a position / What happened next? / Spot the myth…, predictions graded right away), offers a boss at part ends (questions built from the lessons), story chapters on, wrap-up suggestions as "Teach me…" topics, and "Learn more" readings. First question ~35s after start.
  - **Questions land at the real fork:** after an answer, Claude runs the settled steps and any work that doesn't depend on the next decision before asking again (verified live: drop column → encode → split → then "which metric?"). Parallel-moment ideas B–E are in `docs/backlog.md`.
  - **Placeholder milestones ignored:** Claude sometimes called `milestone_reached` with label "x" next to a question (a stray "◆ x" divider); those are no longer shown.
  - **Story removed from Co-learn** (Dinakar, after playtesting): no story bible, boss chapters or final chapter; boss wins give bonus XP and confetti, and the work resumes right away. Switched off per mode in `lib/modes.ts` for the future Learn mode; P2 updated.
  - **Repo** renamed.
- **Decisions:** all reviewed with Dinakar on 2026-10-18 (the "primer details as built" entry was accepted later that day). See `docs/decision-log.md`.
- **Remaining work for Dinakar:** the checklist in `docs/plan.md` → "Remaining for Dinakar":
  1. manual testing and iteration
  2. the written rationale (run `/rationale-coach`)
  3. the video (≤ 8 min)
  4. transcripts
  5. repo access for reviewers
  6. the reviewer password in the submission
  7. a budget check
  8. submit
- **Deadline:** Oct 21, 9:00 AM PT.
- **Backlog** (after submission): `docs/backlog.md`, including **Learn mode** (decided access: `/learn` as a second entry phrase plus a mode switch on the intent screen at launch; "Study this" from the Codex later).
- **Live-check tools** (now in the repo, `web/scripts/e2e/`):
  - **`chrome.sh` + `drive.mjs`:** a headless-Chrome driver. `login <origin>` turns on per-tab test mode.
  - **`events.mjs`, `spend.mjs`, `context.mjs`, `keys.mjs`:** read Upstash telemetry, spend, a session's context, and keys. Run with `node --env-file=web/.env.local …`.
  - **`help-probe.mjs`:** a live leak probe for the help prompts.
  - **`keys.mjs --delete`:** bulk deletes; Dinakar runs those himself.

## 1. Where things stand
- **Deadline:** Oct 21, 9:00 AM PT. **Target:** everything done by end of Sun Oct 18; Oct 19–21 are buffer.
- **Repo:** https://github.com/Dinakar-Guthy/claude-co-learn (private), branch `main`. Every push auto-deploys.
- **Live:** https://anthropic-take-home-10-17-26.vercel.app. Reviewer gate password: env `SITE_PASSWORD` (also in `web/.env.local`; never write it into the repo).
  `/api/health` (public) currently reports `store: redis`, key present, demo file present.
- **Merged (380 tests passing as of P2; typecheck, lint, and build clean):**

  | Piece | Location |
  |---|---|
  | P0 skeleton + contracts | `web/lib/contracts/*`: the source of truth for all shapes |
  | Track A: work loop | `app/api/chat`, `lib/claude/work/*`, `lib/client/{chatStream,transcript}.ts`, `scripts/smoke-work.ts` |
  | Track B: pacing engine | `lib/engine/*`: `engine` object + `recordSkipped`, `recordBossStarted`, `recordBossFinished`, `scoreFor` |
  | Track C: UI kit | `components/*`, `app/dev` (showcase of every component/state), `app/themes.css`, `lib/themes.ts`, `lib/sound.ts` (synth sound packs), `lib/ui/*` |
  | Track D: content + learning routes | `lib/claude/content/*`, `lib/learning/*`, `app/api/{session,session/[id],moment/grade,boss,story,wrapup}`, `data/churn.csv`, `scripts/generate_churn.py`, `scripts/upload-demo-file.ts` |
  | Track E: platform | `lib/store/{redis,index}.ts`, `lib/platform/{limits,cost,ratelimit,http,settings,files}.ts`, `app/api/{user,sessions,files/[id],health}` |
  | Reviewer gate | `proxy.ts`, `lib/platform/access.ts`, `app/access/*`, `app/api/access` |

- **P2 integration is done (2026-10-18, overnight session):** the real pages exist and the demo journey works on the live URL.
  See **§7 Morning report** at the end of this file.

## 2. Read before coding
`CLAUDE.md` (auto-loaded) → this file → `docs/design-plan.md` (blueprint; §2 demo journey, §5 work loop, §6 moments,
§7 engine, §13 UI) → `web/README.md` + `web/AGENTS.md` (Next.js 16 is different: read `node_modules/next/dist/docs/`)
→ `web/lib/contracts/*`. Background only if needed: `docs/product-vision.md`, `docs/design-principles.md`, `docs/decision-log.md`.

## 3. P2 integration checklist
### Pages and flow (client)
1. **`/`** unlock (exists) → on success, `GET /api/sessions`:
   - If there are sessions: "Continue <title>" or "Start something new".
   - Otherwise: `IntentFlow` → `POST /api/session` → `router.push('/s/<id>')`.
2. **`/s/[id]` workspace:**
   - **Load:** `GET /api/session/[id]` (SessionView) and `GET /api/user` (UserView). Wrap in `UiProviders` (theme + sound from user settings).
   - **Layout:** `TopBar` (title, level/XP, `endsAt` timer, mute, gear), a transcript list mapping each `TranscriptItem.kind` to its component (user → `UserMessage`, assistant_text → `AssistantMessage`, code_run → `CodeRunBlock`, moment → `MomentCard`, prediction_reveal → `PredictionReveal`, milestone → `MilestoneDivider`, boss → `BossCard`, story → `StoryChapterCard`, notice → `Notice`), and `ChatInput`.
   - **Demo kickoff:** for a demo session with an empty transcript, auto-send the intent goal as the first message.
   - **Sending:** `streamChat({kind:'message'})` + `applyEvent` to fold events into the transcript; moment views come from `moment` events. Disable input while streaming (there's no server lock).
   - **`turn_end` reasons:**

     | Reason | Do |
     |---|---|
     | `awaiting_learner` | Wait for the MomentCard answer |
     | `boss_due` | `POST /api/boss` (takes ~24s: show "A boss approaches…" with Pip/ASCII), render `BossCard` |
     | `max_steps` | Show a "Continue" affordance → `streamChat({kind:'continue'})` |
     | `error` / `refusal` | Friendly notice + retry |

   - **Moment actions:** `momentHandlers` → `POST /api/moment/grade` → update the moment view.
     - XP: `TopBar` `xpGain`, plus `LevelUpToast` on `levelUp`.
     - If `continueWith` is present, immediately `streamChat(continueWith)`.
     - Boss: follow `boss.nextMomentId`. When `done`, poll `GET /api/story?sessionId&trigger=boss:<id>` (~1.5s interval, about 20s max) for the chapter, then `streamChat({kind:'boss_result'})`.
   - **Wrap-up:**
     - At `endsAt`, a gentle "Wrap up / Keep going" prompt (never forced).
     - `POST /api/wrapup` → `WrapUp` component; deferred moments are graded via the grade route (no `continueWith`).
     - Suggestions start a new session.
   - **Settings:** `SettingsDrawer` → `PATCH /api/user` → re-apply the theme/sound. Past sessions → navigate.
3. **Theme flash:** set `data-theme` server-side from user settings (or an inline head script) so Frost doesn't flash.

### Server consolidation (small)
4. **Limits warning:** `checkLimits` can return `{ok:true, warning}` (fail-open policy).
   - Chat route: emit a `notice` event.
   - JSON routes: add `warning` to the body (or an `X-Colearn-Warning` header).
   - Client: a dismissible banner.
5. **Engine helpers instead of inline state edits:** `recordSkipped` (Track A's skip-while-pending in `lib/claude/work/userText.ts`/`prepare.ts`; Track D's skip/defer/report in `lib/learning/grade.ts`), `recordBossStarted`/`recordBossFinished` (Track D boss code), `scoreFor`.
6. **Error helpers:** Track D's `errorResponse` and Track E's `routeErrorResponse`/`limitResponse` overlap. Unify on one (keep `unstable_rethrow` first).
7. **Contract tweak (approved):** `ApiMessages` → `Anthropic.Beta.BetaMessageParam[]` (remove Track A's casts).
8. **`package.json`:** `"typecheck": "next typegen && tsc --noEmit"` (fresh checkouts need generated `LayoutProps`).
9. **`/dev`:** keep it (it's behind the gate) but add `robots` noindex; optional.

### Live verification (needs `web/.env.local` filled, or test on the deployed site)
10. `node --experimental-transform-types --env-file=.env.local scripts/smoke-work.ts --upload` should confirm:
    - `code_execution_20260521` works on the **beta** endpoint with only the `server-side-fallback-2026-07-01` header;
    - container reuse across turns;
    - a learning moment gets proposed;
    - consecutive user messages after a moment's `tool_result` are accepted;
    - the container-expiry retry path (if observable).
11. Run the full demo journey (design-plan §2) on the deployed site, using an access cookie from `POST /api/access` with `{"password": $SITE_PASSWORD}` (read from `web/.env.local`) for curl.
    Check: real churn output, ≥ 1 predict / decide / spot moment, grading + MC fallback, a boss, a story chapter, wrap-up, level-up.
12. Tune prompts (`lib/claude/work/prompt.ts`, `lib/claude/content/*`) for moment quality: honest value scores, no self-answering, small questions.

## 4. Known gaps (from track reports)
- Reporting an already-answered moment doesn't revoke XP/mastery.
- A deferred *predict* moment answered at wrap-up is graded against the ideal answer (no real run).
- `max_steps` on `pause_turn`, then a new `message` (not `continue`), may leave a dangling tool call. Handle it by auto-sending `continue` first.
- Verification failure → moment skipped (fail closed by design).
- Frost primary/success/error text on `primary-soft` is under 4.5:1. Keep colored text on white surfaces.
- Track C's engine stand-in era: pickers should pass the user's `level` to `isUnlocked`.

## 5. Environment
- `web/.env.local` (gitignored) needs `ANTHROPIC_API_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` (`SITE_PASSWORD` is already set).
  Vercel marks these sensitive, so `vercel env pull` returns `[SENSITIVE]` placeholders. They must be pasted by hand. Never print them.
- Vercel env (Production + Preview): `ANTHROPIC_API_KEY`, Upstash `KV_*`, `SITE_PASSWORD`, `DEMO_FILE_ID=file_011sXmXa8xPyMUpzmefpD5FP`.
- **Commands** (in `web/`):

  | Command | Does |
  |---|---|
  | `npm run dev` | Local dev |
  | `npm test` | Tests |
  | `npm run typecheck` / `npm run lint` / `npm run build` | Checks |
  | `vercel ls anthropic-take-home-10-17-26 --prod` | Deploy status |

## 6. Working agreements (unchanged)
- Dinakar owns design decisions. Log meaningful ones in `docs/decision-log.md`. Don't change `docs/design-principles.md` without proposing.
- Commit in small steps with clear messages and push to `main` (auto-deploys). End commit messages with the Co-Authored-By line.
- Never commit or print secrets.
- Keep `docs/plan.md` checkboxes current.
- **Transcripts:** at the end of every session, run `python3 scripts/collect_transcripts.py` (collects all sessions + subagents from `~/.claude/projects/`). At final submission, remove `transcripts/raw/` from `.gitignore` and commit it.
- **Definition of done for P2:** the demo journey works on the live URL end to end; all tests, lint, typecheck, and build pass; this file is updated with a **Morning report** (what works, what doesn't, what needs Dinakar, suggested next steps).

## 7. Morning report (P2 integration, overnight 2026-10-17 → 18)

**Bottom line:** the Definition of done is met. The full demo journey works end to end on
https://anthropic-take-home-10-17-26.vercel.app:
`/co-learn` → intent → real code on the churn CSV → moments → boss → story chapter → level-up → wrap-up.
- **Checks:** 380 tests pass; typecheck, lint, and build are clean. Everything is pushed to `main` and deployed.
- **Spend:** about $1.20 of API usage overnight (≈ $0.20–0.30 per 10-minute demo session).

### What I verified on production (headless Chrome, driven step by step)
Three full demo runs and one non-ML run (a SQL query), each in a fresh session:
- **Unlock, home, and new sessions:**
  - Unlock chime, then "Welcome back" with past sessions (Continue/Revisit, with dates) or the intent flow.
  - A new session auto-starts work on the goal.
  - `?start=1` (from wrap-up) skips the ritual.
- **Work loop:**
  - Real code execution on the uploaded CSV, with the container reused across turns.
  - Charts render inline through `/api/files` (a confusion matrix).
- **Moments seen and graded:**
  - spot_issue (leak), predict (baseline accuracy, then a Prediction check graded against the real run), and decide (metric choice; threshold).
  - Free-form grading with correct, partial, and incorrect verdicts.
  - Incorrect → "Try it with options" (MC) → feedback.
  - Show options, Skip, and Quiz me later (the deferred question is answered in the wrap-up quiz).
- **Boss:**
  - Generated from the session's concepts, with HP, a hit animation, and feedback kept on screen until "Next question →".
  - Outcomes: flawless (confetti), victory, and retreat (gentle copy; concepts go to review).
  - Story chapter polling, then Claude continues the work.
- **Rewards and settings:**
  - Level-up toast (auto-dismisses after 12s) with "Try it" for the Sunset theme; the theme persists, with no flash on reload.
  - Settings drawer: guardrails toggle and mode persist via PATCH; past sessions are listed.
- **Wrap-up:**
  - The time's-up prompt (Wrap up / Keep going) appears at `endsAt`.
  - Wrap-up shows the Codex, XP, the final chapter, and suggestions that start a new prefilled session.
  - Reloading a wrapped session works.
- **Non-ML (SQL):** a decide moment ("which order statuses count as revenue?"), then a query built on that choice.
- **Mobile width (390px):** layout checked from a screenshot.

### What I built or changed
- **Pages:**
  - `app/HomeFlow.tsx` (unlock → welcome back / intent), `app/s/[id]/{page,Workspace,useWorkspace}.tsx` (the workspace).
  - `lib/client/api.ts` (JSON helper, `X-Colearn-Warning` banner), `lib/client/workspace.ts` (pure view updates, unit-tested).
  - `components/LimitsBanner.tsx`, and `lib/ui/themeBoot.ts` (an inline head script plus localStorage, so there's no Frost flash).
- **Server consolidation** (a parallel worktree agent, merged): HANDOFF items 4–9.
  - Limits warning as a chat `notice` event plus the `X-Colearn-Warning` header.
  - Engine helpers used everywhere.
  - One error module, `lib/platform/http.ts`.
  - `ApiMessages` changed to the beta message type.
  - `typecheck` now runs `next typegen` first.
  - `/dev` marked noindex.
- **Critical live bug fixed:**
  - **Symptom:** Claude sometimes issues a server tool call (e.g. `text_editor_code_execution`) in the same response as `learning_moment`. The API doesn't run it, and the stored history then made **every later turn fail with a 400**.
  - **Fix:** history is now sanitized: result-less server tool calls are dropped and existing sessions self-repair. This also closes the "max_steps then new message" gap.
- **Prompt tuning from the live runs:**
  - **Work prompt:**
    - Don't spoil moments: show the evidence, not the conclusion.
    - The learner stays the decision-maker: decide before consequential choices, and back-to-back moments are fine at real forks.
    - Call the moment and milestone tools on their own.
    - MC options of similar length.
  - **Turn context:** a nudge to call `milestone_reached` once 3 concepts are practised (without it, no boss appeared in 10 minutes).
  - **Grader:**
    - A miss that leads into the MC retry gets a *hint*, not the answer.
    - A partial answer always states the missing idea.
  - **Wrap-up suggestions:** no duplicated "Next time you could…".
- **Small fixes:**
  - Node strip-types can't run some modules, so the smoke script now needs `--experimental-transform-types`.
  - `DEMO_FILE_ID` added to the local `.env.local` (not a secret).
  - Double punctuation in the screen-reader announcement.

### Needs Dinakar
1. **Review the decisions marked "pending Dinakar's review"** in `docs/decision-log.md` (8 entries, 2026-10-18):
   - auto-starting the goal
   - chat locked during a boss
   - "Next question" instead of auto-advance
   - inline wrap-up
   - skipping the ritual on "new session"
   - hint-not-answer before MC
   - the boss nudge
   - predict card stays "locked in"
2. **Play it yourself in Chrome and Safari, with sound on** (headless testing can't check audio or real-device feel). Then on a phone.
3. **Contract tweak I made:** `ContentApi.gradeAnswer` takes an optional `retryAvailable` flag (backward compatible).
4. Decide whether you want `/dev` reachable in the submitted build (it's behind the password gate and noindex).

### Known gaps and rough edges (not blocking)
- **Moment quality varies from run to run.**
  - Two of three demo runs got the ideal spot → predict → decide sequence. One went straight from the deferred leak question to training without a decide moment; the latest prompt fixed this in the next run.
  - Claude sometimes shows strong evidence right before a spot-the-issue question (e.g. "91% vs 1%"), which makes it easy. That's arguably fine for a first exposure.
- **A deferred question in the wrap-up quiz** can say "the table above", which no longer makes sense there.
- **Container-expiry retry** wasn't observed live; it's covered by unit tests only.
- **Earlier known gaps still open:**
  - Reporting an already-answered moment doesn't revoke XP.
  - A deferred *predict* is graded against the ideal answer, not a real run.
- **Boss timing after a reload:** if the page is reloaded exactly between `boss_due` and `POST /api/boss`, the boss doesn't start until the next milestone.
- **Hidden previous page:** Next keeps the previous page (home) mounted but hidden after navigation (Activity); harmless.

### Suggested next steps
1. Your own playthrough (Chrome, Safari, mobile), and react to the pending decisions.
2. P3: one or two more prompt-tuning passes for moment quality (watch for spoilers and decide moments before training).
   Optionally make deferred questions self-contained (have the wrap-up rephrase them, or tell Claude in the moment schema that questions may be shown later).
3. P4: rationale doc in your voice, the ≤ 8-minute video (the journey above is the script), and transcripts (`python3 scripts/collect_transcripts.py`).

### Housekeeping note
- **Possible iCloud duplicates:** the repo lives in `~/Documents`, which looks iCloud-synced. Files named `… 2` keep appearing (`web/.next/… 2.ts`, `.git/index 2`).
  - They're harmless so far: build output gets regenerated, and git ignores `index 2`.
  - Consider moving the repo out of iCloud-synced folders, or excluding it, so a sync conflict can't corrupt `.git` before submission.

### Testing tools
- Now committed in `web/scripts/e2e/` (see §0).
- `drive.mjs`: a tiny Chrome DevTools driver (`login` reads `SITE_PASSWORD` from `.env.local` without printing it; `type`, `click`, `idle`, `text`, `shot`).
- `events.mjs`, `spend.mjs`: read app events and spend from Upstash.

### Follow-ups (morning of 2026-10-18)
- Dinakar: the reviewer password is intentionally light security; no rotation needed.
- **Added "Start over as a new user":**
  - Where: Settings → Your data → Reset my data, plus a quiet link on the "Welcome back" screen.
  - `POST /api/user/reset` gives this browser a fresh anonymous identity (level 1, no sessions, Frost theme).
  - The old identity's data isn't deleted; it ages out with the 60-day TTL.

## 8. Morning report (overnight run 2, early Oct 18)

**Bottom line:** everything in the approved overnight plan (`docs/plan.md`, "Overnight run 2") is built, tested, deployed, and verified on the live site. The novice primer was added afterwards, at Dinakar's request, and verified on production. Two notes:
- **Remaining work for Dinakar:** see `docs/plan.md` → "Remaining for Dinakar".
- **Spaced review across sessions:** checked live locally (shared Redis) rather than on production, because it needs a 10-minute gap between sessions.

| Check | Status |
|---|---|
| Tests | 493 pass |
| Typecheck, lint, build | Clean |
| `main` | Deployed |
| Live API spend | $1.76 tracked for Oct 18 (UTC, both nights), plus about $0.40 from probe scripts. Tonight's share is about $1.25; well under $10 |

### What's new (and verified live)
1. **Help tools on every question card.**
   - "Give me a hint" (up to 2) sits with the quieter right-hand actions (Show options, Skip, Quiz me later), which got a lighter look. Submit stays the one strong button.
   - "Help me learn this" opens a panel:
     - "Teach me the idea first" gives a ~150-word lesson with a worked example on a different scenario.
     - "Ask Claude…" is a small thread.
   - "Ask Claude why" stays available after answering.
   - Bosses get hints only.
   - The wrap-up quiz gets everything.
   - **Leak test:** I probed three real question shapes live ("just tell me", "is it B?", "what would you pick?", "what does this term mean?"). Hints and lessons teach without giving the answer. The first "just tell me" gets a kind nudge; the second reveals the answer and closes the question ("Got it. This one will come back for a quick review later.").
2. **Less credit after help**, per your table:
   - hint 0.8 / 8 XP
   - teach or chat 0.6 / 5
   - partial with help 0.4 / 3
   - help then options 0.5 / 4
   - Verified live: +8 after a hint, +5 after asking Claude, +12 for a boss hit after a hint (80% of 15).
   - Predictions follow the same rules.
   - A revealed question gets no XP and a score of 0, so it goes to review.
3. **Boss exits.**
   - **Opt-in card:** at a milestone, "A boss approaches! Take it on / Keep working" appears before anything is generated. "Keep working", or just typing, resumes the work. The offer comes back at the next milestone, survives a page reload, and is verified live.
   - **"Skip this boss"** during a fight closes the remaining questions. Answers already given keep their XP; the skipped part earns nothing; there's no story chapter. Work resumes immediately.
   - **Settings → Boss challenges** on/off toggle.
4. **Saved-for-later questions.**
   - Claude now writes self-contained questions (they include the numbers they rely on).
   - Wrap-up quiz cards have "See where this came up ↑", which scrolls to and highlights the original spot.
   - A saved predict question comes back as "Earlier you were asked to predict … what actually happened, and why?" and is graded against the session log. Verified live.
5. **Remaining gaps closed.**
   - **History compaction:** the API's on-demand compaction. Verified live with a lowered threshold: "15 messages summarized, 8 kept", and the following turns worked.
   - **Report revokes credit:** reporting a graded question takes back its XP, without ever dropping a level, plus its mastery change.
   - **Boss reload edge case:** fixed by the persistent offer.
6. **Codex** (book icon in the top bar → `/codex`).
   - Every concept across sessions, grouped Mastered / Growing / Review next time, with a strength bar and when it was last practised.
   - "Review next time" only appears when the last attempt went less than well, so a newcomer's right answers show as "Growing".
7. **Spaced review across sessions.** Up to 3 concepts due for review go into the next session's context. Claude may bring one back when the work naturally touches it, marked as review, not first exposure.
8. **Measuring success: `/insights`** (Settings → "How Co-learn is doing").
   - Shows: answer, skip, defer and reveal rates; help usage; mean accuracy against your P5 target bands; boss offered, declined, skipped and outcomes; pacing-gate decisions; wrap-up thumbs; small-sample delayed retention; daily totals.
   - It's anonymous (no ids, no free text).
   - Current numbers show questions landing *above* the bands (too easy). My test answers inflate that, but it's worth watching.
9. **Wrap-up "Did you learn something?" 👍 / 👎**, recorded for /insights.
10. **"Reset my data" now actually deletes** the old profile, mastery and sessions, then starts a fresh identity.
11. **Fixes from live testing:**
    - **Stale pages after navigation:** Next keeps visited pages mounted, so "Start a new session" showed a stale half-filled intent form. Fixed by keying the pages on `bfcacheId`.
    - **Time's-up prompt** overlapped the boss offer.
    - **Option numbering:** help replies referred to options by number.
    - **Stray `}`** at the end of some help replies.
    - **Duplicate moment calls:** Claude often proposed a duplicate low-value moment alongside the real one. The prompt now says one call per response.
    - **Decide before training:** continuations now remind Claude to ask a decide moment before consequential choices. The next production run asked "which metric?" before training.

### Needs Dinakar
1. **Review the "pending Dinakar's review" entries** dated 2026-10-18 in `docs/decision-log.md` (about 18 now: last night's plus tonight's).
   - **Rationales to confirm in your own words:**
     - "Help reduces XP and mastery credit"
     - "Reveal only after an attempt"
   - **The biggest calls I made tonight:**
     - Compaction uses the server feature on Sonnet, not a Haiku summary.
     - A revealed question counts as a miss for mastery.
     - What counts as "Review next time".
     - Reset hard-deletes.
     - Insights is linked from Settings.
2. **Play through the testing guide below**, especially with sound on, in Safari, and on a phone.
3. **Optional:** `docs/backlog.md` is the new untriaged backlog (CSV upload and the other parked ideas).

### Known rough edges
- **Option lengths:** multiple-choice correct options are still sometimes the longest, despite the prompt rule. Worth a stronger fix later, e.g. having the verifier check it.
- **Moment quality still varies run to run:** Claude sometimes skips a decide moment. The latest prompt helped on production.
- **Spaced review:** verified live locally across two sessions. A revealed concept showed as "review" after the 10-minute gap; the next session's context listed it as due; Claude asked about it again as a review (no concept card); a correct answer moved it to "Growing". Not yet seen across a real day's gap (stale *mastered* concepts).
- **Insights "first exposure"** is approximate within the selected window (the page says so).
- **Compaction latency:** a compacting turn takes longer (a synchronous Sonnet call); there's no UI notice for it yet.

### Manual testing guide
> **Superseded by `docs/testing-guide.md` (2026-10-19)**, which covers everything below plus the newer features, in priority tiers with checkboxes. Kept for history.

Use https://anthropic-take-home-10-17-26.vercel.app/?test=1 with the site password. `?test=1` tags that tab's traffic as test ("Test traffic (this tab)" badge), so it stays out of `/insights`; open each new tab with it.

**Start as a brand-new user:**
- **Path:** Settings (gear) → Your data → Reset my data → Yes, reset.
- **Or:** on the "Welcome back" screen, use "Start over as a new user".
- **Expect:** the intent screen; level 1 and Frost theme on the next session; empty Codex.

**A. Entry and intent**
1. Go to `/` and type `/co-learn` (with sound on, you hear an unlock chime).
   - **Expect:** "What are you working on?", or "Welcome back!" with past sessions and dates if you have any.
2. Click "▶ Try the demo", pick a familiarity and time, then "Let's go".
   - **Expect:** the workspace opens and Claude starts loading the CSV right away.

**A2. Novice primer** (pick "New to this" on the intent screen)
1. Within about 20s, while Claude starts, a "60-second primer" card appears at the top: 3-4 key ideas plus a warm-up question.
2. Answer the warm-up.
   - **Expect:** the best answer highlighted, a why, and +5 XP.
3. Click "Skip" (or "Done") and reload.
   - **Expect:** it stays hidden.
4. With "Some experience" or "Comfortable":
   - **Expect:** no primer.

**B. Help tools (on the first question, usually spot the issue / target leakage)**
1. Click "Give me a hint", then "Another hint".
   - **Expect:** two 💡 hints that point the way without giving the answer. The hint button disappears after two.
2. Click "Help me learn this", then "Teach me the idea first".
   - **Expect:** a short lesson with a worked example on a different scenario, ending with an invitation to try.
3. In "Ask Claude…", ask "what does leakage mean?".
   - **Expect:** an explanation, not the answer.
4. Ask "just tell me the answer".
   - **Expect:** a kind nudge to guess first.
5. Ask again.
   - **Expect:** the answer, an "The answer" box, "Got it. This one will come back for a quick review later.", and the work continues.
6. **Alternative:** answer after a hint.
   - **Expect:** +8 XP. After Teach me or Ask: +5 XP.
7. On a later question: "Skip".
   - **Expect:** a "See the answer" link on the skipped line.
8. On any answered question: "Ask Claude why".
   - **Expect:** Claude explains the answer openly.

**C. Answers and feedback**
1. Answer a question wrongly on purpose.
   - **Expect:** "Not quite", a hint-style why (not the answer), then "Try it with options".
2. Pick an option.
   - **Expect:** your pick and the best answer highlighted, plus the full why.
3. Predict question: answer it.
   - **Expect:** "Locked in!", then a Prediction check card graded against the real code output.

**D. Boss exits** (after about 3 concepts, at a milestone)
1. **Expect:** "A boss approaches!" with "Take it on" and "Keep working". The time's-up prompt never shows at the same time.
2. Click "Keep working".
   - **Expect:** the work continues. At the next milestone the offer comes back. Reloading the page while it's showing keeps it.
3. Click "Take it on".
   - **Expect:** "A boss approaches…" (~25s), then the boss card with HP and "Question 1 of N".
   - Hints are available; "Help me learn this" is not.
4. Answer one question.
   - **Expect:** feedback stays until "Next question →".
5. Click "Skip this boss".
   - **Expect:** "You let … go. It'll be back another time." and Claude resumes right away.
   - **Or:** win it for bonus XP (confetti if flawless). The work resumes right away (no story chapter in Co-learn).
6. Settings → "Offer boss challenges" off.
   - **Expect:** no more offers.

**E. Saved for later and wrap-up**
1. On a predict question, click "Quiz me later".
   - **Expect:** "Saved a question … for your wrap-up quiz", and Claude carries on.
2. Click "Wrap up session" (or wait for the time's-up prompt → "Wrap up").
   - **Expect:**
     - The quick quiz, where the saved predict question is now "what actually happened, and why?".
     - "See where this came up ↑" scrolls to and highlights the original spot.
     - The Codex card, XP summary, and suggestions (no story chapter).
     - "Did you learn something?" 👍 / 👎.
3. Click a suggestion.
   - **Expect:** a fresh intent screen prefilled with that goal (no stale form).

**F. Rewards, settings, Codex, insights**
1. **Level-up:** with about 100 XP total, the "Level 2!" toast with "Try it" (Sunset theme). It auto-dismisses after 12s. Reload: no Frost flash.
2. **Settings (gear):**
   - sound and volume
   - guardrails (Light / Balanced / Strict)
   - boss toggle
   - theme and sound pack pickers (locked ones show "Reach level N")
   - past sessions
   - "How Co-learn is doing" → `/insights`
3. **Codex:** the book icon → `/codex`. Expect concepts grouped by status; "Back to your session".
4. **Insights:** `/insights` with the 1 / 7 / 30-day selector.

**H. Learn mode**
1. Type `/learn` on the home page (or switch to "Learn a topic" on the intent screen).
   - **Expect:** "What do you want to learn?" and "▶ Try a sample: the fall of the Roman Republic".
2. Start the sample (10 min).
   - **Expect:** within ~35s, a "Your path · Part 1 of 3" card, a short lesson with [n] source links, then a question card.
3. Open the path card: parts not started yet have Next / ↑ / ↓.
4. Answer a few questions.
   - **Expect:** a "What happened next?" question graded right away; at the end of a part the path moves on and Claude starts the next part; a boss offer ("Keep learning") once ~3 concepts are practised; a story chapter after the boss.
5. Wrap up.
   - **Expect:** Codex, final story chapter, "Learn more" readings, and "Teach me…" suggestions that start a new Learn session.

**Sources (both modes):** ask Claude a conceptual question (e.g. "why does class_weight='balanced' distort probabilities?").
- **Expect:** "Looking up sources…", then an answer with [n] markers and numbered links underneath. At wrap-up, "Learn more" lists 3-5 real readings.

**G. A non-demo task**
- Example: "Help me write a SQL query for our top 10 customers by revenue last quarter."
- **Expect:** a decide moment (e.g. which order statuses count as revenue), then a query built on your choice.

### Testing tools
These live in `web/scripts/e2e/` (committed):
- `drive.mjs` (Chrome DevTools driver)
- `events.mjs`, `spend.mjs` (Upstash telemetry and spend)
- `help-probe.mjs` (live leak probe for the help prompts)

`COLEARN_COMPACT_AT_TOKENS=6000 npm run dev` forces early compaction locally.
