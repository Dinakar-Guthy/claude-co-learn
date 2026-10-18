# Co-learn: detailed design plan (v1)

Drafted by Claude with Dinakar, 2026-10-17. This is the build blueprint. It implements the decisions in
`docs/product-vision.md`, `docs/design-principles.md`, `docs/context-persistence.md`, and `docs/decision-log.md`.
Items marked **(proposed)** are new design choices made in this plan and need Dinakar's sign-off (see §17).

---

## 1. What we're building

**Co-learn** is a mode for Claude where a working professional does real work with Claude and comes out more capable.
Claude collaborates on the task normally, including running real code. At high-value moments it pauses and turns the
work into a short challenge the user solves themselves. The user's answer then steers the work.

**The one user journey we optimize for (demo + video):** a professional who knows some Python but is new to ML trains a
churn-prediction model on a CSV with Claude, in about 10 minutes, and leaves understanding class imbalance, metric
choice, data leakage, and overfitting, because they made those calls themselves.

**Generality:** any task works (writing, SQL, analysis, planning). The churn demo is a one-click starter, not a constraint.

### Success criteria for the prototype
1. A reviewer can open the URL, type `/co-learn`, click "Try the demo", and finish a full session (moments → boss → wrap-up) in ~10 minutes with no setup.
2. Code runs for real: real metrics, real charts.
3. Learning moments feel *earned by the work*, not bolted on. The user's answers visibly change what Claude does.
4. Nothing feels punishing or cluttered.

---

## 2. Experience walkthrough (the demo journey)

| # | Screen / moment | What happens |
|---|---|---|
| 0 | **Unlock** | A centered input with `/co-learn` as placeholder; caption: "Type /co-learn to switch on Co-learn mode." Typing it plays an unlock chime and the box "opens". The server sets the anonymous ID cookie. |
| 1 | **Intent** | Pip (ASCII robot) asks: "What are you working on?" A free-text box plus one chip: **▶ Try the demo: train a churn model**. Then two quick chip questions: familiarity (*New to this / Some experience / Comfortable*) and time (*10 min* default / 20 / 30). |
| 2 | **Work starts immediately** | Claude loads the CSV in the sandbox and shows its shape and churn rate (~15%) as **real output**. The session sketch is generated in the background and doesn't block. |
| 3 | **Predict moment** | Before Claude trains anything: "If a model predicts *nobody* churns, what accuracy would it get?" User: "about 85%". ✓ Correct; chime; +10 XP; Pip happy. The why: "Accuracy rewards the majority class, so it can look great while missing every churner." |
| 4 | **Decide moment** | "Missing a churner costs more than a false alarm. Which metric should we optimize: accuracy, precision, recall, or F1?" User picks recall (or anything defensible). **Claude builds the pipeline around their choice.** If the choice is weak but safe (e.g., accuracy), Claude follows it and lets the real results show the consequence, then offers to switch: learning by consequence. |
| 5 | **Spot-the-issue moment** | Claude shows the feature list: "One of these columns would make the model look amazing but fail in production. Which, and why?" (The planted leak: `cancellation_request_date`.) Free-form answer; if the user misses it → multiple choice → feedback. |
| 6 | **Real training** | Claude trains (e.g., logistic regression vs. gradient boosting), shows real precision/recall and a confusion-matrix chart. |
| 7 | **Milestone → boss** | "First model trained" milestone. **Boss: The Overfit Bug** (ASCII + HP bar). 2–3 linked questions recombining the session's concepts, e.g., "Train recall 0.98, test recall 0.52. What's happening, and what's your first fix?" Each good answer hits the boss. Victory → jingle → **story chapter** unlocks. |
| 8 | **Wrap-up** (at ~10 min, offered, never forced) | Deferred-quiz items (if any) → **Codex** (concepts learned, with how you did) → XP total, **level-up** → unlock toast ("New theme: Sunset") → "Next time you could…" suggestions. |

---

## 3. Key design choices (and why)

