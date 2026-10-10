/**
 * A shot's own prohibition, held against the words its prompt takes from elsewhere.
 *
 * The scene a director writes is not the whole prompt. `boxShot` appends, to every shot that points at them, the
 * project's entities in THEIR OWN words — a place, a prop, each person cast — and those words are the same in every
 * shot. So a correction made on the shot ("No visible ACME lettering.") is undone at the last step when a character's
 * description still asks for the thing ("…walking the cleared strokes of the ACME monogram"): the image model is told
 * both, and draws the one that is described. That happened on 9 Oct 2026 and was caught by reading prompts by hand.
 *
 * This is the check, made where the prompt is composed, so the page, the request preview and the MCP driver all get
 * it: a NAME the shot's own words forbid must not be asked for by an entity's words.
 *
 * It is deliberately narrow. Only names are held — a word written in capitals ("ACME", "CRT") or a capitalised word
 * that does not open its sentence ("Maybach") — because a name means one thing wherever it appears; a common word
 * ("letters", "paths") does not, and blocking on it would stop shots that have no contradiction. Only the entities'
 * lines are held, not a linked shot's: what a screen in the shot shows is another picture and may hold anything.
 *
 * Pure: no react, no supabase, no project knowledge.
 */

export type PromptConflict = {
  /** The name the shot forbids. */
  name: string;
  /** The shot's own sentence that forbids it. */
  forbiddenBy: string;
  /** The added sentence that asks for it. */
  askedBy: string;
  /** Whose words that sentence is ("The models", "the place"), as the caller labels them. */
  from: string;
};

const sentencesOf = (text: string): string[] =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(<])/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * A sentence of the shot that says what must NOT be in the picture: it opens with the refusal ("No visible …",
 * "Never …", "Without …") or says "must not show". A sentence that refuses everything BUT something ("Nobody but
 * Fendi…", "No light except the Maybach's") names what it keeps, so it forbids no name.
 */
export function isProhibition(sentence: string): boolean {
  const s = sentence.trim();
  if (/\b(but|except|other than|apart from|only)\b/i.test(s)) return false;
  return /^(no|never|without|nothing|nobody|none)\b/i.test(s) || /\b(no visible|must not (show|appear|be visible|be seen)|must never (show|appear))\b/i.test(s);
}

/** A sentence of an entity that itself refuses or negates — it is not asking for what it names. */
function denies(sentence: string): boolean {
  return /^(no|never|without|nothing|nobody|none)\b/i.test(sentence.trim()) || /\b(no|not|never|without|n't)\b/i.test(sentence);
}

/** The names in a sentence: words written in capitals, and capitalised words that do not open it. */
export function namesIn(sentence: string): string[] {
  const words = sentence.match(/[A-Za-z][A-Za-z0-9'’-]*/g) ?? [];
  const names = new Set<string>();
  words.forEach((raw, i) => {
    const w = raw.replace(/['’]s$/i, "");
    if (/^[A-Z][A-Z0-9]+$/.test(w)) names.add(w);
    else if (i > 0 && /^[A-Z][a-z]/.test(w)) names.add(w);
  });
  return [...names];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The names `own` forbids that `added` asks for. `own` is the shot's scene in its own words (frame, scene, direction,
 * place, required elements); `added` is each entity's line, labelled with whose it is.
 */
export function promptConflicts(own: string, added: readonly { from: string; text: string }[]): PromptConflict[] {
  const forbidden: { name: string; sentence: string }[] = [];
  for (const sentence of sentencesOf(own)) {
    if (!isProhibition(sentence)) continue;
    for (const name of namesIn(sentence)) if (!forbidden.some((f) => f.name === name)) forbidden.push({ name, sentence });
  }
  if (forbidden.length === 0) return [];
  const out: PromptConflict[] = [];
  for (const a of added) {
    for (const sentence of sentencesOf(a.text)) {
      if (denies(sentence)) continue;
      for (const f of forbidden) {
        if (!new RegExp(`\\b${escape(f.name)}\\b`).test(sentence)) continue;
        if (out.some((c) => c.name === f.name && c.from === a.from)) continue;
        out.push({ name: f.name, forbiddenBy: f.sentence, askedBy: sentence, from: a.from });
      }
    }
  }
  return out;
}

/** The conflicts as one message for the director: what collides, whose words, and the two ways out. */
export function conflictMessage(conflicts: readonly PromptConflict[]): string {
  const each = conflicts.map((c) => `this shot says “${c.forbiddenBy}” and ${c.from} says “${c.askedBy}”`);
  return `The shot forbids something its own prompt then asks for: ${each.join("; ")}. Change the description of ${[...new Set(conflicts.map((c) => c.from))].join(", ")}, or the shot's own words, so they agree. Nothing was generated.`;
}
