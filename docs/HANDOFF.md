# Handoff: start here in a fresh session

Last updated: 2026-10-18 overnight, end of the P2 integration session. **Start with §7 Morning report.**
**Next: P3 (Dinakar's playthrough, pending decisions, prompt polish) and P4 (rationale, video, transcripts).**
§3 below is the P2 checklist as it was planned (now done; kept for reference).

## 1. Where things stand
- **Deadline:** Oct 21, 9:00 AM PT. **Target:** everything done by end of Sun Oct 18; Oct 19–21 are buffer.
- **Repo:** https://github.com/Dinakar-Guthy/anthropic-take-home-10-17-26 (private), branch `main`. Every push auto-deploys.
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

### Testing tools (not committed)
- `/tmp/e2e/drive.mjs`: a tiny Chrome DevTools driver (`login` reads `SITE_PASSWORD` from `.env.local` without printing it; `type`, `click`, `idle`, `text`, `shot`).
- `/tmp/e2e/tools/{events,spend}.mjs`: read app events and spend from Upstash.
- Rebuild these if `/tmp` is wiped; they're about 100 lines.

### Follow-ups (morning of 2026-10-18)
- Dinakar: the reviewer password is intentionally light security; no rotation needed.
- **Added "Start over as a new user":**
  - Where: Settings → Your data → Reset my data, plus a quiet link on the "Welcome back" screen.
  - `POST /api/user/reset` gives this browser a fresh anonymous identity (level 1, no sessions, Frost theme).
  - The old identity's data isn't deleted; it ages out with the 60-day TTL.
