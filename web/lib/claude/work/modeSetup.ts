/** The system prompt and tools for each mode. Both must stay stable per mode (prompt cache, preserved thinking). */
import type Anthropic from "@anthropic-ai/sdk";
import type { SessionMode } from "@/lib/modes";
import { LEARN_SYSTEM } from "./learnPrompt";
import { WORK_SYSTEM } from "./prompt";
import { LEARN_TOOLS, WORK_TOOLS } from "./tools";

export function modeSetup(mode: SessionMode): { system: Anthropic.Beta.BetaTextBlockParam[]; tools: Anthropic.Beta.BetaToolUnion[] } {
  return mode === "learn" ? { system: LEARN_SYSTEM, tools: LEARN_TOOLS } : { system: WORK_SYSTEM, tools: WORK_TOOLS };
}