1. **Learning moments are a tool Claude calls** **(proposed)**. Claude gets a `learning_moment` tool. When it sees a good
   opportunity *in the flow of the work*, it calls the tool instead of continuing. This is how "work first, inject learning"
   becomes concrete:
   - Claude, which understands the work, *proposes* moments.
   - Code (the pacing engine) *decides* whether to show them (P8).
   - The pause is structural: Claude can't answer its own question, because the turn stops until the learner responds (P7).
   - The same tool contract could be dropped into Claude.ai or Claude Code, which supports the scaling and adoption story (§15).
2. **Work turns stream; moments pause the stream.** If the engine rejects a candidate moment, the tool returns "skip" and Claude
   keeps working *within the same request* (no extra round trip). If it accepts, the turn ends and the moment card appears.
3. **Predict moments are graded against reality.** The answer comes from the code Claude actually runs next, so the
   "answer key" is the real output. This is trustworthy by construction (P9).
4. **Fast reward, then continuation.** Free-form answers are graded by a fast model (~1s) so feedback, XP, and sound arrive
   immediately. The work continuation streams in right behind it.
5. **Don't block on planning.** The session sketch (Opus, high effort) and story bible are generated in the background while
   the first work turn already runs. First impressions matter.
6. **Never punish.** No failure states. A boss you don't beat "retreats", and its concepts go to review. The story still
   continues, with a different beat.

---

## 4. Architecture

```
Browser (Next.js client)                         Vercel (Next.js route handlers, Node runtime)              External
┌──────────────────────────┐   HTTPS/stream    ┌───────────────────────────────────────────┐
│ Unlock · Intent ·        │ ───────────────▶  │ /api/unlock     anon cookie, profile       │
│ Workspace (chat stream,  │                   │ /api/session    create + background sketch │──▶ Anthropic API
│  MomentCard, BossCard,   │ ◀───────────────  │ /api/chat       work turn (streamText):    │    · Sonnet 5.5 (work)
│  PredictionReveal) ·     │   UI message      │    tools: code_execution (server-side),    │    · Opus 5.5 (sketch)
│ WrapUp · Settings drawer │   stream          │    learning_moment, resolve_prediction,    │    · Haiku 5.5 (grade,
│                          │                   │    milestone_reached                       │      verify, compact)
│ use-sound, Motion,       │                   │ /api/moment/grade  free-form grading       │    · code execution
│ canvas-confetti          │                   │ /api/boss       boss generation            │      sandbox + Files API
└──────────────────────────┘                   │ /api/story      chapter generation         │
                                               │ /api/wrapup     codex + suggestions        │──▶ Upstash Redis
                                               │ /api/files/[id] chart proxy (ownership chk)│    (state, rate limits,
                                               │ /api/user       profile, settings          │     spend caps, events)
                                               │ lib/engine/*    pacing engine (pure TS)    │
                                               └───────────────────────────────────────────┘
```

- **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind v4. **Native `@anthropic-ai/sdk`** for all Claude calls
  (changed from the Vercel AI SDK during P0, see decision log), with our own NDJSON stream protocol (`lib/contracts/stream.ts`). Upstash Redis + `@upstash/ratelimit`.
  `use-sound` (Howler), Motion (LazyMotion), canvas-confetti. Vitest for tests.
- **Runtime:** Node.js route handlers, `export const maxDuration = 300` on streaming routes (Vercel Hobby with Fluid compute allows 300s).
- **Source of truth:** the server (Redis) owns session state and message history. The client sends only the new message
  plus the session ID, and the server assembles context. This makes resume, compaction, and caps straightforward.

---

## 5. The work turn: how the loop actually runs

### 5.1 Tools available to the work model
| Tool | Kind | Purpose |
|---|---|---|
| `code_execution` | Anthropic server tool (`codeExecution_20260120` via AI SDK) | Run Python in the sandbox: load data, train, plot |
| `learning_moment` | Our function tool; `execute` runs the gate | Propose a learning moment (schema in §6) |
| `resolve_prediction` | Our function tool; `execute` records the result | After running code, reveal how the user's prediction compared to the real result |
| `milestone_reached` | Our function tool; `execute` checks whether a boss is due | Mark the end of a work chunk ("data explored", "first model trained") |

