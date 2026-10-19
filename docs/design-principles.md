# Design principles

Authored by Dinakar (2026-10-17). Revisions are proposed in "Pending" below and only merged once he accepts them.
History: v0 as stated → v1 merged the P2/P5 revisions and added P8/P9 → v2 (2026-10-17) added the feedback rule to P3/P4 and re-scoped P7 → v3 (2026-10-18) made story chapters in P2 mode-dependent → v4 (2026-10-18) added P10 (protect the flow of work).

1. **Simplicity first: minimal clutter, maximal focus.**
   Simplicity is about what's *on screen*, not about dumbing down content. The UI should never distract.
   - The entry point is a **single text input**. For Co-learn, it's the `/co-learn` "password" box (see product vision).
   - After entry, tabs across the top are acceptable. Otherwise the focus stays on what the user says and how the tool responds.

2. **It should feel like a video game, with proportional rewards that never punish.**
   Small rewards for each successful interaction (a soft sound, a micro-animation, XP). Larger rewards for bigger
   milestones (a jingle, bonus XP, a level-up), with boss wins the rarest and biggest. Wrong answers get a soft
   sound and encouraging copy, never red flashes or buzzers. One celebration per milestone.
   - Story chapters belong in Learn mode, where there's no real work to carry engagement. In Co-learn the work itself
     is engaging, so a story would only compete with it.

3. **Teach in small doses, then apply, and always explain why.**
   Short exposition first, immediately followed by a question where the user applies it. After enough small doses,
   cumulative questions combine the concepts learned so far. Every answer gets a one- or two-sentence "why", not just
   ✓/✗. Mistakes only help learning when an immediate explanation follows them (Kornell, Hays & Bjork 2009).

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

7. **The user stays the decision-maker.**
   At real decision points in the work (which metric, which approach, what to try next), Claude asks the user to
   decide and then builds on their choice. The user controls how much learning happens (optional guardrails) and can
   skip or defer any learning moment. Claude never answers its own question before the user has attempted it.

8. **Code paces, Claude creates.**
   A small deterministic engine decides *when* a learning moment happens and *how hard* it is. Claude writes the
   explanations and questions, grades answers, and does the work. This keeps adaptivity predictable, testable, and explainable.

9. **Trustworthy content.**
   Generated questions and answer keys are checked before being shown, and users can flag a bad question.

10. **Protect the flow of work (Co-learn).**
   In Co-learn we don't want to interrupt a user's flow state; learning moments should be as unintrusive as possible,
   so the work flows as though Co-learn weren't on. For example, Claude does the work that doesn't depend on an answer
   before asking, so a question never holds up work it isn't about.

## Pending
_(none)_
