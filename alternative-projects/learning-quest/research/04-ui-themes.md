# Research: cozy UI theme

_Subagent research report, 2026-10-17._

## What makes a UI cozy
- Big radii (16–28px cards, pill buttons), soft diffuse shadows, pastel surfaces, dark readable text; one bright element at a time.
- Low stakes: no punitive red, "gentle error" color, "try again" framing (Replay journal 2024: https://czasopisma.uni.lodz.pl/Replay/article/download/24071/24087/59119).
- Borrow from: Headspace (rounded, slow easing), Duolingo (chunky progress, milestone-only celebration), Linear/Arc (restraint, tinted neutrals), Animal Crossing (pill speech bubbles).
- No pure #000/#FFF for large areas. Motion 150–300ms ease-out, no loops, respect `prefers-reduced-motion`.

## Default palette "Frost" (contrast computed by agent)
| Token | Hex | Notes |
|---|---|---|
| background | `#F4F8FB` | |
| surface | `#FFFFFF` | |
| surface-2 / silver | `#E8EEF3` | tabs, hover |
| border | `#D3DCE5` | decorative |
| primary | `#2F6FAF` | white on it 5.23:1 AA |
| primary-soft | `#DCEBF7` | text on it 11.9:1 |
| accent (sky) | `#7FB3E0` | decorative only |
| text | `#1E2A3A` | 13.6:1 |
| muted text | `#5A6B7D` | 5.13:1 |
| success | `#2E7D5B` | 5.0:1 on white |
| gentle error | `#B5524A` | 4.92:1 on white |

Avoid `#3A7BBF` for buttons (4.41:1); silver never carries text.

## Unlockable themes (bg / surface / primary / accent)
Sunset `#FFF4EC/#FFFFFF/#C2553A/#F4A261` · Forest `#F1F5EE/#FBFCF9/#3F6B4A/#A3C49A` · Sakura `#FDF3F5/#FFFFFF/#B04A6B/#F5B8C8` · Parchment `#F5ECD7/#FBF5E6/#7A4E2D/#C9A227` (+serif) · Night Sky `#141B2D/#1E2740/#8FB8FF/#F2D27A`, text `#E6ECF5` · Matcha `#F3F5EC/#FFFFFF/#55703B/#C5D6A0`

## Typography
Nunito (UI). Optional Fraunces for Parchment headings; Lexend as readability option. Avoid Quicksand body.

## Implementation
- Semantic CSS vars in `:root`, override with `[data-theme="x"]`; Tailwind v4 `@theme inline`. https://tailwindcss.com/docs/theme
- shadcn/ui uses the same token names; `--radius: 1rem`. https://ui.shadcn.com/docs/theming
- `THEMES = [{id, name, unlock:{sessions:n}, swatch}]`; unlocked IDs in storage; set `document.documentElement.dataset.theme`; inline head script to avoid flash. Locked = grey swatch + padlock + hint.
- Motion (LazyMotion) https://motion.dev ; canvas-confetti with `disableForReducedMotion` https://github.com/catdad/canvas-confetti ; skip Lottie.

## Gamification without clutter
Thin XP bar under tabs + fading "+20 XP" chip · segmented session progress · boss HP bar only in boss rounds, gentle shake, no red flash · section map as winding path in its own tab · theme-unlock toast with "Try it" · max one celebration per milestone; chat area stays clean.
