# Co-learn: Anthropic Education Labs take-home (Full Stack Engineer)

**Co-learn** is a Claude mode where a professional does real work with Claude and comes out more capable.
Claude collaborates on the task normally, including running real code. At high-value moments it pauses
and turns the work into a short challenge the learner solves themselves. The learner's answers steer the work.

- **Live prototype:** https://anthropic-take-home-10-17-26.vercel.app (the access password is in the submission)
- **Try it:**
  1. Type `/co-learn`.
  2. Click **Try the demo: train a churn model** and pick a familiarity and time (10 min).
  3. Or type `/learn` for **Learn mode** (study a topic with Claude as a tutor) and try the sample: the fall of the Roman Republic.
- **Option chosen:** B, learning through collaboration with Claude
- **Deadline:** Oct 21, 2026, 9:00 AM PT

## What's in the prototype
- **The work loop:**
  - Claude (Sonnet 5.5) works in Anthropic's code-execution sandbox on a seeded churn dataset: real code, real metrics, real charts.
  - It proposes learning moments through a `learning_moment` tool (decide / predict / explain back / spot the issue / fill the gap).
  - A small deterministic **pacing engine** (`web/lib/engine/`) decides which moments to show and how hard they are. Mastery is Elo-style, with target success bands.
- **Answering:**
  - Free-form answers first, graded with a short "why".
  - A multiple-choice fallback after a miss.
  - Predictions are graded against the real code output.
- **Sources you can check:** Claude web-searches before explaining a concept; cited sentences get [n] markers with links. Every session ends with **Learn more**: 3-5 real readings from a search (links are never written from memory).
- **Learn mode** (`/learn`): the same engine, question cards, help, bosses and Codex, with Claude as a tutor: a short reorderable path of parts, a ~120-word cited lesson then a question each time, and story chapters as boss rewards.
- **Help when stuck:**
  - Hints, **Teach me** (a short lesson with a worked example), and **Ask Claude**.
  - The answer is revealed only after an attempt, or after asking twice.
  - Help reduces credit.
- **Game layer:**
  - XP and levels (themes and sound packs unlock).
  - Optional **boss** challenges at milestones ("Take it on / Keep working", or "Skip this boss").
  - Story chapters as boss rewards in Learn mode only (in Co-learn the work itself carries engagement).
  - A wrap-up with a quiz of saved questions, a Codex of concepts, and suggestions for next time.
- **Across sessions:**
  - The **Codex** (`/codex`) tracks every concept.
  - Concepts due for review are passed to the next session.
- **Measuring success:** `/insights` shows anonymous, aggregate usage:
  - answer, skip and help rates
  - accuracy against the target bands
  - boss outcomes
  - small-sample retention

## Repo layout
| Path | Purpose |
|------|---------|
| `web/` | The app (Next.js 16, TypeScript, Tailwind v4, `@anthropic-ai/sdk`, Upstash Redis); see `web/README.md` |
| `docs/design-rationale.md` | Written design rationale (deliverable) |
| `docs/decision-log.md` | Every meaningful decision, the alternatives, and the reasoning |
| `docs/design-principles.md` | The design principles the product is built on |
| `docs/design-plan.md` | Build blueprint: architecture, work loop, moments, engine, data model |
| `docs/product-vision.md`, `docs/context-persistence.md` | Product vision; storage and model-context plan |
| `docs/plan.md`, `docs/HANDOFF.md` | Timeline and checklists; session handoffs (including a manual testing guide) |
| `docs/backlog.md` | Untriaged ideas for later |
| `docs/assignment-brief.md` | Summary of the assignment |
| `reference/` | Research reports and reference sheets |
| `transcripts/` | Claude Code transcripts (required for submission) |
| `alternative-projects/` | Earlier ideas, not part of the submission |
| `CLAUDE.md` | Context and working agreements for Claude Code |

## Run locally
```bash
cd web
cp .env.example .env.local   # add ANTHROPIC_API_KEY (+ Upstash KV_* vars, or it falls back to an in-memory store)
npm ci
npm run dev                  # http://localhost:3000
npm run typecheck && npm test && npm run lint && npm run build
```

## Deliverables checklist
- [x] Deployed, working prototype using the Claude API
- [x] Code in this GitHub repo
- [ ] Written design rationale (`docs/design-rationale.md`)
- [ ] Video walkthrough, ≤ 8 minutes, with screenshare
- [ ] Complete Claude transcripts (`transcripts/`)
- [ ] Submitted via Greenhouse
