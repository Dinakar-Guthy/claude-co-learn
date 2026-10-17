# ASCII character sheet

Multi-line ASCII faces/characters for guides, reactions, and bosses. Plain ASCII only, so they render
anywhere in a monospace `<pre>` block with no image assets. Claude can also generate new characters on the fly
(it's plain text, so there's no injection risk once rendered as text, not HTML).

## Guide: "Pip" the robot (reaction states)

```
 neutral        happy          thinking        celebrating     encouraging
  .-----.        .-----.        .-----.  ?     \.-----./        .-----.
  | o o |        | ^ ^ |        | o O |         | ^ ^ |         | o o |
  |  -  |        | \_/ |        |  ~  |         | \O/ |         |  u  |
  '-----'        '-----'        '-----'         '-----'         '-----'
```

## Mentors

```
 Owl (wise mentor)    Cat (companion)     Wizard
    ,___,               /\_/\                /\
    {o,o}              ( o.o )              /**\
    /)__)               > ^ <              /____\
    -"-"-              /     \             (o.o)
                                           /|_|\
```

## Bosses

```
 Slime (mini-boss)      Ghost (mini-boss)     The Bug (boss)
      ______               .-.                 \    /
    /        \            (o o)               (o)  (o)
   |  O    O  |           | O |              /|------|\
   |    __    |           |   |               |      |
    \________/            '~~~'              /|------|\
                                               \____/
```

## Boss states (example: The Bug)

```
 full HP              hit                 defeated
   \    /              \    /               x    x
  (o)  (o)            (>)  (<)             (-)  (-)
 /|------|\          /|------|\           _|______|_
  |      |            |  !!  |            zzz
 /|------|\          /|------|\
   \____/              \____/
```

## Notes
- Render in a monospace font and keep characters ≤ 6 lines × 20 columns so they fit on mobile.
- Pair reactions with the answer result: happy/celebrating for correct answers, encouraging for wrong ones (never sad or angry).
- Boss "hit" frames can alternate with a 2px shake animation for feedback without clutter.