### 5.2 Sequence
```
user message ──▶ /api/chat
  1. rate-limit + spend-cap check
  2. load session, history, engine state, mastery → assemble context (§9)
  3. streamText(Sonnet 5.5, effort medium, tools, container id, stopWhen = awaitingLearner OR stepCount ≥ 8)
       ├─ Claude streams text, runs code (results stream to UI)
       ├─ Claude calls learning_moment(candidate)
       │     execute → engine.gate(candidate, state, settings)
       │        ├─ rejected  → returns {status:"skip", reason}  → Claude keeps working (same request)
       │        └─ accepted  → verify (Haiku, ~1s, §8) → returns {status:"awaiting_learner", momentId}
       │                         → stopWhen fires → stream ends → UI renders MomentCard
       ├─ Claude calls resolve_prediction(...) → UI renders PredictionReveal (+XP)
       └─ Claude calls milestone_reached(...) → engine: bossDue? → {boss_due:true} → stream ends → UI calls /api/boss
  4. onFinish: persist messages, container id, chart file ids, token usage (spend cap), events
```

### 5.3 After the learner answers
```
answer ──▶ /api/moment/grade (Haiku, structured) ──▶ UI: verdict + why + XP + sound + Pip reaction
                                                 └─▶ immediately POST /api/chat with a "moment response" message:
   "Learner response to moment m3 (decide · class imbalance): '<answer>'. Grade: correct. Why: …
    Continue the work, building on their choice."      (skip/defer: "Learner skipped; make the call yourself, briefly say why.")
```
Mastery and XP are updated server-side in the grade route, so the client is never trusted with XP.

### 5.4 Edge cases
- **`pause_turn`** (the sandbox hit its 10-step limit): the AI SDK reports it as a normal stop. Detect "ended right after a code
  result with no text" and auto-continue once. The prompt also asks Claude to keep code steps small.
- **Container expired or invalid:** retry without the container ID, re-attach the dataset, and tell Claude "The environment was
  reset; reload the data from /files."
- **Refusal** (`stop_reason: "refusal"`): show a friendly message and offer to rephrase.
- **Model error or timeout:** a retry button, and the message stays in the input.

---

## 6. Learning moments: the contract

### 6.1 `learning_moment` tool input (structured, strict)
```ts
{
  type: "decide" | "predict" | "explain_back" | "spot_issue" | "fill_gap",
  concept: string,              // short canonical name, e.g. "class imbalance" (used for mastery)
  concept_card?: string,        // ≤ 60 words; include on first exposure
  question: string,             // one clear question, answerable in 1–3 sentences
  ideal_answer: string,
  rubric: { key_points: string[]; acceptable_variants?: string[]; misconceptions?: string[] },
  mc_fallback: { options: string[] /* 3–4 */; correct_index: number; why: string[] /* one per option */ },
  difficulty: 1 | 2 | 3 | 4 | 5,
  first_exposure: boolean,
  learning_value: 1 | 2 | 3 | 4 | 5,
  value_reason: string,         // one line: why this matters for *this* user's goal
  costly_mistake: boolean,      // true if the user is about to make a choice with real consequences
  timing: "before_step" | "after_step"
}
```
- **Decide** moments may have several defensible answers. The rubric grades the *reasoning*, and `correct_index` marks the best option.
- **Predict** moments have `timing: "before_step"`. Their final grading comes from `resolve_prediction` after the real run.

### 6.2 Learning-value scale (in the system prompt)
| Score | Meaning |
|---|---|
| 5 | A real fork in *their* work, or a core concept they need for their goal right now |
| 4 | An important concept that's new to them and just came up |
| 3 | Useful but tangential |
| 2 | Trivia |
| 1 | Noise |

### 6.3 MomentCard states
`question` → (submit | **Show options** | **Skip** | **Quiz me later**) → `grading` (~1s) → `feedback`.
- **Feedback** shows a verdict chip ("Nice!" / "Partly" / "Not quite"), the why, an XP chip, and Pip's reaction.
- **Not quite / struggling** → "Try with options" (MC, graded in code) → feedback.
- **Partial** → feedback names what's missing (0.5 credit, no retry loop).
- Every card has a small "⚑ Report question" link (P9).

