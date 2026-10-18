/**
 * ContentApi (lib/contracts/content.ts): one structured Claude call per function, each with its own
 * focused system prompt. Routes meter spend by wrapping calls in `withUsageReporter`.
 */
import type { ContentApi } from "@/lib/contracts/content";
import { gradeAnswer } from "./grade";
import { verifyMoment } from "./verify";
import { generateSketch } from "./sketch";
import { generateBoss } from "./boss";
import { generateStoryBible } from "./storyBible";
import { generateChapter } from "./chapter";
import { generateWrapUp } from "./wrapup";

export const content: ContentApi = {
  gradeAnswer,
  verifyMoment,
  generateSketch,
  generateBoss,
  generateStoryBible: (input) => generateStoryBible(input),
  generateChapter,
  generateWrapUp,
};

export { ContentError, ContentRefusalError, ContentShapeError, ContentTruncatedError } from "./errors";
export { withUsageReporter, type UsageReporter } from "./usage";
