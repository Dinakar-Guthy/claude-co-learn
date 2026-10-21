# Video script and shot list

> Talking points match `docs/design-rationale.md` (2026-10-21).
> The bullets are talking points, not lines to read. Say them in your own words.

**Target:** about 7:30, hard cap 8:00. **Format:** a screenshare with voice (face cam optional).
**Shape:** show first, explain after. The demo takes about half the time, and the brief's seven points are woven in
(marked **[B1]–[B7]**).

Brief points: **B1** option and why · **B2** design/prototyping process · **B3** enhances, not replaces, agency ·
**B4** learning principles · **B5** measuring success · **B6** scaling to millions · **B7** sister-team adoption.

## Timed segments

| Time | Screen / shot | Talking points |
|---|---|---|
| **0:00–0:30** Hook **[B1]** | Landing page, fresh tab (Tab 0). Type `/co-learn` and let the unlock animation and sound play. | • "I picked Option B." Two reasons: it's something I'd actually use myself, and I'm not a Claude Code expert, so I couldn't design Option A as well.<br>• The brief was open on whether learning happens *while* you work, so I built two modes: **Co-learn** (real work, with learning moments that come out of it) and **Learn** (pick a topic). They're different flow states with different needs.<br>• It's imagined as a mode you switch on inside Claude, hence the slash command. |
| **0:30–0:50** Intent | Tab 0: the intent screen, with the mode switch (Work on something / Learn a topic), "What are you working on?", and "Try the demo: train a churn model". Click through familiarity and time. | • The demo user is a working professional training a model. That's me: being a customer of my own product made the journey easy to understand.<br>• At most three quick questions, then the work starts right away. |
| **0:50–1:50** A real fork **[B3][B4]** | **Tab A** (Co-learn churn session paused at a *Decide* question: "which metric?"). Scroll up briefly to show real code and output, then the question card. Type a free-form answer (e.g. "recall, because missing a churner costs more"), submit, and show the "why" and XP. | • **What I built, in one line:** a question-and-answer system woven into real work. Questions get harder as you get them right and build to a boss battle, so the person has to take agency instead of watching Claude solve it.<br>• Claude really runs Python (Anthropic's code execution): real metrics. It asks at the **real fork**, after doing everything that didn't depend on my answer.<br>• My answer steers the work ("You picked recall, so I scored the models on that"). A weak but safe choice gets followed, and the results show why.<br>• Deciding instead of being fed a firehose: it leaves you feeling empowered, not like a store of knowledge, which AI is getting good at anyway.<br>• Every answer gets an immediate "why" (mistakes only help when explained right away). |
| **1:50–2:30** Help without handing over the answer **[B3][B4]** | **Tab B** (an open question card). Open "Give me a hint", then "Help me learn this" → "Ask Claude…" and type "just tell me". Show the kind decline. | • This came from my own playtest: I hit a question I couldn't answer and had no way to learn it. Questions alone aren't enough.<br>• Help comes only when you ask: hints, "Teach me", Ask Claude. That puts the learner in control of the difficulty, including choosing to struggle on their own.<br>• The answer appears only after you've tried; help costs a little credit, never a penalty. |
| **2:30–3:10** Boss **[B4]** | **Tab C** (boss offer showing, "Take it on, about 2 min / Keep working"). Click *Take it on*, answer one question, show the hit, the ASCII boss and the sound. | • Adaptive difficulty: people want something hard enough to be worth beating. The engine aims for ~80% (bosses 65–80%).<br>• A boss mixes the session's concepts into tougher questions. It's opt-in, and "Keep working" never blocks the work.<br>• Reward: XP, sounds, confetti, level-ups. Hard work should feel rewarded; that keeps the learning loop running. |
| **3:10–3:45** Wrap-up | **Tab D** (a finished session). Click "See the wrap-up": Codex of concepts, "Review next time", XP/level, "Learn more" readings, "Next time you could…". | • You leave with a record: what you learned, what to review (it resurfaces in the next session), and real readings with links.<br>• Sources everywhere Claude explains a concept, so learners can verify (P9, trustworthy content). |
| **3:45–4:20** Learn mode coda **[B1]** | **Tab E** (`/learn`, Roman Republic): path card at the top, a cited lesson, a question after it, a story chapter. | • The second mode, for when you want to study, not work: a 3-part path, ~120-word cited lessons, a question after each, bosses as chapter tests.<br>• The story lives *here*. In Co-learn it competed with the real work, so I cut it there after playtesting. |
| **4:20–4:55** How it works (internals) | The **"How it works" diagram** below (screenshot it, or open this doc on GitHub). Optionally flash `web/lib/claude/work/loop.ts` and `web/lib/engine/` in the repo. | • Browser → a Next.js route on Vercel (`/api/chat`) → the **Claude API**, streamed back live. One work turn is a streaming tool loop on the Anthropic SDK (Sonnet 5.5; Opus for the session plan, Haiku for grading and quick hints).<br>• Claude has Anthropic's **server-side tools**: code execution (real Python in Anthropic's sandbox) and web search (citations become the [n] source links).<br>• Plus **my own tools**: `learning_moment` (Claude proposes a question), `milestone_reached` (a chunk of work is done → boss); in Learn mode `set_learning_path` and `teach`.<br>• **"Code paces, Claude creates" (P8):** Claude only *proposes* a moment; a small deterministic engine (`lib/engine/`, plain unit-tested TypeScript) decides whether it shows, how hard, XP and mastery. No model call for pacing.<br>• State and telemetry live in Upstash Redis; long histories are compacted (above ~40k tokens); daily spend caps ($5 per browser, $25 per IP, $75 global) and rate limits protect the key. |
| **4:55–5:30** Process **[B2]** | Repo on GitHub: `docs/design-principles.md`, then `docs/decision-log.md` (scroll). | • I started from my own understanding of learning, from tutoring professionally and a long interest in education. I wrote it as principles, then had Claude check each against peer-reviewed research.<br>• I designed the product and pressure-tested it with Claude; every decision is logged with alternatives.<br>• As a Staff engineer I wrote the engineering plan (contracts, parallel build order); Claude executed it.<br>• My check was the final product: as AI does more of the intermediate work, the result is what a person should validate. So I played through it and drove a second build round. |
| **5:30–5:55** Principles recap **[B4]** | Back to the app: Settings (gear) → guardrails Light/Balanced/Strict. | • Targets about 80% correct (85–90% for new concepts, 65–80% for bosses); back off fast after misses.<br>• No quota by default: a quality bar decides; opt-in guardrails for fewer interruptions. |
| **5:55–6:30** Measuring success **[B5]** | `/insights` (Settings → "How Co-learn is doing"). Point at the band accuracy, boss outcomes, help usage, and the 👍 rate. | • Success = people actually learn: accuracy on questions, especially the **end-of-session boss**, is the best evidence it stuck. Plus a confidence survey (the wrap-up asks "Did you learn something?").<br>• For users: do they enjoy it and come back? First I'd check adoption and retention (DAU, returners).<br>• Then in-session signals: accuracy vs the difficulty bands (early testing: too easy), boss take-on rate, help usage. They tell me where to make it easier or harder. Delayed retention shows whether it lasted. |
| **6:30–6:50** Scaling **[B6]** | Stay on `/insights`. | • The hard part is people, not servers: everyone needs a different tone, difficulty and ramp. So: more adaptive prompting, persistent personalization across sessions, maybe LoRA if prompting isn't enough.<br>• The architecture is a good start: stateless routes, prompt caching, Haiku for grading, a free pacing engine; ~$0.20–0.30 per session.<br>• For launch: off the free tiers, ideally onto Anthropic's own infrastructure; built into Claude or a standalone product; UX polish; iterate on question and hint quality. |
| **6:50–7:15** Sister-team adoption **[B7]** | `web/lib/contracts/` in the repo (the `learning_moment` tool and `EngineApi`). | • Two readings. *Using it:* ask them for a recent complex problem and build a demo of Co-learn on it.<br>• *Building it in:* start with a team building custom Claude interfaces. Pitch: making Claude game-like pays off beyond learning. Share the question cards, the game layer (one tool + the engine), and the metrics/`/insights`.<br>• Our team keeps maintaining the infrastructure; both teams share ownership of the user metrics. |
| **7:15–7:30** Close | Back to the landing page. | • One line: Claude does the work *with* you, and you come out more capable.<br>• Thanks. |

