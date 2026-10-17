# Learning Quest: consolidated plan (snapshot 2026-10-17)

## One-liner
Type a topic you want to learn; get a cozy, adaptive video game built just for this session, with short lessons,
questions where you apply what you learned, mini-bosses, bosses, a final boss, story rewards, and a sequel for next time.

## Principles (see `design-principles.md`)
1. Simplicity first: the landing page is a single text input; minimal on-screen clutter.
2. Feels like a video game: small rewards per correct answer, big rewards per unit/boss.
3. Teach in small doses, then apply; cumulative checks after a threshold.
4. Active application (Q&A) is the core.
5. Challenge targets by question type (accepted revision): new concept 85–90%, practice ~75–85%, boss/cumulative 65–80%; adapt on rolling accuracy.
6. Adaptive, never pre-scripted.
Accepted additions: proportional, never-punishing rewards · code decides pacing, Claude creates content · generated content is verified and learners can flag it.

## Experience
1. **Topic in** → **scoping chat** (how much, how long; 10-minute default).
2. **Quest map**: generated outline of sections and concepts; the learner confirms or edits it.
3. **Play**: each unit = 2–4 sentence exposition → free-form application questions (multiple-choice fallback if struggling) → immediate explanatory feedback → XP and sound.
4. **Mini-boss** mid-section, **boss** at section end, **final boss** across the whole game; boss questions interleave earlier sections.
5. **Story chapters** unlock at milestones: a surprise genre, lightly themed to the topic.
6. **Epilogue → sequel**: suggested next topics (reusable choices) seed the next game in the topic's series.
7. **Return**: resume mid-game, start a sequel, switch topics, or ask for a "side story" to review a concept.
8. **Progression**: a permanent XP bar and player level across all topics; levels unlock themes and sound packs (settings behind a gear).

## Architecture
- **Outline up front, content just in time.** One strong-model call builds a skill graph (6–15 concepts; objectives, prerequisites, misconceptions, anchor facts) grouped into 3–5 sections, plus the story bible. The DAG is validated in code. Units are generated when reached and **prefetched** while the learner answers.
- **Learner model in code.** Per-concept Elo: p = σ(θ − b); θ += K(correct − p). Pick difficulty b to hit the band target.
  - Remediate after 2 misses or <60% over 4 attempts.
  - Offer skip-ahead after strong early performance.
  - Mini-boss once half the section is mastered; boss once all of it is, with a cap on units per section.
  - Boss questions are weighted toward weak and stale concepts, with ~30% drawn from prior sections.
- **Questions & grading.** Free-form answers graded by Claude against a rubric generated with the question. A cheap blind verifier pass discards questions whose answers don't match their key. Structured outputs for all question objects.
- **Stories.** Fixed story bible + rolling story state; one structured call per chapter returns `{title, text, summary, updated_state}`. Variety comes from injected random seeds, because Claude 5.x models don't accept a temperature setting. Pre-generated in the background.
- **Data model.** User · Series(topic) · Game(skill_graph, story_bible, pointers) · Section · Unit(kind: lesson|remediation|side_story|miniboss|boss) · Question · Attempt · ConceptMastery · StoryState · Progress(XP, level, unlocks).
- **Context per call.** Cached prefix (rules, skill graph, story bible) + target concepts, difficulty, mastery summary, last few attempts, story summary. Never the full transcript.

## Look, sound, characters
- "Frost" theme: background `#F4F8FB`, primary `#2F6FAF`, text `#1E2A3A`, silver `#E8EEF3`; Nunito font; rounded and soft. Unlockable themes: Sunset, Forest, Sakura, Parchment, Night Sky, Matcha.
- Sounds: Kenney.nl CC0 (Interface Sounds, Music Jingles) via `use-sound`. Soft wrong-answer sound, pitch variation, rising pitch on streaks, loudness hierarchy up to the boss fanfare.
- ASCII characters for guides, reactions, and bosses (`ascii-characters.md`).
- Thin XP bar under the tabs, segmented progress, boss HP bar only during boss rounds, section map in its own tab.

## Stack
Next.js + TypeScript on Vercel (deploy from GitHub) · Vercel AI SDK + `@ai-sdk/anthropic` (model-agnostic later) ·
Opus 5.5 for outlines, Sonnet 5.5 for content and stories, Haiku 5.5 for grading and verification ·
Upstash Redis for persistence and rate limiting · key server-side only, plus a Console spend limit.
Estimated model cost: ~$0.50–1.20 per 30-minute session.

## MVP cut
**P0:** topic → scoping → quest map → one adaptive game (sections, units, mini-boss, boss, final boss) → story rewards → sounds → Frost theme → XP bar → saved progress → deployed.
**P1:** sequels and epilogue, multiple series, side stories, unlockable themes and sound packs, accounts and cross-device sync, model-agnostic providers.
