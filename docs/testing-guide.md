# Manual testing guide (2026-10-19)

Everything to test before submission, most important first. Tick boxes as you go; report anything off as
**section + step, what you did, what you expected, what happened** (a screenshot helps). If time runs short,
Tier 1 alone covers the paths in the video and the ones reviewers are most likely to try.

## Setup
- **URL:** https://anthropic-take-home-10-17-26.vercel.app/?test=1, then the site password.
  - `?test=1` tags that tab's traffic as test (a "Test traffic (this tab)" badge), so it stays out of `/insights`. Open every new tab with it. `?test=0` or closing the tab ends it.
- **Fresh user:** Settings (gear) → Your data → Reset my data → Yes, reset. Or "Start over as a new user" on the "Welcome back" screen.
  - **Expect:** the entry screen; level 1 and the Frost theme next session; an empty Codex.
- **Browsers:** run Tier 1 in Chrome; then spot-check Safari and a phone (section T3-A). Sound on.
- **Spend:** a full session costs roughly $0.30-$1. Daily caps: $5 per browser, $25 per IP, $75 global.

---

## Tier 1: the main paths (do these first)

### A. Entry
- [ ] **A1.** Go to `/`. **Expect:** "Type /co-learn or /learn to begin".
- [ ] **A2.** Type `/co-learn` (sound on). **Expect:** an unlock chime, then "What are you working on?" (or "Welcome back!" with past sessions and dates).
- [ ] **A3.** On the intent screen, switch between "Work on something" and "Learn a topic". **Expect:** the heading and sample button change ("Try the demo" / "Try a sample: the fall of the Roman Republic").
- [ ] **A4.** Type `/learn` on the home page instead. **Expect:** "What do you want to learn?" directly.

### B. Co-learn demo (the video's hero path)
Start: "▶ Try the demo" → "Some experience" → 10 min → "Let's go".
- [ ] **B1.** **Expect:** the workspace opens; Claude starts loading the CSV right away; status lines while it works.
- [ ] **B2.** First question (usually spot the issue: target leakage). **Expect:** a question card with a concept card on first exposure, and the work paused at a real decision, not mid-explanation.
- [ ] **B3.** Answer it well. **Expect:** feedback, +10 XP, and Claude *does* the settled work (e.g. drops the leaky column, encodes, splits) before the next question, instead of asking again straight away.
- [ ] **B4.** Answer one wrongly on purpose. **Expect:** "Not quite", a hint-style why (not the answer), then "Try it with options". Pick one: your pick and the best answer highlighted, with the full why.
- [ ] **B5.** A predict question. **Expect:** "Locked in!", then a Prediction check card graded against the real code output once it runs.
- [ ] **B6.** A decide question (e.g. which metric). **Expect:** your choice shapes the next code Claude runs.
- [ ] **B7.** No stray "◆ x" dividers anywhere.

### C. Help tools (on any open question)
- [ ] **C1.** "Give me a hint", then "Another hint". **Expect:** two 💡 hints that point the way without the answer; the button disappears after two. Answering correctly after a hint: +8 XP.
- [ ] **C2.** "Help me learn this" → "Teach me the idea first". **Expect:** a short lesson with a worked example on a *different* scenario, ending with an invitation to try. Correct after this: +5 XP.
- [ ] **C3.** In "Ask Claude…", ask "what does leakage mean?". **Expect:** an explanation, not the answer.
- [ ] **C4.** Ask "just tell me the answer". **Expect:** a kind nudge to guess first. Ask again. **Expect:** "The answer" box, "Got it. This one will come back for a quick review later.", and the work continues (no XP).
- [ ] **C5.** "Skip" on a question. **Expect:** a "See the answer" link on the skipped line; Claude carries on.
- [ ] **C6.** On an answered question, "Ask Claude why". **Expect:** Claude explains openly.
- [ ] **C7.** "⚑ Report question" on a graded question. **Expect:** it's flagged and its XP is taken back (never dropping you a level).

