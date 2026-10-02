/**
 * Client-side rendering of a `prompt_templates.template_body`.
 *
 * Two rules, and the second is the one that matters: every `{{slot}}` the project can
 * fill is filled, and every slot it CANNOT fill is STRIPPED. A brace that survives into
 * a prompt is a bracket placeholder shipped to a model — it reads as an instruction to
 * invent, and the output quietly drifts.
 *
 * The edge function carries its own copy of this (supabase/functions/lyric-visualizer-proxy/
 * contract.ts) because Deno cannot import from `src/`. `promptTemplate.test.ts` holds the
 * two implementations to the same output on the real seed template, so they cannot drift
 * apart silently.
 *
 * KNOWN LIMIT: what is guaranteed is that no brace and no dangling preposition survives.
 * A slot used as a bare subject or object ("Turn {{project.title}} into…") leaves a thin
 * sentence when nothing fills it. That is left alone on purpose — rewriting a sentence
 * around a missing noun needs a parser, and the real fix is a project that has a title.
 */

export type PromptTemplateContext = {
  project?: { title?: string | null; audience?: string | null } | null;
  look?: { name?: string | null; preamble?: string | null } | null;
  artist?: { name?: string | null; description?: string | null } | null;
};

/**
 * A private-use character stands in for a slot the context could not fill, so the tidy-up
 * below can see where one WAS before deleting it (a parenthetical that held only slots has
 * to go with them). U+E000 is unassigned and cannot occur in a template body.
 */
const HOLE = "\uE000";
const HOLE_GROUP_RE = /\(\s*(?:\uE000[\s:,;·—-]*)+\)/g;
/**
 * A slot governed by a preposition takes the preposition with it. Without this,
 * "a piece for {{project.audience}}: every scene…" strips to "a piece for: every scene…",
 * which is not a placeholder but is just as bad — the model reads broken prose and
 * compensates by inventing what the sentence seems to be missing.
 */
const HOLE_CONNECTOR_RE =
  /[ \t]+(?:for|to|in|of|with|as|on|at|from|by|about|into|like)[ \t]+\uE000(?=[\s,.;:!?)]|$)/gi;
const HOLE_RE = /\uE000/g;

/** Flatten a project's fields into the dotted keys the seed templates use. */
export function templateSlotsFor(
  ctx: PromptTemplateContext | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (k: string, v: unknown) => {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  };
  put("project.title", ctx?.project?.title);
  put("project.audience", ctx?.project?.audience);
  put("look.name", ctx?.look?.name);
  put("look.preamble", ctx?.look?.preamble);
  put("artist.name", ctx?.artist?.name);
  put("artist.description", ctx?.artist?.description);
  return out;
}

export function renderPromptTemplate(
  body: string,
  context: Record<string, string | null | undefined>,
): string {
  const filled = body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = context[key];
    return v != null && String(v).trim() !== "" ? String(v).trim() : HOLE;
  });
  return (
    filled
      // Drop the unfillable slots, then tidy what their removal left behind: a dangling
      // "(…)" that held only slots, doubled spaces, and a space before punctuation.
      .replace(HOLE_GROUP_RE, "")
      .replace(HOLE_CONNECTOR_RE, "")
      .replace(HOLE_RE, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([,.;:!?])/g, "$1")
      .replace(/\(\s*\)/g, "")
      .replace(/[ \t]+$/gm, "")
      .trim()
  );
}
