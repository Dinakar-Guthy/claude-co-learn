import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/** Server-only Anthropic client. Reads ANTHROPIC_API_KEY from the environment. */
export function anthropic(): Anthropic {
  if (typeof window !== "undefined") throw new Error("anthropic() is server-only");
  client ??= new Anthropic();
  return client;
}
