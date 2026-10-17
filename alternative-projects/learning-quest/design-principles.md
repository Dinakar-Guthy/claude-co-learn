# Design principles

Authored by Dinakar (2026-10-17). These apply regardless of Option A vs. B.
Status: **v0 — as stated**. Proposed revisions go in a "Proposed changes" section below, never silently.

1. **Simplicity first — minimal clutter, maximal focus.**
   Simplicity is about what's *on screen*, not about dumbing down content. The UI should never distract.
   - The landing page / entry point is a **single text input**, optionally with a suggested prompt or brief instructions.
   - After the first input, tabs across the top are acceptable, but otherwise the focus is only on what the user says and how the tool responds.

2. **It should feel like an interactive video game.**
   Learning is gamified: small rewards (dopamine hits) after each successful interaction, larger rewards after a unit or set of interactions — a graphic, a sound, both, or a piece of story unlocked as the user progresses.

3. **Teach in small doses, then apply.**
   Short exposition/explanation first, followed immediately by questions where the user applies what they just learned. After enough small doses, a threshold triggers **cumulative** questions that aggregate all prior concepts.

4. **Active application is the core.**
   The question-and-answer loop — where users must immediately apply what they learned — is the most critical part of the experience.

5. **Target ~80% success.**
   The ideal challenge has users getting ~80% of questions right and ~20% wrong. When in doubt, err toward *more* than 80% right.

6. **Adaptive, never pre-scripted.**
   Questions, section length, and even story length are not predetermined. The experience reacts to how the user is doing — longer or shorter, easier or harder — while staying simple on the surface and flexible underneath.

## Proposed changes (draft by Claude, 2026-10-17 — pending Dinakar's review)
Based on `reference/research/`. Nothing above is changed until accepted.

- **P5 → banded targets instead of one number.** ~80% is a sound heuristic but not a proven human optimum. Proposed: new-concept questions 85–90%; standard practice ~75–85%; boss/cumulative 65–80%; adapt on rolling accuracy, back off fast after misses, ramp up slowly. Optimize for retention, not in-session score.
- **P3/P4 → feedback is part of the loop.** Every answer gets immediate, explanatory feedback (why the right answer is right / why the chosen one isn't). The learning value of errors depends on it.
- **P2 → rewards are proportional and never punishing.** Small sound + micro-animation per correct answer; one celebration per milestone; boss/fanfare rarest and biggest. Wrong answers get a soft sound and encouraging copy — no red flashes or buzzers.
- **New P7 — Learner agency.** The learner sets scope and pace, can confirm/edit the quest map, skip ahead when ready, and ask to review anything. The tool never does the thinking for them: it explains, asks, and gives feedback; it doesn't hand over answers before an attempt.
- **New P8 — Code paces, Claude creates.** A small deterministic learner model decides when to advance, remediate, or trigger a boss and how hard the next question is; Claude writes explanations, questions, stories, and grades. Keeps adaptivity predictable, testable, and explainable.
- **New P9 — Trustworthy content.** Generated questions are self-checked before being shown; learners can flag a bad question.
