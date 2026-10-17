# Design principles

Authored by Dinakar (2026-10-17). Revisions are proposed in "Pending" below and only merged once he accepts them.
History: v0 as stated → v1 (2026-10-17) merged accepted revisions to P2 and P5 and added P8 and P9.

1. **Simplicity first: minimal clutter, maximal focus.**
   Simplicity is about what's *on screen*, not about dumbing down content. The UI should never distract.
   - The entry point is a **single text input**. For Co-learn, it's the `/co-learn` "password" box (see product vision).
   - After entry, tabs across the top are acceptable. Otherwise the focus stays on what the user says and how the tool responds.

2. **It should feel like a video game, with proportional rewards that never punish.**
   Small rewards for each successful interaction (a soft sound, a micro-animation, XP). Larger rewards for bigger
   milestones (a jingle, a story chapter, a level-up), with boss wins the rarest and biggest. Wrong answers get a soft
   sound and encouraging copy, never red flashes or buzzers. One celebration per milestone.

3. **Teach in small doses, then apply.**
   Short exposition first, immediately followed by a question where the user applies it. After enough small doses,
   cumulative questions combine the concepts learned so far.

4. **Active application is the core.**
   The question-and-answer loop, where users must immediately apply what they learned, is the most critical part.

5. **Challenge targets by question type (research-backed; ~80% is the anchor).**
   - New concept, first exposure: 85–90% correct.
   - Standard practice / review: ~75–85%.
   - Boss / cumulative: 65–80%.
   Adapt on rolling accuracy rather than single answers: back off quickly after misses, ramp up gradually. When in
   doubt, err toward easier. Success is long-term retention, not the in-session score.
   Evidence: `reference/research/01-challenge-ratio.md`.

6. **Adaptive, never pre-scripted.**
   Questions, their number, and their timing react to how the user is doing and what they're working on.

7. **Learner agency.** _Pending re-scope for Co-learn (see below)._

8. **Code paces, Claude creates.**
   A small deterministic engine decides *when* a learning moment happens and *how hard* it is. Claude writes the
   explanations and questions, grades answers, and does the work. This keeps adaptivity predictable, testable, and explainable.

9. **Trustworthy content.**
   Generated questions and answer keys are checked before being shown, and users can flag a bad question.

## Pending (awaiting Dinakar's review)

**P3/P4 addition: every answer gets a short "why".**
After each answer, show a one- or two-sentence explanation, not just ✓/✗. Example:
> Q: Why do we hold out a test set before training?
> A (user): To make training faster.
> Feedback: Not quite. It's about honesty: the test set is data the model has never seen, so its score predicts how
> the model will do on new data. Speed barely changes.
Research shows mistakes only help learning when an immediate explanation follows them (Kornell, Hays & Bjork 2009),
and explanations deepen understanding even when the user was right.

**P7 re-scoped for AI-assisted work: "The user stays the decision-maker."**
The brief's core worry is humans becoming passive observers while AI works, and the written doc must explain how the
design "enhances rather than replaces human agency". In Co-learn:
- At real decision points in the work (which metric, which approach, what to try next), Claude asks the user to decide and then builds on their choice.
- The user controls the learning intensity (a "learning dial") and can skip or defer any learning moment.
- Claude never answers its own question for the user before they've attempted it.
