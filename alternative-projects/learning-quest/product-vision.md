# Product vision (v0)

Authored by Dinakar (2026-10-17). Captures the intended experience; implementation scope for the take-home TBD.

## Core loop
1. **Topic in.** User types a topic they want to learn or improve on (single text input).
2. **Scoping conversation.** The tool goes back and forth to confirm scope: how much they want to learn, how long this session should be, etc.
3. **A game is generated for this session.** One complete "video game" per session:
   - Multiple **sections**; each section has multiple **units** the user moves through.
   - A **mini-boss** mid-section (cumulative check) and a **boss** at the end of each section (cumulative Q&A / application).
   - Questions can reference earlier sections for cumulative review.
   - A **final boss** covering the whole game, separate from the last section.
   - Content and length adapt to performance (see principle 6) — nothing is fixed in advance.
4. **Epilogue → sequel.** When the game ends, an interactive epilogue suggests what to learn next (with reusable suggested choices). The user's answer seeds a **sequel game**, saved as the next game in that topic's series. Sequel length is confirmed when the user actually starts it.

## Persistence and navigation
- Returning users can **continue** a game they stopped mid-run, or **start** the next sequel.
- Users can have **multiple topics**, each its own **series** of games.
- Series → games → sections → bosses are browsable from a tab or behind the settings gear, so users can switch easily.
- Users can ask to **review / re-learn / re-focus** on a past topic interactively, which generates a **side story** for it.

## Rewards and look
- Rewards: sounds, graphics, and short unlockable stories (not necessarily about the topic — a fun reward).
- Graphics: multi-line **ASCII characters** (guide reactions, mentors, bosses) — see `reference/ascii-characters.md`. No image assets needed.
- **Permanent XP bar and player level.** XP accrues across all sessions and topics, not just one game. Levels are a
  property of the user, and each level grants a reward.
- **Level rewards unlock cosmetics:** visual themes (Sunset, Forest, Sakura, Parchment, Night Sky, Matcha) and
  **sound packs** (e.g., default soft chimes, marimba, retro 8-bit, nature) — selectable in settings behind the gear.
- One cozy, fixed default theme ("Frost": light blue / white / silver — palette in `reference/research/04-ui-themes.md`).
- **P1:** the unlockable themes and sound packs themselves; P0 ships the default theme, default sounds, and the XP bar.

## Platform and model
- Likely a hosted web app (the brief requires a deployed prototype the Anthropic team can use).
- Claude-only for now; **P1:** model-agnostic.
