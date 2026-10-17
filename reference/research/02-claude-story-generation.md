# Research: Claude for reward stories

_Subagent research report, 2026-10-17._

## Verdict
**Feasible, low risk.** Few-paragraph serialized fiction is well within current Claude's ability; ~1–4¢/chapter on mid-tier models. Hard parts are engineering: continuity, variety, safety. No public creative-writing benchmark for 5.x models yet — run a side-by-side test of ~20 chapters on Sonnet 5.5 vs Opus 5.5.

Model positioning (docs): Fable 5.1 = demanding reasoning/long-horizon agentic (not creative, despite name; slowest/most expensive) · Opus 5.5 = recommended default · Sonnet 5.5 = speed/intelligence balance · Haiku 5.5 = high-volume, low latency.

## Continuity architecture
- **Story bible** (fixed per game): genre, tone, reading level, characters, setting, arc, beats per section/boss.
- **Story state** (per chapter): chapter summaries, open threads, character knowledge, user choices.
- One structured-output call per chapter → `{chapter_title, chapter_text, chapter_summary, updated_state, choices[]}`. Pass summaries, never full chapters.
- Prompt caching on system + bible (512-token minimum on 5.x; reads at 5% of input price).

## As a reward
Section = act, quiz = minor beat, boss = climax chapter. Pass `beat_type` and `user_performance` (flawless vs narrow escape). Optional light topic "motif". User picks genre/protagonist; 2–3 choices per chapter.

## Practical
Pre-generate next chapter in background; stream as fallback. Cost/chapter (~3K in, ~1.1K out, no cache): Haiku ~$0.001 · Sonnet ~$0.02 · Opus ~$0.04 · Fable ~$0.10. Recommend Sonnet 5.5 for stories, optionally Opus for climaxes.

## Risks
- **No temperature control** on 5.x (Opus/Fable 400 on temperature/top_p; Sonnet/Haiku 400 on non-default). Get variety via injected random seeds (genre, twist card, narrator voice), "vary phrasing" instruction, avoid-list of recent phrases.
- Safety: user text in delimited fields as data; Haiku classifier on themes; explicit content rating in bible; handle `stop_reason: "refusal"` with pre-written fallback chapter.

## Images/audio
Claude outputs text only. Alternatives: Claude-written inline SVG/emoji header (sanitize), pre-made art keyed by `illustration_tag`, per-genre CSS, browser speech synthesis.

## Sources
https://platform.claude.com/docs/en/about-claude/models/overview.md · https://platform.claude.com/docs/en/about-claude/pricing.md · https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md · https://platform.claude.com/docs/en/about-claude/models/migration-guide.md · https://eqbench.com/creative_writing_longform.html
