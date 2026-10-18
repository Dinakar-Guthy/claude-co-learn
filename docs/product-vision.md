# Product vision: Co-learn (v1, Option B)

Authored with Dinakar, 2026-10-17. The previous topic-to-game vision is archived in `alternative-projects/learning-quest/`.

## One-liner
**Co-learn is a mode for Claude where you get real work done *and* come out more capable.** Claude collaborates on
your task as usual, but at the right moments it turns the work into short, game-like challenges you solve yourself.
Your answers often steer the work.

## Framing
Imagined as a mode that ships inside Claude (e.g., `/co-learn` in Claude.ai or Claude Code). The prototype is a
standalone web app that emulates that mode on the Claude API.

## Target user and demo
- **User:** a working professional using Claude to get a task done in an area where they're not yet an expert, who wants to grow rather than just delegate.
- **Demo scenario (video):** training a machine-learning model, e.g., "help me train a model to predict customer churn from this CSV".
- **Session length:** 10 minutes by default.

## Experience
0. **Unlock.** The landing page is a single input whose placeholder shows `/co-learn` like a password hint. Typing it
   unlocks the site with a small animation and sound. It frames Co-learn as a mode you switch on. It is **not**
   security: the "password" is shown on screen, so abuse protection comes from rate limits.
1. **Intent.** At most 2–3 quick questions: what are you working on, how familiar are you with this area, and roughly
   how long you have (10 minutes by default). Learning guardrails are off by default (see Pacing).
2. **Work.** The user prompts and Claude works on the task, as in normal Claude.
3. **Learning moments.** Small, discrete challenges triggered by what the user is doing *right now*, not a pre-planned
   curriculum (the work changes too much as it goes). Each moment:
   - an optional 2–4 sentence concept card,
   - a free-form question,
   - a multiple-choice version if the user struggles,
   - a short "why" as feedback, plus XP and a sound,
   - then Claude continues the work, using the user's answer where it applies.
4. **Milestone bosses.** When a chunk of work completes (data prepared, first model trained), a short boss challenge
   recombines the concepts from recent moments, e.g., "Train accuracy is 99% and validation is 61%. What's happening, and what's the first thing you'd change?"
5. **Wrap-up.** A recap "codex" of concepts learned this session, XP and level progress, a story chapter (a surprise,
   lightly themed to the work), and suggestions for what to explore next. Concepts from past sessions come back later
   as spaced review.

## Learning moment types
| Type | Example (training a model) | When it fits |
|---|---|---|
| **Decide** | "Classes are 90/10 imbalanced. Accuracy or F1 as our metric, and why?" Claude then uses the choice. | A real fork in the work. Strongest for agency. |
| **Predict** | "Before I run this: what will happen to validation loss as we add epochs?" Result revealed after. | Right before a result appears |
| **Explain-back** | "In one sentence: why did we scale the features?" | Right after Claude did something new |
| **Spot the issue** | "This split has a subtle problem. Find it." (data leakage) | Code or config the user should be able to review |
| **Fill the gap** | "What value would you set for `test_size`?" | Small, low-risk parameters |

## Decided: work first, learning injected (2026-10-17)
Dinakar asked to weigh two models:
- **(A) Teach first, then work.** Upfront learning, with collaboration happening at boss level.
- **(B) Work first, inject learning.** The user starts working immediately; moments are inserted as concepts come up.

**Decision: (B), with micro-teaching inside each moment and milestone bosses as checkpoints.** Accepted by Dinakar.
- It matches the brief, which literally asks to "turn AI-assisted work into learning opportunities".
- Working professionals came to get something done. Front-loaded lessons delay value and feel like a detour, so they get skipped.
- Learning at the moment of need is more motivating and transfers better: the concept is immediately used on *their* problem.
- (A) survives in micro form: the 2–4 sentence concept card right before each question is "teach first", just at the scale of one concept.
- Risk: interruptions break flow. Mitigations are a quality bar for moments, optional guardrails, skip/defer ("quiz me at the end"), and never interrupting mid-stream.
- Where (A) is better: total novices who don't know what to ask. Mitigation: if the intent step reveals a novice, offer an opt-in 60-second primer.

