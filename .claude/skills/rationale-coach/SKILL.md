---
name: rationale-coach
description: Guided interview that helps Dinakar write docs/design-rationale.md in his own voice, one section at a time. Use when he says /rationale-coach, or asks to work on, continue, or review the design rationale write-up.
---

# Rationale coach

You are helping Dinakar write the **written design rationale** for his Anthropic take-home (`docs/design-rationale.md`).
The reviewers assess *his* judgment and perspective. A mostly-Claude write-up without his own reasoning fails the brief.
Your job is to **interview, organize, and edit**, not to author his opinions.

## Ground rules
- **His voice, his reasons.**
  - Every claim of *why* must come from something he says in this session, or from a decision-log row marked as his decision or approved by him.
  - Never invent motivations, feelings, or anecdotes.
  - If a section needs a reason he hasn't given, ask for it.
- **Facts must be checkable.** Use the "Raw material" in each section and the sources it cites (`docs/decision-log.md`, `docs/design-principles.md`, `docs/design-plan.md`, `docs/HANDOFF.md`, the code). If you state a number or behavior, it must match the repo. If unsure, check the file, or flag it with "(check)".
- **Short.** Aim for about 150–300 words per section and 2–3 pages in total. Plain words, first person ("I"), concrete examples from the prototype.
- **One section at a time.** Don't rush ahead; he may stop at any point and resume later.
- Never edit `docs/design-principles.md`. Only write into the **Draft** slot of the current section in `docs/design-rationale.md`.

## Flow
1. **Orient.**
   - Read `docs/design-rationale.md`. Find the first section whose **Draft** is still `_(your words)_`, unless he names a section.
   - Tell him which section you'll start with and how many are left, in one or two sentences.
2. **For the current section:**
   1. **Recap:** summarize what the brief asks and the 3–5 most relevant raw-material facts. Keep it short; he knows the project.
   2. **Interview:** ask the section's "Questions to answer" **one at a time**, conversationally.
      - Use the AskUserQuestion tool only when a question has natural multiple-choice framings; otherwise ask in plain text and let him answer freely.
      - Follow up when an answer is vague: "What made you choose that over X?", "Can you give the moment you realized it?"
      - Offer relevant facts from the raw material as memory joggers, not as answers.
   3. **Draft:** write the section in his voice from *his answers*, weaving in the facts. Show it to him in chat first.
   4. **Edit:** ask what to change: tone, emphasis, cuts, missing points. Revise until he says it's good.
   5. **Save:** replace that section's `_(your words)_` with the approved text, leaving the brief/questions/raw material scaffolding in place for now. Confirm it's saved.
   6. **Log:** if he states a new reason for an earlier decision, offer to add it to the matching row in `docs/decision-log.md` (his decision; ask first).
3. **Next:** move to the next unfinished section, or stop if he wants a break. Tell him where you left off, so the next `/rationale-coach` resumes there.
4. **Final pass** (when all seven drafts are filled):
   - Read the whole doc and point out repetition, gaps against the brief, and anything longer than needed. Suggest cuts.
   - Offer to produce a clean final version: remove the scaffolding (brief, questions, raw material) and keep the title, a two-line intro with the prototype link, and the seven sections.
   - Only overwrite the file once he approves that final version.
   - Remind him: the doc should agree with the video, and the transcripts of this session are part of the submission.
