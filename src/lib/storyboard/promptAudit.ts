/**
 * A shot's own prohibition, held against the words its prompt takes from elsewhere.
 *
 * The scene a director writes is not the whole prompt. `boxShot` appends, to every shot that points at them, the
 * project's entities in THEIR OWN words — a place, a prop, each person cast, the outfit worn — and those words are the
 * same in every shot. So a correction made on the shot ("No visible ACME lettering.") is undone at the last step when
 * a character's description still asks for the thing ("…walking the cleared strokes of the ACME monogram"): the image
 * model is told both, and draws the one that is described. That happened on 9 Oct 2026 and was caught by reading
 * prompts by hand.
 *
 * This is that reading, done for every request and SAID before any money moves (the page's confirmation, the MCP
 * driver's output): a NAME the shot's own words forbid, which an entity's own words then ask for.
 *
 * It is a note, not a block, and it is narrow on purpose. Words cannot tell "No TV glow on his face" (a television
 * may still be in the room) from "No ACME logo on the wall" (ACME must not appear): both forbid a thing a name
 * describes. So the check reports and a person decides. What it holds:
 *   - only NAMES — a word in capitals ("ACME", "CRT") or a capitalised word that does not open its sentence — because
 *     a common word ("letters", "paths") means different things in different sentences;
 *   - only the thing refused, not where it is refused: "No crowd around Fendi" refuses a crowd, not Fendi, so the
 *     refused phrase ends at its first preposition; "Without looking back, Fendi walks…" refuses nothing;
 *   - only the entities' own descriptions — not a linked shot's words (a screen may show anything), and not what the
 *     shot itself says a person does.
 *
 * Pure: no react, no supabase, no project knowledge.
 */

export type PromptConflict = {
  /** The name the shot forbids. */
  name: string;
  /** The shot's own sentence that forbids it. */
  forbiddenBy: string;
  /** The sentence that asks for it. */
  askedBy: string;
  /** Whose words that sentence is ("The models", "the outfit “Denim look”"), as the caller labels them. */
  from: string;
};

const sentencesOf = (text: string): string[] =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?;])\s+(?=[A-Z0-9"“(<])/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Where a refused phrase stops being the thing refused and becomes where, whose or why. */
const PREPOSITION = /\b(?:around|about|above|across|after|against|along|among|at|before|behind|below|beneath|beside|between|beyond|by|during|for|from|in|inside|into|near|of|off|on|onto|out|outside|over|past|through|to|toward|towards|under|until|upon|with|within)\b/i;
/** A refusal that keeps something ("Nobody but Fendi", "No light except the Maybach's") names what stays. */
const KEEPS = /\b(?:but|except|other than|apart from|only|save for)\b/i;

/**
 * What a sentence of the shot refuses, as written: the phrase after an opening "No / Never / Without / Nothing" or
 * after "no visible", "must not show", "do not show", "avoid" anywhere in it — cut at the first preposition. Empty
 * when the sentence refuses nothing, keeps something, or merely opens with an adverbial ("Without looking back, …").
 */
export function refusedPhrases(sentence: string): string[] {
  const s = sentence.trim();
  if (KEEPS.test(s)) return [];
  const out: string[] = [];
  const opening = /^(?:no|never|without|nothing|nobody|none)\b\s*(.*)$/i.exec(s);
  // "Without looking back, …" / "Never hurried, …": how something is done, not a thing left out of the picture
  const adverbial = opening ? /^[A-Za-z'’-]+(?:ing|ed|ly)\b/.test(opening[1]) : false;
  if (opening && !adverbial) out.push(opening[1]);
  if (!opening) {
    const inline = /\b(?:no visible|must not (?:show|appear|be visible|be seen)|must never (?:show|appear)|do(?:es)? not show|avoid(?:s|ing)?)\b\s*(.*)$/i.exec(s);
    if (inline) out.push(inline[1]);
  }
  return out
    .map((phrase) => {
      const cut = PREPOSITION.exec(phrase);
      return (cut ? phrase.slice(0, cut.index) : phrase).trim();
    })
    .filter(Boolean);
}

/** The names in a phrase: words written in capitals, and capitalised words. `opens` = the phrase starts its sentence, whose first word is capitalised anyway. */
export function namesIn(phrase: string, opens = false): string[] {
  const words = phrase.match(/[A-Za-z][A-Za-z0-9'’-]*/g) ?? [];
  const names = new Set<string>();
  words.forEach((raw, i) => {
    const w = raw.replace(/['’]s$/i, "");
    if (/^[A-Z][A-Z0-9]+$/.test(w)) names.add(w);
    else if (!(opens && i === 0) && /^[A-Z][a-z]/.test(w)) names.add(w);
  });
  return [...names];
}

/** A sentence that itself refuses or negates — it is not asking for what it names. */
function denies(sentence: string): boolean {
  return /\b(?:no|not|never|without|nothing|nobody|none|avoid)\b/i.test(sentence) || /n['’]t\b/i.test(sentence);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The names the shot refuses that an entity's own words ask for. `own` is each of the shot's own passages (frame,
 * scene, direction, place) — kept apart, so an unpunctuated one never runs into the next; `added` is each entity's
 * own description, labelled with whose it is.
 */
export function promptConflicts(own: readonly string[], added: readonly { from: string; text: string }[]): PromptConflict[] {
  const forbidden: { name: string; sentence: string }[] = [];
  for (const passage of own) {
    for (const sentence of sentencesOf(passage ?? "")) {
      for (const phrase of refusedPhrases(sentence)) {
        // the refused phrase follows the refusal word, so its first word never opens the sentence
        for (const name of namesIn(phrase)) if (!forbidden.some((f) => f.name.toLowerCase() === name.toLowerCase())) forbidden.push({ name, sentence });
      }
    }
  }
  if (forbidden.length === 0) return [];
  const out: PromptConflict[] = [];
  for (const a of added) {
    for (const sentence of sentencesOf(a.text ?? "")) {
      if (denies(sentence)) continue;
      for (const f of forbidden) {
        if (!new RegExp(`\\b${escape(f.name)}\\b`, "i").test(sentence)) continue;
        if (out.some((c) => c.name === f.name && c.from === a.from)) continue;
        out.push({ name: f.name, forbiddenBy: f.sentence, askedBy: sentence, from: a.from });
      }
    }
  }
  return out;
}

/** One conflict as a sentence for the director: what collides, whose words, and the two ways out. */
export function conflictNote(c: PromptConflict): string {
  return `This shot says “${c.forbiddenBy}” and ${c.from} says “${c.askedBy}” — both go to the image model. If “${c.name}” must not appear, change the description of ${c.from}; if it may, reword the shot.`;
}