## Pacing engine (code, per P8)
**Default: no limits.** Not every interaction is equally ripe for learning, so whenever a great learning moment presents
itself, we show it. No fixed budget or cooldown by default.

- Each Claude turn returns structured output: the work response, the concepts it touched, and an optional *candidate*
  learning moment (type, concept, question, rubric, multiple-choice fallback, ideal answer, and a **learning-value
  score** with a one-line justification).
- Since there's no budget by default, the **quality bar** is what keeps this from becoming spammy. Code shows a
  candidate when:
  - its learning-value score clears the threshold,
  - the concept isn't already mastered (stale concepts resurface as review),
  - it targets the user's challenge band (P5).
- **Optional guardrails (opt-in):** users who want fewer interruptions can enable guardrails in settings, then dial between:
  | Mode | Behavior (initial values, to tune) |
  |---|---|
  | Light | Soft cap ~1 moment per 2 turns; nothing else changes |
  | Balanced | ~3–5 moments per 10 min, ≥2 turns between moments |
  | Strict | ~1–2 moments per 10 min, only the highest-value moments; the rest deferred to the wrap-up quiz |
  Caps are soft: an exceptional moment (e.g., the user is about to make a costly mistake) may still break through.
  Strict = fewest interruptions (confirmed).
- **Timing:** decide and predict moments come *before* the related work is shown. For predict moments the work can be
  generated and held back; decide moments need a second call that uses the user's choice. Explain-back and
  spot-the-issue moments come *after*.
- **Grading:** Claude grades free-form answers against the rubric (correct / partial / incorrect + why). After one miss
  or a clear struggle, offer the multiple-choice version.
- **Future improvement:** tune the default (and the guardrail values) based on what works better for users; for
  example, track skip rates, answer rates, and session completion per mode.

## Rewards and look
- **Permanent XP bar and player level** across all sessions. Levels unlock visual themes and sound packs (settings behind the gear; P1).
- Story chapters as milestone rewards: surprise genre, lightly themed to the work.
- ASCII characters: guide reactions (Pip the robot), bosses (`reference/ascii-characters.md`).
- "Frost" theme (light blue / white / silver), Nunito font, Kenney CC0 sounds, minimal on-screen clutter.

## Real code execution (researched 2026-10-17, `reference/research/08-code-execution.md`)
- **Plan:** Claude actually runs code using Anthropic's **server-side code execution tool**: real Python + scikit-learn in
  an isolated, offline sandbox, with only the API key. Files persist across turns via a reused container, so the
  predict moments and bosses use *real* metrics and charts.
- **Not feasible for the prototype:** connecting the hosted site to a user's *local* Claude Code (a server can't reach a
  laptop), or hosting the Claude Agent SDK (needs a container per user; ~8–12 h, high risk).
- **Future improvement, "local mode":** a small local companion (e.g., `npx co-learn-bridge`) that dials out to Co-learn
  and lets learning moments run on the user's own Claude Code session, repo, and data.
- **Demo data:** a seeded **synthetic churn CSV** (~5,000 customers, ~15% churn) bundled with a one-click
  "try the demo" starter. It has no license issues, and the imbalance sets up a natural "accuracy is misleading" moment.
  Free-form tasks still work.
- **Fallback:** a pre-recorded real run, replayed and clearly labeled "replayed", if the sandbox fails during review.

## Platform and model
Hosted web app. Next.js on Vercel. Claude via the Vercel AI SDK; Claude-only for now, model-agnostic as P1.
Opus 5.5 / Sonnet 5.5 / Haiku 5.5 routed by task. Per-turn execution (incl. code runs): **Sonnet 5.5** by default; switch to Opus 5.5 if Sonnet
stumbles on multi-step code during testing. Claude effort setting: **high** for planning calls (intent →
session plan, boss design), **medium** for per-turn execution calls.