---

## 7. Pacing engine (pure TypeScript, unit-tested; `lib/engine/`)

### 7.1 Gate
```
gate(candidate, state, settings) → show | skip(reason) | defer
  if state.pendingMoment                                        → skip("one at a time")
  if candidate.learning_value < threshold(settings)
     and not breakthrough(candidate)                            → skip("low value")
  if isMastered(candidate.concept) and not reviewDue(concept)   → skip("mastered")
  if |candidate.difficulty − targetDifficulty(concept, type)| ≥ 2 → skip("off band")
  if settings.guardrails.enabled and capsExceeded(state, mode)
     and not breakthrough(candidate)                            → mode == strict ? defer : skip("cap")
  → show
breakthrough(c) = c.costly_mistake and c.learning_value == 5
```

### 7.2 Thresholds and guardrails (initial values, tuned via tests and play)
| Mode | Value threshold | Caps (soft) |
|---|---|---|
| **Off (default)** | ≥ 4 | none |
| Light | ≥ 4 | ≥ 1 work turn between moments |
| Balanced | ≥ 4 | ≤ 4 per 10 min; ≥ 2 turns between |
| Strict (fewest interruptions) | 5 only | ≤ 2 per 10 min; the rest deferred to the wrap-up quiz |

### 7.3 Mastery and difficulty (Elo-lite, P5)
- Per concept: θ (starts from familiarity: *new* 1.5, *some* 2.5, *comfortable* 3.5), attempt count n, lastSeen.
- P(correct) = σ(1.2·(θ − b)), where b is the question's difficulty (1–5).
- Update: θ += K·(score − p), with K = 0.6 while n < 3, then 0.3. Score: correct 1, partial 0.5, correct after MC 0.6, incorrect 0, skipped (no update).
- **Target success rate:** 0.87 for first exposure · 0.80 for practice · 0.72 for boss → target b = θ − logit(target)/1.2, clamped to 1–5.
- **Rolling adjustment:** over the last 5 graded moments, ≥ 90% correct → target b + 0.5 (ramp up gently); ≤ 60% → target b − 1 (back off fast).
- **Mastered:** n ≥ 2 and P(correct at b = 3) ≥ 0.8. **Review due** (P1, cross-session): mastered concept not seen for more than 1 day.
- The engine tells Claude the target difficulty and the mastered concepts *in advance* (dynamic context, §9), so most candidates already pass the gate. The gate is the backstop.

### 7.4 Bosses
- `milestone_reached` → boss due if: ≥ 3 distinct concepts have been practised since the last boss **and** no boss in the last 3 minutes **and** time remains.
- **Boss** = 2–3 linked questions with an HP bar. A hit for each correct answer (half a hit for partial).
- **Outcomes:** *flawless* / *victory* / *the bug retreats* (fewer than half the hits). All outcomes give XP and continue the story. Concepts from a retreat go to review.

### 7.5 Session clock
- At 80% of the session length, the engine tells Claude: "~2 minutes left: steer toward a milestone."
- At 100%, the UI offers **Wrap up** or **Keep going** (P7: never forced).

---

## 8. Trustworthy content (P9)
- **Verification** (accepted moments only, Haiku, ~1s): the verifier answers the question without seeing the key. Then it checks
  that the key and the MC `correct_index` agree, and flags ambiguity. If they disagree or it's ambiguous, the gate converts the
  decision to skip, so Claude simply keeps working.
- **Predict** moments are checked against real code output.
- **Report button** logs a `moment_reported` event and excludes that moment from XP and mastery.
- **Grader:** Haiku with the rubric + ideal answer + misconceptions. Structured output: `{verdict, why, missing_points[], misconception?}`.
  If testing shows mis-grades, switch grading to Sonnet (a config change).

---

## 9. Context assembly and models

