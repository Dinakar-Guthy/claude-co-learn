# Decision log

Running record of meaningful decisions and the reasoning behind them. Feeds the design rationale and video.

| Date | Decision | Alternatives considered | Rationale |
|------|----------|------------------------|-----------|
| 2026-10-17 | Use a private GitHub repo + Claude Code as the shared workspace for docs and code | — | Version history of the process; easy to export transcripts; one place for all artifacts |
| 2026-10-17 | Established 6 design principles + product vision (game-based, adaptive, simplicity-first) before choosing A vs B | Pick option first, then design | Principles should hold regardless of option; deciding *how* people should learn first keeps the choice of option grounded in learning goals |
| 2026-10-17 | Accepted research recommendations: banded challenge targets, Claude for stories (Sonnet 5.5), Kenney CC0 sounds + use-sound, "Frost" palette + Nunito, outline-first + just-in-time content with code-driven pacing, Next.js on Vercel, Vercel AI SDK, per-task model routing | — | Research in `reference/research/` supports each; they fit the simplicity principle and a ~3-day timeline |
| 2026-10-17 | Use multi-line ASCII characters for guides/bosses instead of image assets | Claude-generated SVG, pre-made art | Zero assets, renders anywhere, fits the cozy/minimal aesthetic, Claude can create new ones on the fly |
| 2026-10-17 | XP bar is a permanent, user-level feature; levels unlock visual themes **and sound packs** | XP per game only | Long-term progression motivates return visits across topics; cosmetic rewards don't distract from learning |
| 2026-10-17 | Archive the topic-to-game concept as an alternative project (`alternative-projects/learning-quest/`) | Discard it; build it for the take-home | It's a tutor game, but Option B is about learning *through AI-assisted work*; worth keeping to build independently |
| 2026-10-17 | **Choose Option B** | Option A (helping users master Claude) | B is broader and more open-ended. Dinakar isn't a Claude power user, so he could build a more detailed experience for B than for A |
| 2026-10-17 | Re-scope to **Co-learn**: learning moments triggered by real work, not a pre-planned curriculum | Topic-to-game tutor | B is about learning *through AI-assisted work*; the work changes too much for a grand upfront plan, so moments must be small and reactive |
| 2026-10-17 | Entry is typing `/co-learn` as a "password" (shown as the placeholder) | Plain landing page | Frames the prototype as a mode that could ship inside Claude; a playful first action. Not security |
| 2026-10-17 | Target user: working professional. Demo: training an ML model. Default session: 10 min | Students; longer sessions | Professionals are the users doing AI-assisted work; 10 min lets reviewers finish a full session |
| 2026-10-17 | Free-form questions, with multiple choice as a fallback when the user struggles | MC first | Free recall is stronger for learning; the MC fallback keeps the success rate in the target band |
| 2026-10-17 | Story rewards: surprise genre, lightly themed to the work | User picks genre | Surprise is part of the reward; light theming connects it to the work |
| 2026-10-17 | Use the provided API key; generous per-browser/IP daily spend cap; open link with rate limit (no passcode) | Passcode; BYO key | Frictionless for reviewers; caps only exist to prevent abuse |
| 2026-10-17 | Accepted principle revisions P2, P5, P8, P9; P3/P4 and P7 pending clarification | — | See `docs/design-principles.md` |
| 2026-10-17 | Claude effort: **high** for planning, **medium** for per-turn execution | Medium/low (cheaper, faster) | Planning quality matters most and happens rarely; per-turn calls need a balance of quality and latency |
| 2026-10-17 | Work-first with injected learning moments (accepted) | Teach first, collaborate at boss level | See product vision: matches the brief, respects professionals' goals, just-in-time learning transfers better |
| 2026-10-17 | Accepted P3/P4 (always explain why) and re-scoped P7 (user stays the decision-maker) | — | Feedback makes mistakes useful; agency is central to Option B and the rubric |
| 2026-10-17 | Learning moments: **no limits by default**, shown whenever a high-value moment arises; opt-in guardrails (Light / Balanced / Strict) as soft caps | Default budget of 3–5 per 10 min | Interactions vary in how ripe they are for learning; a quality bar beats a fixed quota. Default to be tuned with real usage data later |
