# Co-learn: design rationale

> **Status:** sample draft scaffold.
> **How to fill it in:** each section lists what the brief asks, the questions to answer, and raw material (facts and sources), followed by an empty **Draft** for your own words. Run the guided session with `/rationale-coach` in Claude Code. It walks you through one section at a time, asks for your reasoning, and drafts in your voice for you to edit.
> **Target length:** about 2–3 pages in total (≈150–300 words per section). The video carries the demo, so this doc carries the *why*.
>
> Prototype: https://anthropic-take-home-10-17-26.vercel.app · Repo: this one · Decisions in full: `docs/decision-log.md`

---

## 1. Option chosen and why

**The brief asks:** which option, and why.

**Questions to answer:**
- Why Option B over Option A, in your own words?
- What made you re-scope from a "topic-to-game tutor" to Co-learn?
- Who is the user, and why that journey (a working professional training a churn model in ~10 minutes)?

**Raw material:**
- Option B: broader and more open-ended (learning anything while working with Claude, not just Claude itself).
- It plays to your strengths: you're not a Claude power user, so you couldn't build as detailed an Option A; B lets you apply learning-design ideas to real work.
- You started from a topic-to-game tutor idea, then realized B is about learning *through AI-assisted work*, and re-scoped to Co-learn (the original is archived in `alternative-projects/learning-quest/`).
- Target user: a working professional. Demo journey: training a churn model. Default session: 10 minutes, so reviewers can finish a full session.
- Sources: `docs/decision-log.md` (2026-10-17 rows "Choose Option B", "Re-scope to Co-learn", "Target user").

**Draft:**

_(your words)_

---

## 2. Design and prototyping process

**The brief asks:** your design and prototyping process.

**Questions to answer:**
- What did you decide *before* building, and why principles first?
- How did you work with Claude: what did you delegate, what did you decide yourself, and how did you check its output?
- What changed after you played with it yourself (your playthrough feedback)?
- One or two moments where live testing changed the design.

**Raw material:**
- **Order of work:**
  1. Research.
  2. Nine design principles (`docs/design-principles.md`).
  3. Product vision.
  4. Design plan.
  5. Contracts-first parallel build (5 worktree tracks).
  6. Integration.
  7. Live testing in a real browser.
  8. Your playthrough.
  9. A second build round.
- **Decision log:** every meaningful decision with the alternatives considered (`docs/decision-log.md`, 60+ rows). Claude proposed options; you chose.
- **Live testing changed the design:**
  - Claude explained the "leak" before asking about it, so we added a "don't spoil moments" rule.
  - No boss appeared within 10 minutes, so we added the milestone nudge.
  - The miss feedback gave the answer away before the options, so it's now a hint first.
- **Your playthrough:** "if I don't know the answer… there aren't mechanisms for me to learn." That led to the help tools (hints, Teach me, Ask Claude), less credit after help, and reveal only after an attempt.
- **Your other playthrough changes:**
  - **Boss exits:** the opt-in offer and Skip.
  - **Saved questions:** they now stand on their own.
  - **Primer:** for newcomers.
  - **Reset:** start over easily as a new user.
  - **Test-traffic tagging:** your own testing stays out of the numbers.
- Transcripts of every session are in `transcripts/`.

**Draft:**

_(your words)_

---

## 3. How it enhances, not replaces, human agency

**The brief asks:** how the design keeps the human an active participant.

**Questions to answer:**
- Where does the learner make the real decisions in the work?
- What can the learner always control or opt out of?
- Why do it this way instead of having Claude just explain things?

**Raw material:**
- **P7 "The user stays the decision-maker":** at real forks (which metric, where to set the threshold), Claude asks with a *decide* moment and then builds on the answer ("You picked recall, so I scored the models on that").
- **Structural pause:** a learning moment is a tool call that ends Claude's turn, so Claude *cannot* answer its own question.
- **Learning by consequence:** if a choice is weak but safe, Claude follows it and lets the real results show the effect.
- **Control:**
  - Skip, "Quiz me later", or report any question.
  - Optional guardrails (Light / Balanced / Strict).
  - Bosses are opt-in ("Take it on / Keep working"), can be skipped, or turned off.
  - Typing past a question simply skips it.
- **Help is learner-initiated:** hints, Teach me, and Ask Claude. The answer appears only after an attempt (or after asking twice), so the learner still does the thinking.
- Sources: `docs/design-principles.md` P7, P8; `docs/design-plan.md` §3, §15.

**Draft:**

_(your words)_

---

## 4. Learning principles behind the decisions

**The brief asks:** the learning principles behind your decisions.

**Questions to answer:**
- Which 3–5 principles matter most to you, and where does each show up in the product?
- Which research findings shaped specific numbers or rules?

