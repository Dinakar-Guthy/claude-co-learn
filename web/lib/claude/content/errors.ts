/** Typed failures from content-generation calls (API transport errors stay as Anthropic.APIError subclasses). */

export class ContentError extends Error {
  constructor(
    readonly task: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The model (and any server-side fallback) declined the request: `stop_reason: "refusal"`. */
export class ContentRefusalError extends ContentError {
  constructor(
    task: string,
    readonly category: string | null,
  ) {
    super(task, `${task}: the model declined this request${category ? ` (${category})` : ""}`);
  }
}

/** Output was still cut off at max_tokens after one retry with a larger budget. */
export class ContentTruncatedError extends ContentError {
  constructor(task: string) {
    super(task, `${task}: output hit max_tokens twice`);
  }
}

/** The response had no usable structured output (missing text, invalid JSON, or schema mismatch). */
export class ContentShapeError extends ContentError {
  constructor(task: string, detail: string) {
    super(task, `${task}: ${detail}`);
  }
}
