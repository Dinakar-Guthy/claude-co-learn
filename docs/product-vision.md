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
1. **Intent.** At most 2–3 quick questions: what are you working on, how familiar are you with this area, and how much
   do you want to learn vs. just get done (the learning dial). Default session length is 10 minutes.
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

## Decision pending: when do learning moments happen?
Dinakar asked to weigh two models:
- **(A) Teach first, then work.** Upfront learning, with collaboration happening at boss level.
- **(B) Work first, inject learning.** The user starts working immediately; moments are inserted as concepts come up.

**Recommendation: (B), with micro-teaching inside each moment and milestone bosses as checkpoints.**
- It matches the brief, which literally asks to "turn AI-assisted work into learning opportunities".
- Working professionals came to get something done. Front-loaded lessons delay value and feel like a detour, so they get skipped.
- Learning at the moment of need is more motivating and transfers better: the concept is immediately used on *their* problem.
- (A) survives in micro form: the 2–4 sentence concept card right before each question is "teach first", just at the scale of one concept.
- Risk: interruptions break flow. Mitigations are a moment budget, the learning dial, skip/defer ("quiz me at the end"), and never interrupting mid-stream.
- Where (A) is better: total novices who don't know what to ask. Mitigation: if the intent step reveals a novice, offer an opt-in 60-second primer.

## Pacing engine (code, per P8)
- Each Claude turn returns structured output: the work response, the concepts it touched, and an optional *candidate* learning moment (type, concept, question, rubric, multiple-choice fallback, ideal answer).
- Code decides whether to show the moment, based on:
  - the learning dial,
  - a cooldown (e.g., at least 2 turns between moments) and a budget (~3–5 moments per 10 minutes),
  - per-concept mastery (skip concepts already mastered; resurface stale ones),
  - the challenge band (P5).
- **Decide** and **predict** moments come *before* the related work is shown. For predict moments the work can be generated and held back; decide moments need a second call that uses the user's choice. Explain-back and spot-the-issue moments come *after*.
- Grading: Claude grades free-form answers against the rubric (correct / partial / incorrect + why). After one miss or a clear struggle, offer the multiple-choice version.

## Rewards and look
- **Permanent XP bar and player level** across all sessions. Levels unlock visual themes and sound packs (settings behind the gear; P1).
- Story chapters as milestone rewards: surprise genre, lightly themed to the work.
- ASCII characters: guide reactions (Pip the robot), bosses (`reference/ascii-characters.md`).
- "Frost" theme (light blue / white / silver), Nunito font, Kenney CC0 sounds, minimal on-screen clutter.

## Open question: does Claude actually run the code?
- **Option 1:** Claude writes code and explains it; results are described or simulated. Simple, but less real.
- **Option 2:** use Anthropic's server-side code execution tool so Claude actually trains a small model (e.g., scikit-learn on a sample CSV) and returns real metrics. Predict and boss moments become genuine. Feasibility, cost, and latency need checking.
- Either way, ship a **built-in sample dataset and starter prompt** so reviewers can try the demo in one click. Free-form tasks are allowed too.

## Platform and model
Hosted web app. Next.js on Vercel. Claude via the Vercel AI SDK; Claude-only for now, model-agnostic as P1.
Opus 5.5 / Sonnet 5.5 / Haiku 5.5 routed by task.
