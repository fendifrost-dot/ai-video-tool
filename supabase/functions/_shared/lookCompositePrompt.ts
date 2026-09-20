// Shared, pure helpers for the generative look-composite lane (Hero Frame
// Studio). Kept dependency-free so it can be unit-tested with vitest and also
// imported by the Deno edge function grok-image-look-composite.
//
// The look-composite lane is DISTINCT from the garment-truth lane:
//   - garment-truth  = repaint only the clothing pixels of an existing photo
//                      (needs a real garment photograph as <IMAGE_1>).
//   - look-composite = generate a NEW photoreal hero image of the SAME person
//                      described by a text prompt (no garment photograph). The
//                      identity reference anchors WHO it is; the prompt supplies
//                      the wardrobe + scene. This is the "Look B — White Ice"
//                      shape from docs/treatments/ysl-ice-on.looks.json.

export type LookCompositeInput = {
  /** Positive prompt describing the look, environment, framing. Required. */
  prompt?: string | null;
  /** Optional negative prompt — folded into the single xAI prompt string. */
  negativePrompt?: string | null;
};

export type LookCompositeValidation =
  | { ok: true; prompt: string; negativePrompt: string | null }
  | { ok: false; error: string };

/** xAI /v1/images/edits takes ONE `prompt` field — there is no separate
 *  negative-prompt parameter. Fold the negatives in as an explicit "Avoid:"
 *  clause so the model still receives them. Returns the positive prompt
 *  unchanged when there is nothing to avoid, so callers stay predictable. */
export function composeLookCompositePrompt(prompt: string, negativePrompt?: string | null): string {
  const base = (prompt ?? "").trim();
  const neg = (negativePrompt ?? "").trim();
  if (!neg) return base;
  // Collapse internal whitespace/newlines in the negative list to keep the
  // appended clause on one tidy line.
  const cleaned = neg.replace(/\s+/g, " ").trim();
  return `${base}\n\nAvoid: ${cleaned}`;
}

/** Guard the request shape before we spend an xAI call. A blank prompt is the
 *  one thing that must never reach the model — the whole lane is prompt-driven. */
export function validateLookCompositeInput(
  input: LookCompositeInput,
  opts: { maxPromptChars?: number } = {},
): LookCompositeValidation {
  const prompt = (input.prompt ?? "").trim();
  if (!prompt) return { ok: false, error: "prompt_required" };
  const max = opts.maxPromptChars ?? 6000;
  if (prompt.length > max) return { ok: false, error: "prompt_too_long" };
  const negRaw = (input.negativePrompt ?? "").trim();
  return { ok: true, prompt, negativePrompt: negRaw || null };
}
