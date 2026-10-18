/**
 * Tools for the work model: Anthropic's code execution plus our three strict function tools.
 * The input schemas are hand-written to mirror the zod contracts in lib/contracts/moment.ts, because strict
 * tool schemas don't accept length/number/array-size constraints. Zod still validates every input at runtime
 * (with the full constraints), and tools.test.ts keeps the two in sync.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { CODE_EXECUTION_TOOL } from "@/lib/claude/models";
import { MOMENT_TYPES } from "@/lib/contracts/moment";

export const LEARNING_MOMENT = "learning_moment";
export const RESOLVE_PREDICTION = "resolve_prediction";
export const MILESTONE_REACHED = "milestone_reached";

type JsonSchema = Record<string, unknown>;

const str = (description: string): JsonSchema => ({ type: "string", description });
const strArray = (description: string): JsonSchema => ({ type: "array", items: { type: "string" }, description });
const obj = (properties: Record<string, JsonSchema>, optional: string[] = []): JsonSchema => ({
  type: "object",
  properties,
  required: Object.keys(properties).filter((k) => !optional.includes(k)),
  additionalProperties: false,
});

export const learningMomentSchema = obj(
  {
    type: { type: "string", enum: [...MOMENT_TYPES], description: "Moment type (see the guide in the system prompt)." },
    concept: str("Short canonical concept name, e.g. \"class imbalance\" (max 60 chars). Reuse the same name for the same concept."),
    concept_card: str("Mini lesson shown before the question. Include on first exposure; at most 60 words."),
    question: str("One clear question about the learner's actual work, answerable in 1-3 sentences. Never include the answer."),
    ideal_answer: str("A model answer (hidden from the learner)."),
    rubric: obj(
      {
        key_points: strArray("1-6 points a good answer must make."),
        acceptable_variants: strArray("Other defensible answers (up to 6)."),
        misconceptions: strArray("Likely wrong ideas to watch for (up to 6)."),
      },
      ["acceptable_variants", "misconceptions"],
    ),
    mc_fallback: obj({
      options: strArray("3-4 multiple-choice options, shown only if the learner struggles."),
      correct_index: { type: "integer", enum: [0, 1, 2, 3], description: "Index of the best option." },
      why: strArray("One short explanation per option, same order and length as options."),
    }),
    difficulty: { type: "integer", enum: [1, 2, 3, 4, 5], description: "1 (easy) to 5 (hard), aimed at the target difficulty in the turn context." },
    first_exposure: { type: "boolean", description: "True if this concept hasn't come up for this learner yet." },
    learning_value: { type: "integer", enum: [1, 2, 3, 4, 5], description: "Honest learning value on the 1-5 scale in the system prompt." },
    value_reason: str("One line: why this matters for this learner's goal right now."),
    costly_mistake: { type: "boolean", description: "True if the learner is about to make a choice with real consequences." },
    timing: { type: "string", enum: ["before_step", "after_step"], description: "before_step for decide/predict; after_step for explain_back/spot_issue." },
  },
  ["concept_card"],
);

export const resolvePredictionSchema = obj({
  moment_id: str("The id of the predict moment, as given in the learner's response."),
  actual_result: str("The real result from the code you just ran, in one or two sentences with the key number(s)."),
  verdict: { type: "string", enum: ["correct", "partial", "incorrect"], description: "How the learner's prediction compares to the real result." },
  why: str("1-2 friendly sentences explaining why the result came out this way."),
});

export const milestoneSchema = obj({
  label: str("Short label for the completed chunk of work, e.g. \"First model trained\"."),
  summary: str("What was done and the key real results (metrics), in 1-3 sentences."),
  concepts_involved: strArray("Concepts the learner worked with in this chunk (up to 10)."),
});

const functionTool = (name: string, description: string, schema: JsonSchema): Anthropic.Beta.BetaTool => ({
  name,
  description,
  strict: true,
  input_schema: schema as Anthropic.Beta.BetaTool.InputSchema,
});

/** Stable, deterministic tool list (rendered first in the prompt, so it must never vary between requests). */
export const WORK_TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  CODE_EXECUTION_TOOL,
  functionTool(
    LEARNING_MOMENT,
    "Pause the work and give the learner a short challenge about what is happening in their work right now. " +
      "Call it INSTEAD of continuing when a genuinely valuable learning opportunity comes up. The app may show it " +
      "(the turn then ends and waits for the learner) or skip it (you get {status:\"skip\"} and simply keep working). " +
      "Never answer the question yourself.",
    learningMomentSchema,
  ),
  functionTool(
    RESOLVE_PREDICTION,
    "After running the code that reveals the answer to a predict moment, record how the learner's prediction " +
      "compared with the real output. The app shows the reveal and awards XP.",
    resolvePredictionSchema,
  ),
  functionTool(
    MILESTONE_REACHED,
    "Mark that a meaningful chunk of work just completed (e.g. data explored, first model trained, model improved). " +
      "If the result says boss_due:true, stop and wait.",
    milestoneSchema,
  ),
];
