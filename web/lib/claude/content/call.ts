/**
 * One structured Claude call: JSON-schema output from a zod schema, stop_reason checks, one retry on
 * max_tokens, and usage metering.
 *
 * We call `messages.create` with the zod output format and validate the text ourselves rather than
 * using `messages.parse`: `parse` throws on a refused or truncated (invalid-JSON) body before
 * `stop_reason` can be inspected, so refusals would surface as generic parse errors.
 *
 * Sonnet/Opus go through the beta namespace to opt into server-side refusal fallbacks; Haiku has no
 * server-side fallback, so it uses the GA namespace.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { anthropic } from "@/lib/claude/client";
import type { ModelRoute } from "@/lib/claude/models";
import { ContentRefusalError, ContentShapeError, ContentTruncatedError } from "./errors";
import { reportUsage, type ApiUsage } from "./usage";

export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export interface StructuredRequest<S extends z.ZodType> {
  task: string; // short label for errors, e.g. "gradeAnswer"
  route: ModelRoute;
  system: string;
  user: string;
  schema: S;
  timeoutMs?: number;
}

interface NormalizedResponse {
  model: string;
  usage: ApiUsage;
  stopReason: string | null;
  refusalCategory: string | null;
  text: string | null;
}

export const supportsServerFallback = (model: string) => /^claude-(opus|sonnet)-/.test(model);

export async function callStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<z.infer<S>> {
  let maxTokens = req.route.maxTokens;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await send(req, maxTokens);
    await reportUsage(res.model, res.usage);
    if (res.stopReason === "refusal") throw new ContentRefusalError(req.task, res.refusalCategory);
    if (res.stopReason === "max_tokens") {
      maxTokens *= 2;
      continue;
    }
    return parseOutput(req, res.text);
  }
  throw new ContentTruncatedError(req.task);
}

function parseOutput<S extends z.ZodType>(req: StructuredRequest<S>, text: string | null): z.infer<S> {
  if (!text) throw new ContentShapeError(req.task, "response had no text block");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ContentShapeError(req.task, "response was not valid JSON");
  }
  const parsed = req.schema.safeParse(json);
  if (!parsed.success) throw new ContentShapeError(req.task, `schema mismatch: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  return parsed.data;
}

/** With fallbacks, a declined model's partial text can precede the fallback's output: the last text block wins. */
function lastText(blocks: ReadonlyArray<{ type: string }>): string | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.type === "text") return (b as Anthropic.TextBlock).text;
  }
  return null;
}

async function send<S extends z.ZodType>(req: StructuredRequest<S>, maxTokens: number): Promise<NormalizedResponse> {
  const { route, system, user } = req;
  const messages = [{ role: "user" as const, content: user }];
  const options = req.timeoutMs ? { timeout: req.timeoutMs } : undefined;

  if (supportsServerFallback(route.model)) {
    const res = await anthropic().beta.messages.create(
      {
        model: route.model,
        max_tokens: maxTokens,
        system,
        messages,
        output_config: { effort: route.effort, format: betaZodOutputFormat(req.schema) },
        betas: [FALLBACK_BETA],
        fallbacks: "default",
      },
      options,
    );
    return {
      model: res.model,
      usage: res.usage,
      stopReason: res.stop_reason,
      refusalCategory: res.stop_details?.category ?? null,
      text: lastText(res.content),
    };
  }

  const res = await anthropic().messages.create(
    {
      model: route.model,
      max_tokens: maxTokens,
      system,
      messages,
      output_config: { effort: route.effort, format: zodOutputFormat(req.schema) },
    },
    options,
  );
  return {
    model: res.model,
    usage: res.usage,
    stopReason: res.stop_reason,
    refusalCategory: res.stop_details?.category ?? null,
    text: lastText(res.content),
  };
}
