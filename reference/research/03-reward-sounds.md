# Research: open-source reward sounds

_Subagent research report, 2026-10-17. Verify licenses before shipping._

## Top sources
1. **Kenney.nl** — CC0 (no attribution, commercial OK). Interface Sounds (100 files) https://kenney.nl/assets/interface-sounds · Music Jingles (85 files) https://kenney.nl/assets/music-jingles · also UI Audio, Digital Audio, RPG Audio.
2. **Mixkit SFX** https://mixkit.co/free-sound-effects/ — free license, commercial OK, attribution appreciated not required, no standalone redistribution. Good soft chimes ("game", "notification", "magic chime"). Read license text before use.
3. **Pixabay SFX** https://pixabay.com/sound-effects/ — Pixabay Content License, no attribution; uneven quality.
Others: Freesound (CC0 filter, check per file) · OpenGameArt (mixed) · Sonniss GDC (huge, per-year terms) · Zapsplat (free tier requires attribution — skip).

## Event → sound (Kenney Interface Sounds names verified via GitHub port; jingle names not verified)
| Event | Suggestion |
|---|---|
| Click | `click_001–005` / `tick_001–002`, random |
| Select/toggle | `select_001–008`, `toggle_001–003` |
| Correct | `confirmation_001–004` or `glass_001–006` |
| Wrong (gentle) | `pluck_001/002` or `bong_001` (avoid harsh `error_*`) |
| Story unlock | `maximize_*` / `open_*` or Mixkit magic chime |
| Unit complete / level up | short rising jingle from Music Jingles (soft instruments) |
| Boss defeated | longest triumphant Music Jingle or RPG Audio; Mixkit "level complete" fallback |

## Procedural
ZzFX / jsfxr: tiny but retro-arcade (wrong vibe). Tone.js / Web Audio pentatonic chimes: license-free but tuning effort. → Use samples; Web Audio as optional fallback.

## Playback
**use-sound** (Howler.js wrapper) https://github.com/joshwcomeau/use-sound — volume, playbackRate, interrupt, sprites, global `soundEnabled`. "Semi-maintained" → fallback to Howler directly. Avoid raw HTMLAudioElement (iOS latency). Ship .mp3 + .ogg.

## UX guidelines
- Sound ON, low volume (0.3–0.5), visible mute toggle persisted.
- No sound before first interaction (autoplay policy).
- Wrong answer: soft, short, quieter than correct; encouraging copy.
- Anti-fatigue: 3–5 variants, ±5–8% pitch, streak = +1 semitone per correct; <1s (fanfares 2–3s).
- Loudness hierarchy: click < correct < unlock < level-up < boss.
- Never sound-only feedback. Credit "Sounds: Kenney.nl (CC0)".
