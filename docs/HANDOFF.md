# Handoff: start here in a fresh session

Last updated: 2026-10-17 ~22:30 ET, end of the planning + parallel-build session (exported to `transcripts/`).
**Goal of the next session: P2 integration.** Turn the merged building blocks into the working end-to-end app,
deploy it, and verify the demo journey on the live site. Then a morning report for Dinakar.

## 1. Where things stand
- **Deadline:** Oct 21, 9:00 AM PT. **Target:** everything done by end of Sun Oct 18; Oct 19–21 are buffer.
- **Repo:** https://github.com/Dinakar-Guthy/anthropic-take-home-10-17-26 (private), branch `main`. Every push auto-deploys.
- **Live:** https://anthropic-take-home-10-17-26.vercel.app. Reviewer gate password: env `SITE_PASSWORD` (also in `web/.env.local`; never write it into the repo).
  `/api/health` (public) currently reports `store: redis`, key present, demo file present.
- **Merged (358 tests passing; typecheck, lint, and build clean):**

  | Piece | Location |
  |---|---|
  | P0 skeleton + contracts | `web/lib/contracts/*`: the source of truth for all shapes |
  | Track A: work loop | `app/api/chat`, `lib/claude/work/*`, `lib/client/{chatStream,transcript}.ts`, `scripts/smoke-work.ts` |
  | Track B: pacing engine | `lib/engine/*`: `engine` object + `recordSkipped`, `recordBossStarted`, `recordBossFinished`, `scoreFor` |
  | Track C: UI kit | `components/*`, `app/dev` (showcase of every component/state), `app/themes.css`, `lib/themes.ts`, `lib/sound.ts` (synth sound packs), `lib/ui/*` |
  | Track D: content + learning routes | `lib/claude/content/*`, `lib/learning/*`, `app/api/{session,session/[id],moment/grade,boss,story,wrapup}`, `data/churn.csv`, `scripts/generate_churn.py`, `scripts/upload-demo-file.ts` |
  | Track E: platform | `lib/store/{redis,index}.ts`, `lib/platform/{limits,cost,ratelimit,http,settings,files}.ts`, `app/api/{user,sessions,files/[id],health}` |
  | Reviewer gate | `proxy.ts`, `lib/platform/access.ts`, `app/access/*`, `app/api/access` |

- **What does NOT exist yet:** the real pages. `app/page.tsx` is only the `/co-learn` unlock box. There's no intent screen
  wiring, no workspace page, no wrap-up page. **Nothing has been tested live against the Claude API end to end** (Track A
  ran mocked only; Track D made ~12 live content calls that looked good).

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
10. `node --env-file=.env.local scripts/smoke-work.ts --upload` should confirm:
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
- **Definition of done for P2:** the demo journey works on the live URL end to end; all tests, lint, typecheck, and build pass; this file is updated with a **Morning report** (what works, what doesn't, what needs Dinakar, suggested next steps).