### 9.1 What the work model sees each turn
| Block | Contents | Caching |
|---|---|---|
| System | Co-learn rules (work first; propose moments via the tool; value scale; never answer your own question; build on the learner's choices; learning by consequence; keep moments small), moment-type guidance, code-execution guidance (small steps, concise prints, save charts as PNG, reload data from files), style | Cached |
| Session | Intent (goal, familiarity, time), session sketch (milestones, concept radar) once ready | Cached once present |
| Dynamic | Elapsed/remaining time, guardrail mode, target difficulty, mastered concepts, concepts practised since the last boss, last 3 moment outcomes, rolling summary | Not cached |
| Messages | The last ~12 messages verbatim; older turns compacted when over ~40K tokens (implemented 2026-10-18 with the API's on-demand compaction on the work model, not Haiku: see decision log) | — |

### 9.2 Model routing
| Call | Model | Effort | Output |
|---|---|---|---|
| Session sketch (milestones, concept radar, novice flag) | Opus 5.5 | high | structured |
| Work turn | Sonnet 5.5 (Opus 5.5 fallback via config) | medium | stream + tools |
| Boss generation | Sonnet 5.5 | high | structured |
| Story bible + chapters | Sonnet 5.5 | medium | structured |
| Wrap-up (codex + suggestions) | Sonnet 5.5 | medium | structured |
| Moment verification, grading, hints | Haiku 5.5 | low/default | structured |
| "Teach me" and "Ask Claude" help (added 2026-10-18) | Sonnet 5.5 | low | structured |
| History compaction (2026-10-18) | the work model (Sonnet 5.5), on-demand compaction beta | medium | compaction block |

All model IDs and effort levels live in one config file (`lib/claude/models.ts`), which is also the seam for model-agnosticism (P1).
Exact `effort` and thinking parameter support per model is to be verified against the docs at build time.

### 9.3 Estimated cost per 10-minute demo session
| Item | Estimate |
|---|---|
| ~10 work turns on Sonnet (mostly cached input) | $0.25–0.50 |
| Opus sketch | ~$0.07 |
| Boss + story + wrap-up | ~$0.10 |
| Haiku calls | ~$0.01 |
| Sandbox time | Within the free 1,550 container-hours a month |
| **Total** | **≈ $0.40–0.70** |

---

## 10. Data model (Upstash Redis)

```ts
type User = { anonId; createdAt; xp; level; unlocks: { themes: string[]; soundPacks: string[] };
              settings: { sound: boolean; volume: number; theme: string;
                          guardrails: { enabled: boolean; mode: "light"|"balanced"|"strict" } } };
type Session = { id; anonId; createdAt; title; intent: { goal; familiarity; minutes; demo: boolean };
                 sketch?: SessionSketch; storyBible?: StoryBible; containerId?: string; fileIds: string[];
                 status: "active"|"wrapped"; engine: EngineState; rollingSummary?: string };
type EngineState = { pendingMomentId?; momentsShownAt: number[]; turnsSinceMoment: number;
                     conceptsSinceBoss: string[]; bosses: BossRecord[]; recentOutcomes: Outcome[] };
type Moment = { id; sessionId; candidate: LearningMomentInput; decision; shownAt?; answer?; usedMC?;
                verdict?; why?; xp?; skipped?; deferred?; reported? };
type ConceptMastery = { theta; n; lastSeen };          // hash per user: concept → mastery
```

| Key | Value | TTL |
|---|---|---|
| `user:{anonId}` | User | 60 days, sliding |
| `user:{anonId}:sessions` | list of session IDs | 60 days |
| `session:{id}` | Session | 60 days |
| `session:{id}:messages` | UI messages | 60 days |
| `session:{id}:moments` | Moment list | 60 days |
| `mastery:{anonId}` | hash | 60 days |
| `usage:{scope}:{yyyy-mm-dd}` | spend in micro-dollars, for scope = anon / IP / global | 2 days |
| `events:{yyyy-mm-dd}` | telemetry list | 60 days |

Anonymous ID: a random UUID in a **server-set HttpOnly cookie** (survives Safari's 7-day cleanup of script-set storage).

---

## 11. Abuse protection and spend caps
- **Rate limit** (`@upstash/ratelimit`, sliding window): 20 requests/min per anonymous ID and 60/min per IP.
- **Daily spend caps (proposed):** estimated from token usage × price table on every response.
  - **$5 per browser:** about 8 demo sessions.
  - **$25 per IP:** reviewers may share an office IP, so this is deliberately higher.
  - **$75 global per day:** circuit breaker.
  - Friendly message when hit.
- **Anthropic Console:** a monthly spend limit on the key (amount for Dinakar to choose) and, ideally, a dedicated workspace.
- **Input limits:** ≤ 4,000 characters per message, max_tokens per call, history window (§9).
- **Failure policy (decided by Dinakar):** if the limits machinery itself fails (counter unreadable, limiter down), requests **still go through**. The UI shows "usage limits aren't working as expected; please let the tool's owner know", and `/api/health` reports `limitsDegraded`.
- **Reviewer access gate (added 2026-10-17):** `proxy.ts` puts a site-wide password (env `SITE_PASSWORD`) in front of every page and API route. Pages redirect to `/access`; APIs return 401; only `/access`, `/api/access`, and `/api/health` are public. It fails closed in production if the password isn't set.
- The `/co-learn` "password" is framing only, not security; the reviewer gate is the real access control.

---

## 12. Rewards: XP, levels, sound, characters, story

| Event | XP |
|---|---|
| Correct | 10 |
| Partial | 5 |
| Correct after MC | 5 |
| Prediction within tolerance | 10 |
| Boss hit | 15 |
| Boss victory | +50 (flawless +25) |
| Session completed | 30 |

- **Levels** (permanent, user-level): thresholds 100 / 250 / 450 / 700 / 1,000 / … (+50 per step). A typical demo session earns ~150–200 XP, so **a reviewer levels up at least once**.
- **Level rewards:** L2 Sunset theme · L3 Marimba sound pack · L4 Forest · L5 Night Sky · L6 Retro sound pack · ….
- **Sound hierarchy** (Kenney CC0 via `use-sound`), quietest to loudest: click < correct < unlock/reveal < level-up < boss fanfare.
  - Wrong answers get a soft pluck.
  - Pitch varies ±6%, and rises a semitone per answer during a streak.
  - Sound is on at volume 0.4, with a mute toggle always visible in the top bar.
- **Characters:** Pip shows reactions on moment cards. Bosses come from `reference/ascii-characters.md` (The Bug, Slime, Ghost) with hit/defeated frames and a 2px shake.
- **Story:**
  - The story bible is generated in the background at session start: a surprise genre, lightly themed to the work.
  - A chapter of ~150–250 words is pre-generated when a boss starts and revealed on the outcome. Another chapter comes at wrap-up.
  - Variety comes from injected seeds (genre, narrator, twist card), because these models don't accept a temperature setting.

---

## 13. UI spec (Frost theme, Nunito, minimal)

- **Unlock:** a centered single input, Pip above it, caption below, nothing else.
- **Intent:** the same centered column. Chips reduce typing. "Try the demo" is the primary chip.
- **Workspace:**
  - **Top bar** (48px): wordmark + session title · thin XP bar with level badge · subtle timer · mute · gear.
  - **Chat column** (max-width 720px). Code runs render as a collapsed "▸ Ran Python · 14 lines", with output and charts shown inline.
  - **Moment and boss cards** appear *inline* in the stream (primary-soft background, rounded 20px), never as modals.
  - Input at the bottom.
- **Settings drawer** (gear):
  - Sound on/off + volume
  - Learning guardrails toggle → Light / Balanced / Strict
  - Theme picker (locked swatches with a padlock and a "Reach level N" hint)
  - Sound pack picker
  - Past sessions (continue)
  - Reset my data
- **Wrap-up:** a vertical sequence of cards. Celebration (confetti) **only** for level-up and boss victory.
- **Accessibility:**
  - Keyboard-first input
  - `aria-live` for feedback
  - `prefers-reduced-motion` respected
  - Never sound-only feedback
  - WCAG AA contrast (palette pre-checked)
- **Rendering safety:** markdown via react-markdown without raw HTML, and ASCII in `<pre>` as text.

---

## 14. Demo dataset (`web/scripts/generate_churn.py`, seeded)

**Size and balance:** 5,000 rows, ~15% churn.

**Columns:** `customer_id`, `tenure_months`, `contract_type` (month-to-month / one-year / two-year), `monthly_charges`,
`total_charges` (≈ tenure × monthly, with ~1% missing), `support_tickets_90d`, `payment_method`, `has_premium_support`,
`last_login_days_ago`, `plan_tier`, **`cancellation_request_date`** (planted leak: mostly filled for churners), `churned`.

**How churn is generated:** logistic in tenure, contract, tickets, and charges, plus noise.

**Teaching hooks this sets up:**
- Imbalance: accuracy is misleading.
- A leak to spot.
- Missing values to handle.
- Correlated features (total vs. monthly × tenure).

**Upload:** once, via the Files API, with the ID stored as `DEMO_FILE_ID`. It's attached as a container upload on the demo's first turn.

---

## 15. How this maps to the brief (feeds the rationale doc and video)

| Brief asks | Where it lives in the design |
|---|---|
| Enhances, not replaces, agency | `learning_moment` pauses the turn (Claude can't self-answer). Decide moments steer the work. Learning by consequence. Skip, defer, and guardrails are always available. |
| Learning principles | Retrieval practice (free recall first), immediate explanatory feedback, just-in-time learning, banded difficulty (~80%), interleaved boss reviews, spaced review (P1), productive failure via consequences |
| Measuring success | Events: moment shown / answered / skipped / deferred / reported, grade, MC used, boss outcome, session completed, guardrail changes, return visits. Metrics: answer rate, skip rate, accuracy-band adherence, task completion, **delayed retention** (accuracy on resurfaced concepts in later sessions), "Did you learn something?" thumbs at wrap-up. |
| Scale to millions | Stateless serverless routes; prompt caching; Haiku for cheap gates/grading; the pacing engine is deterministic code (no extra model cost); sandbox per session is Anthropic-managed; per-user state is small JSON |
| Sister-team adoption | The **`learning_moment` tool + pacing engine is a surface-agnostic contract**. Any Claude surface (Claude Code as a `/co-learn` mode or plugin; Claude.ai as a toggle) can adopt it by adding the tool and rendering the card. A shared mastery profile would follow users across surfaces. |

---

## 16. Build plan (revised 2026-10-17: **complete by end of Sun Oct 18**; Oct 19–21 AM are buffer)

The speed-up comes from parallelization: define the shared **contracts** first, then build independent tracks at the same
time in isolated git worktrees, then integrate. The riskiest piece (real code execution) stays on the critical path.

### Phases
| Phase | Work | Wall clock | Who |
|---|---|---|---|
| **P0: Skeleton + contracts** (serial) | Next.js in `web/`, Frost tokens, Nunito, shared types (`learning_moment` schema, engine types, store interface, API route signatures, UI message parts), Vercel project + env vars + Upstash, unlock screen, first deploy | ~1.5 h | Claude + Dinakar (Vercel/key setup) |
| **P1: Parallel tracks** (5 worktree agents) | **A: Work loop** (critical path): `/api/chat` + Sonnet + code execution + demo CSV + container reuse + chart proxy + `pause_turn`/expiry handling<br>**B: Engine**: gate, guardrails, Elo-lite mastery, difficulty, bosses rules, XP/levels, spend accounting, all **with unit tests**<br>**C: UI kit**: TopBar/XP bar, MomentCard, BossCard, PredictionReveal, WrapUp, Settings drawer, ASCII characters, sounds, themes; built against mock data on a `/dev` page<br>**D: Content routes + data**: dataset generator, grading, verification, boss, story, wrap-up, session sketch (prompts + structured schemas)<br>**E: Platform**: Redis store, anon cookie, rate limits + spend caps, `/api/user`, sessions/resume | ~3–4 h (can run **overnight**) | Agents, unattended |
| **P2: Integration** (serial) | Merge tracks; wire `learning_moment` → gate → card → grade → continuation; predict reveal; milestone → boss; intent → sketch; wrap-up; deploy preview | ~2–3 h | Claude, Dinakar reviewing |
| **P3: Tune + bug bash** | Demo journey + 1 non-ML journey on the deployed preview; prompt tuning; Chrome, Safari, mobile; final deploy | ~2 h | Dinakar testing, Claude fixing |
| **P4: Deliverables** | Claude drafts the rationale doc from these docs; Dinakar rewrites it in his voice. Video (≤ 8 min). Export transcripts. Submit | ~3–4 h | Dinakar-led |

### Timeline
| When | Plan |
|---|---|
| **Sat Oct 17 evening** | Vercel account + key setup → P0 → launch P1 tracks overnight (laptop kept awake with `caffeinate`, lid open, on power) |
| **Sun Oct 18 morning** | Review and merge the overnight tracks → P2 integration → deployed preview by midday |
| **Sun Oct 18 afternoon** | P3 tuning and bug bash → **2 pm cut-line checkpoint** |
| **Sun Oct 18 evening** | P4: rationale doc, video, transcripts → submit (or submit Mon morning after a fresh-eyes check) |
| Mon Oct 19 – Wed Oct 21 9 AM PT | Buffer only |

If P1 doesn't run overnight, Sunday starts with P0 + P1 (~5 h), making it a ~13 h day with no slack. The cut line then
applies at the 2 pm checkpoint.

**Cut line, in order:** unlockable themes → story pre-generation (generate on demand) → resume past sessions → guardrail UI
(keep default off) → compaction. **Never cut:** real code execution, learning moments with feedback, one boss, wrap-up, deploy.

### Parallelization notes
- Worktrees don't get the gitignored `web/.env.local`, so tracks B–E build against mocks and unit tests. Live API
  testing happens in Track A (which needs the key) and in P2.
- Each track owns its own folders (A: `app/api/chat`, `lib/claude/work*`; B: `lib/engine`; C: `components/`, `app/dev`;
  D: `lib/claude/content*`, other `app/api/*`, `scripts/`; E: `lib/store`, `lib/platform`, `middleware.ts`) to keep merges clean.
- Everything runs inside this Claude Code session so a single `/export` captures the full transcript for submission.

### Testing
- **Unit (Vitest):** gate decisions, Elo updates, target difficulty, guardrail caps, XP/levels, spend accounting.
- **Integration:** route handlers with the AI SDK's mock model for the moment pause/continue flow.
- **Prompt evals (manual checklist, real API):** five scripted scenarios. For each, check:
  - Are moments proposed at sensible points?
  - Are value scores honest?
  - Does Claude never self-answer?
  - Is the MC fallback valid?
  - Is the verifier reject rate low?
  - Are decide choices actually used?
- **Manual E2E** on the deployed preview: the full demo journey, plus one non-ML journey (e.g., a SQL report).

### P1 / future improvements (named in the doc and video)
- **Explicit topic learning** ("teach me about US presidents"): when the intent is to learn a subject rather than do a task. The current design partly handles this already (Claude's "work" becomes explaining, and moments still fire). A full version would bring back structured sections and bosses from `alternative-projects/learning-quest/`.
- Spaced review across sessions
- Novice 60-second primer
- Upload your own CSV
- More themes and sound packs
- Codex tab across sessions
- Resume code for other devices
- Model-agnostic providers
- Replayed-run fallback
- Tuning guardrail defaults from usage data
- **Local mode:** a bridge to the user's own Claude Code session

---

## 17. Decisions needed from Dinakar
1. **Approve the core mechanism:** learning moments as a tool Claude calls, with the engine gating them and the turn pausing for the learner (§3, §5).
2. **Spend caps:** $5/browser, $25/IP, $75/day global. And what monthly limit to set on the key in the Anthropic Console?
3. **Folder:** put the Next.js app in `web/` instead of the current `app/` placeholder, to avoid confusion with Next.js's own `app/` directory.
4. **Boss model:** Sonnet 5.5 at high effort for speed, upgrading to Opus 5.5 if boss quality is weak in testing?

### Setup steps only Dinakar can do (when we reach M0)
- Create a free Vercel account with "Continue with GitHub" and allow access to this repo.
- Put the API key into `web/.env.local` yourself, and into Vercel's Environment Variables. Never paste it into chat or docs.
- Set the monthly spend limit in the Anthropic Console.
- Export this session's transcript with `/export` into `transcripts/`.
