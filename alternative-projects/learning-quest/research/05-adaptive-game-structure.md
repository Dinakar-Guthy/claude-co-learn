# Research: adaptive game structure

_Subagent research + design report, 2026-10-17. Most sources read as abstracts only._

## Core principle
A small deterministic **state machine in code** decides advance/remediate/boss and target difficulty. **Claude** writes content, grades, self-checks. Testable and keeps prompts short (Khan Academy: long prompts → instructions randomly ignored).

## 1. Curriculum
One strong-model call → JSON **skill graph**: 6–15 concepts (~5–8 min each, sized to time), each with id, name, Bloom-verb objective, prerequisites, misconceptions, anchor facts; grouped into 3–5 sections; plus story premise and final-boss scenario. LLM prerequisite edges are less reliable (arXiv 2504.08856, 2602.17111) → validate DAG in code; user confirms on a quick "quest map".

## 2. Generation timing
Up front: outline + story arc only (5–15s behind loading animation). Just-in-time: each unit (exposition + 3–4 questions at target difficulty), **prefetched** while user answers current. Stable prefix first for prompt caching.

## 3. Learner model
Per-concept Elo θ; question difficulty b (1–5 mapped). p = σ(θ − b); θ += K(correct − p), K≈0.4 decaying. Pick b so p ≈ 0.82.
Rules: mastered = p@b3 ≥ 0.8 and ≥3 attempts · 2 misses in a row or <60% over 4 → remediation unit on the misconception · first 2 correct at b≥4 → offer skip to mini-boss · mini-boss at half mastered, boss at all mastered (cap units/section).
Boss sampling: weight (1 − mastery) + time since seen; ~30% from prior sections (interleaving/spacing; Roediger & Karpicke 2006). Final boss samples whole graph.

## 4. Questions & grading
MCQ early (instant, distractors = misconceptions → diagnostic); free-response application for bosses, graded by Claude against a **rubric generated with the question** (LLM grading agreement ranges κ≈0 to ≈0.9 depending on rubric clarity: arXiv 2505.04645, 2511.10819). Structured outputs guarantee shape, not truth → cheap blind verifier pass; discard mismatches. Code tool for math. Feedback explains why the distractor is wrong.

## 5. Data model
User · Series(topic, scope) · Game(skill_graph, story_bible, status, pointers) · Section(concept_ids, state: units|miniboss|boss|done) · Unit(kind: lesson|remediation|side_story|miniboss|boss, exposition, story_beat) · Question(format, difficulty, stem, options, answer_key, rubric, misconception_map, verified) · Attempt(response, grade, misconception, latency) · ConceptMastery(theta, n, last_seen) · StoryState(summary, characters, open_threads).
Per call: cached prefix (rules, skill graph, story bible) + target concepts, difficulty, mastery summary, last 3–5 attempts, story summary, schema. Never the full transcript.

## Per-turn loop
Answer → grade → update Elo, log, stream feedback → state machine picks next → serve prefetched or generate+verify → prefetch next → at section end, boss call also returns `story_update`.

## Risks
Hallucination (verifier, anchor facts, report button) · too easy (apply/analyze stems, raise b if >90%) · latency (prefetch, streaming, fast model for grading) · cost (caching, batching) · story bloat (2–3 sentences/unit) · 80% target for conceptual learning untested → log data to tune.

## Sources
https://www.anthropic.com/news/introducing-claude-for-education · https://arxiv.org/html/2412.16429v2 · https://blog.khanacademy.org/khan-academys-7-step-approach-to-prompt-engineering-for-khanmigo · https://blog.duolingo.com/learning-how-to-help-you-learn-introducing-birdbrain · Nature Comms DOI 10.1038/s41467-019-12552-4 · https://arxiv.org/html/2504.08856v1 · https://link.springer.com/article/10.1007/s42979-024-02963-6 · https://arxiv.org/abs/2505.04645v1 · https://arxiv.org/html/2511.10819v2 · https://platform.claude.com/docs/en/build-with-claude/structured-outputs · https://platform.claude.com/docs/en/build-with-claude/prompt-caching
