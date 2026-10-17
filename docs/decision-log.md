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