**Raw material:**
- **Retrieval practice:** free recall first, with multiple choice only as a fallback.
- **Immediate explanatory feedback:** every answer gets a "why". Mistakes help only with an immediate explanation (Kornell, Hays & Bjork 2009).
- **Desirable difficulty, banded:** target success rates are first exposure 85–90%, practice 75–85%, boss 65–80%. Elo-style mastery backs off fast after misses and ramps up slowly (P5, `reference/research/01-challenge-ratio.md`).
- **Just-in-time learning:** moments are triggered by the learner's own work and data, not a curriculum.
- **Interleaving:** bosses mix concepts from the session.
- **Spaced review:** concepts you struggled with come back in a later session.
- **Scaffolding without spoon-feeding:** hints → lesson with a worked example → ask; less credit after help; reveal only after an attempt.
- **Motivation without punishment:** proportional rewards (XP, sounds, confetti, level-ups that unlock themes); wrong answers get a soft sound and encouraging copy (P2).
- **Cut after playtesting (2026-10-18):** serialized story chapters (after bosses and at wrap-up). Dinakar couldn't follow them while working, and in Co-learn the work itself is what engages people, so the story competed with it (and added a wait of up to 25s after each boss). It's switched off per mode, not deleted, and planned for Learn mode, where there's no real work to carry engagement.
- **Code paces, Claude creates (P8):** a small deterministic engine decides when and how hard; Claude writes the questions and grades the answers.

**Draft:**

_(your words)_

---

## 5. Measuring success

**The brief asks:** how you'd measure success.

**Questions to answer:**
- What does "success" mean for a learner (in the session and later), and for the product?
- Which metrics would you watch first, and what would make you change the design?

**Raw material:**
- **`/insights`** (built; anonymous; test traffic excluded) shows:
  - answer, skip, defer and reveal rates
  - help usage, and scores with vs without help
  - accuracy against the P5 bands (too easy / in band / too hard)
  - boss offered / declined / skipped / outcomes
  - pacing-gate decisions
  - wrap-up "Did you learn something?" 👍 rate
  - **delayed retention** (score on the same concept in later sessions vs the first)
  - daily totals
- **Most important:** delayed retention, plus task completion (people still finish their work). Session XP is not a success metric.
- **Early signal from testing:** questions landed *above* the target band (too easy), which is a tuning input.
- **Future:** A/B the guardrail defaults; tune boss frequency from offered/declined rates.

**Draft:**

_(your words)_

---

## 6. Scaling to millions of users

**The brief asks:** how this would scale.

**Questions to answer:**
- What's expensive, and how does the design keep it cheap?
- What would have to change for a real launch?

**Raw material:**
- **Stateless serverless routes:** the server owns state in Redis; per-user state is small JSON.
- **Cost controls:**
  - Prompt caching on the system prompt, tools and history.
  - Cheap fast models where possible (Haiku for grading, verification and hints).
  - The pacing engine is deterministic code (no model cost).
  - Long sessions use the API's on-demand compaction.
- **Measured cost:** about $0.20–0.30 per 10-minute demo session.
- **Abuse protection:** rate limits (20 per minute per browser, 60 per IP), daily spend caps ($5 / $25 / $75), and limits that fail open with an owner alert.
- **The sandbox is Anthropic-managed:** each session gets its own code-execution container.
- **For a real launch:**
  - accounts instead of anonymous cookies (cross-device)
  - relax the demo-only boss nudge
  - tune defaults from data
  - more surfaces (see §7)
- Sources: `docs/design-plan.md` §9.3, §11, §15; `docs/backlog.md`.

**Draft:**

_(your words)_

---

## 7. Getting a sister team to adopt it long-term

**The brief asks:** how a sister team would adopt this.

**Questions to answer:**
- What is the reusable piece another Claude surface could adopt?
- What would you hand them (contract, engine, UI), and how would you make adoption low-effort?
- How would you keep it working over time (shared mastery, metrics, ownership)?

**Raw material:**
- **The `learning_moment` tool + pacing engine is a surface-agnostic contract.** Any Claude surface (Claude Code as a `/co-learn` mode, Claude.ai as a toggle) adopts it by adding the tool and rendering the card.
- The engine is pure, unit-tested TypeScript (`web/lib/engine/`) with a clear API (`EngineApi` in `web/lib/contracts/engine.ts`).
- A shared mastery profile could follow users across surfaces, so review would work everywhere.
- Telemetry events + `/insights` give a sister team the same success metrics out of the box.
- Sources: `docs/design-plan.md` §15; `web/lib/contracts/*`.

**Draft:**

_(your words)_