## How it works (diagram for the 4:20 segment)

```
 Browser (Next.js page)                       Vercel (Next.js API routes)                     Anthropic
 ┌──────────────────────┐   POST /api/chat   ┌──────────────────────────────────┐  stream  ┌──────────────────────────┐
 │ chat + moment cards  │ ─────────────────▶ │ work loop  lib/claude/work/      │ ───────▶ │ Claude API (Sonnet 5.5)  │
 │ (streamed NDJSON)    │ ◀───────────────── │   function tools: learning_moment│ ◀─────── │  server tools:           │
 └──────────────────────┘   live events      │   milestone_reached, teach, ...  │          │  · code execution (Python)│
                                             │        │ candidate moment        │          │  · web search (citations)│
                                             │        ▼                         │          └──────────────────────────┘
                                             │ pacing engine  lib/engine/       │
                                             │  gate · difficulty · XP · mastery│   "code paces, Claude creates"
                                             │  (deterministic, no model call)  │
                                             └───────────────┬──────────────────┘
                                                             ▼
                                             Upstash Redis: sessions, mastery, events, spend caps
```

## Pre-staged tabs (all test mode: open with `?test=1`)

Open each in its own tab before recording so you never wait on Claude on camera (lessons take 14–24s, code runs longer).

| Tab | URL / start | State it must be in |
|---|---|---|
| **Tab 0** | `https://anthropic-take-home-10-17-26.vercel.app/?test=1` (fresh, locked). Use "Start over as a new user" if it opens unlocked. | Landing page with the empty `/co-learn` box. |
| **Tab A** | Co-learn, "Try the demo: train a churn model", familiarity *Some*, 10 min. | Paused at a **Decide** question (ideally "which metric?") with code output visible above it. Don't answer it. |
| **Tab B** | Co-learn churn session (can be a second demo session). | An **unanswered** question card with no help used yet. |
| **Tab C** | Co-learn churn session, played through ≥ 3 concepts. | The **boss offer** card showing ("Take it on…"). |
| **Tab D** | A Co-learn session played to the end. | Wrapped up: the "See the wrap-up" button, with the Codex, "Learn more" and suggestions present. |
| **Tab E** | `/learn` → "the fall of the Roman Republic". | Path card visible, the first lesson with sources, a question below it, and ideally one story chapter. |
| **Tab F** | `/insights` with "Include test traffic" **on** (production has little real traffic). | Charts populated. |
| **Tab G** | GitHub repo: `docs/decision-log.md`, with `docs/design-principles.md` and `web/lib/contracts/` in further tabs. | Scrolled to the top. |

Tabs A–D can come from one or two sessions if you save the URLs (`/s/<id>`) at each state. A reload restores the state.
Note: test tabs show a small "Test traffic (this tab)" badge in the corner. It's fine to leave it, or mention it in one breath.

## Recording checklist
- [ ] All tabs above staged and checked (reload each once).
- [ ] Browser: one window, zoom 110–125% so the text reads on video; bookmarks bar hidden; notifications off (Focus mode).
- [ ] Sound on for the unlock and boss sounds (check the recorder captures system audio, or mention the sounds).
- [ ] Recorder: macOS ⌘⇧5 → Record Selected Portion, Options → microphone on (or Loom/QuickTime). 1080p.
- [ ] One rehearsal against a timer; cut segments that run over (the process and scaling segments compress best).
- [ ] One take is fine, and small stumbles are fine. Stop under 8:00.
- [ ] Watch it back once at 1.5×; check the audio is audible all the way through.
- [ ] Upload (unlisted YouTube/Loom/Drive link with view access) and put the link in the Greenhouse text.