### D. Bosses (after ~3 concepts, at a milestone)
- [ ] **D1.** **Expect:** "A boss approaches!" with "Take it on" / "Keep working" (Learn: "Keep learning"). The time's-up prompt never shows at the same time.
- [ ] **D2.** "Keep working". **Expect:** work continues; the offer returns at the next milestone. Reloading while the offer is showing keeps it. Typing a message counts as "Keep working".
- [ ] **D3.** "Take it on". **Expect:** a short wait (~25s), then the boss card with ASCII art, HP and "Question 1 of N". Hints work; "Help me learn this" isn't offered. Feedback stays until "Next question →".
- [ ] **D4.** Win. **Expect:** bonus XP (confetti if flawless); in Co-learn the work resumes right away with no story chapter.
- [ ] **D5.** Another time, "Skip this boss". **Expect:** "You let … go. It'll be back another time.", and Claude resumes.

### E. Wrap-up (Co-learn)
- [ ] **E1.** On a predict question, "Quiz me later". **Expect:** "Saved a question … for your wrap-up quiz"; Claude carries on.
- [ ] **E2.** "Wrap up session" (or the time's-up prompt → "Wrap up"). **Expect:**
  - the quick quiz; the saved predict question is now "what actually happened, and why?"
  - "See where this came up ↑" scrolls to and highlights the original spot
  - the Codex card, XP summary, suggestions (no story chapter)
  - "Learn more": 3-5 readings; open two or three, and they should load and be relevant
  - "Did you learn something?" 👍 / 👎
- [ ] **E3.** Reload the wrapped-up session. **Expect:** everything above (including "Learn more") is still there.
- [ ] **E4.** Click a suggestion. **Expect:** a fresh intent screen prefilled with that goal.

### H. Learn mode (the coda in the video)
Start: `/learn` → "▶ Try a sample: the fall of the Roman Republic" → a familiarity → 10 min → "Let's go".
- [ ] **H1.** **Expect:** the "Your path · Part 1 of 3" card within ~7s; the first lesson around 15s *(once the "lesson as soon as it's written" change ships; until then ~25s, together with the question)*; then the question card.
- [ ] **H2. Lesson quality:** about 120 words, concrete (people, causes, a telling detail), pitched at your familiarity, and with no question repeated inside it.
- [ ] **H3. Sources:** [n] markers in the lesson, numbered links underneath. Check: every marker number has a matching link (no [5] when only 4 are listed); the links load; they're mostly encyclopedias, university, museum, or government pages rather than blogs.
- [ ] **H4.** Question types vary across the session: Take a position, What happened next?, Spot the myth, Explain it back, Fill the gap. A "What happened next?" answer is graded right away against what really happened.
- [ ] **H5. Path card:** open it; parts not started have Next / ↑ / ↓. Move a part up, or pick Next. **Expect:** the tutor follows the new order on the next turn. The card collapses to one line while you read.
- [ ] **H6.** At the end of a part, the path ticks it done and Claude goes straight into the next part (no "shall we continue?").
- [ ] **H7.** Ask a side question mid-lesson (e.g. "who were the optimates?"). **Expect:** a short sourced answer, then back to the current part.
- [ ] **H8.** Ask to change direction (e.g. "skip ahead to Caesar"). **Expect:** a revised path; finished parts stay done.
- [ ] **H9. Boss + story:** take a boss after ~3 concepts. **Expect:** questions built from the lessons; afterwards a story chapter of 100-150 words, easy to follow, whose world clearly echoes the topic (for Rome: senators, assemblies, legions, a contested city), with invented characters rather than retold history.
- [ ] **H10. Wrap-up:** Codex, a final story chapter that resolves the thread, "Learn more" readings, and "Teach me…" suggestions. Click one. **Expect:** a new Learn session on that topic.
- [ ] **H11.** Your own topic (e.g. "how vaccines train the immune system", or something you know well). **Expect:** a sensible path, accurate lessons (spot-check against what you know), a story themed to *that* topic.
- [ ] **H12.** No primer card in Learn mode; the top bar shows the Learn badge.

---

## Tier 2: features around the main paths

### A2. Novice primer (Co-learn, "New to this")
- [ ] Within ~20s of starting, a "60-second primer" card at the top: 3-4 key ideas plus a warm-up question.
- [ ] Answer the warm-up. **Expect:** the best answer highlighted, a why, +5 XP.
- [ ] "Skip" or "Done", then reload. **Expect:** it stays hidden.
- [ ] With "Some experience" or "Comfortable": no primer.

### Sources in Co-learn
- [ ] Ask a conceptual question (e.g. "why does class_weight='balanced' distort probabilities?"). **Expect:** "Looking up sources…", then an answer with [n] markers and links underneath; the numbers match.

### F. Rewards, settings, Codex, insights
- [ ] **F1. Level-up:** around 100 XP total, the "Level 2!" toast with "Try it" (Sunset theme). It auto-dismisses after 12s. Reload: no flash of the Frost theme.
- [ ] **F2. Settings (gear):** sound and volume; guardrails (Light / Balanced / Strict; Strict should mean fewer questions); "Offer boss challenges" (off = no more offers); theme and sound-pack pickers (locked ones say "Reach level N"); past sessions; "How Co-learn is doing" → `/insights`.
- [ ] **F3. Codex:** the book icon → `/codex`. Concepts grouped by status (shaky ones under "Review next time"); "Back to your session".
- [ ] **F4. Spaced review:** start a second session on a related topic. **Expect:** Claude may bring back a "Review next time" concept when the work touches it (not forced).
- [ ] **F5. Insights:** `/insights` with the 1 / 7 / 30-day selector. Your test tabs are excluded; toggle "Include test traffic" and they appear.

### G. A non-demo Co-learn task
- [ ] e.g. "Help me write a SQL query for our top 10 customers by revenue last quarter." **Expect:** a decide moment (e.g. which order statuses count as revenue), then a query built on your choice.

### Sessions and reloads
- [ ] **Resume:** close the tab mid-session, reopen the site. **Expect:** "Welcome back!" lists it; opening it restores the transcript, XP, path card (Learn), and any open question.
- [ ] **Reload mid-turn** (while Claude is working). **Expect:** no duplicated messages; the session continues sensibly.
- [ ] **Reload during a boss offer / mid-boss.** **Expect:** the offer or boss is still there.
- [ ] **Time's up:** on a 10-min session, let the timer run out. **Expect:** a gentle prompt to wrap up or keep going, never on top of a boss offer.
- [ ] **Long session:** after many turns, a status line "Tidying up my notes so far… (a few extra seconds)" may appear once; the session carries on normally.

---

## Tier 3: polish and edge cases

### T3-A. Browsers and devices
- [ ] **Safari (Mac):** run B1-B4 and H1-H3. Check the fonts, the theme, sound after the first click, and that the input is usable.
- [ ] **Phone:** open the URL, log in, start the Learn sample. Check that the path card, question cards, help buttons and boss card fit the width with no horizontal scrolling, and that the keyboard doesn't cover the input.
- [ ] **Dark vs. light system setting** (if themes follow it): text stays readable.

### T3-B. Edge cases
- [ ] **Empty or junk input** on the intent screen. **Expect:** a polite prompt, no crash.
- [ ] **Off-topic or unsafe request** (e.g. something harmful). **Expect:** a polite decline that stays in character.
- [ ] **Very long answer** pasted into a question. **Expect:** graded normally or kindly trimmed.
- [ ] **Double-click** "Submit" or "Let's go". **Expect:** only one submission.
- [ ] **Wrong site password.** **Expect:** a clear error; the right one works.
- [ ] **Reset my data**, then check that the Codex, past sessions and level are all cleared.

### T3-C. Tone and feel (a judgment pass)
- [ ] Feedback never feels punishing (no lost levels, kind copy on misses and skips).
- [ ] Questions feel worth answering (not trivia), and in Co-learn they don't break your flow.
- [ ] Sounds and confetti are pleasant, not noisy. Pip and the boss art render correctly.

---

## After testing
- Report issues one at a time or in a batch; Claude reproduces each in a test-mode tab, fixes it with tests, and pushes small commits.
- Product or design changes get options first; small bug fixes go straight in.
