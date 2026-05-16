import type { Artist, Shot } from "@/integrations/supabase/types";

/**
 * Severity levels for continuity lint warnings.
 *  - error:  hard contradiction with a forbidden_inaccuracy that the user
 *            explicitly listed as "never let the model do X"
 *  - warning: softer signal — continuity_rules contains a "must include"
 *            phrase that the shot description doesn't mention. The model
 *            may still produce a continuous result; this is a checklist
 *            reminder.
 */
export type ContinuitySeverity = "error" | "warning";

export type ContinuityWarning = {
  severity: ContinuitySeverity;
  /** The shot field the warning is about. UI uses this to anchor the badge. */
  field: ContinuityField;
  /** Short, user-readable message — already includes the offending phrase. */
  message: string;
  /** The continuity rule / forbidden phrase that triggered the warning. */
  rule: string;
};

export type ContinuityField =
  | "scene_description"
  | "wardrobe"
  | "environment"
  | "lighting"
  | "camera_direction";

const LINTABLE_FIELDS: ContinuityField[] = [
  "scene_description",
  "wardrobe",
  "environment",
  "lighting",
  "camera_direction",
];

// =============================================================================
// Public API
// =============================================================================
/**
 * Inspect a shot against its artist's continuity_rules and
 * forbidden_inaccuracies. Returns an empty array when the shot is clean.
 *
 * Design intent: ZERO false positives. We only fire when there's a literal
 * substring match between a forbidden phrase and a shot field. False
 * negatives are fine — this is a sanity check, not a replacement for human
 * review. Adding NLP / phrase-similarity here would make the warning system
 * loud and untrustworthy.
 */
export function lintShotContinuity(
  artist: Artist | null,
  shot: Shot,
): ContinuityWarning[] {
  if (!artist) return [];
  const warnings: ContinuityWarning[] = [];

  // -------------------------------------------------------------------------
  // Forbidden inaccuracies — hard errors
  // -------------------------------------------------------------------------
  const forbidden = splitPhrases(artist.forbidden_inaccuracies);
  for (const phrase of forbidden) {
    for (const field of LINTABLE_FIELDS) {
      const value = (shot[field] as string | null | undefined) ?? "";
      if (containsPhrase(value, phrase)) {
        warnings.push({
          severity: "error",
          field,
          message: `"${phrase}" is on this artist's forbidden list, but appears in ${humanField(field)}`,
          rule: phrase,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Continuity rules — soft "must include" reminders
  // -------------------------------------------------------------------------
  // Only fires for rules phrased like "always wears X" / "must wear X" /
  // "must include X". The captured X is checked against shot.wardrobe (the
  // most common case). This is intentionally narrow.
  const mustInclude = extractMustInclude(artist.continuity_rules);
  for (const phrase of mustInclude) {
    const wardrobe = shot.wardrobe ?? "";
    if (!containsPhrase(wardrobe, phrase)) {
      warnings.push({
        severity: "warning",
        field: "wardrobe",
        message: `Continuity rule says always include "${phrase}", but it's not mentioned in wardrobe`,
        rule: phrase,
      });
    }
  }

  return warnings;
}

// =============================================================================
// Helpers (exported for testing)
// =============================================================================
/**
 * Split a free-form list of phrases (comma OR newline separated) into trimmed,
 * non-empty entries. Returns lowercase for comparison.
 */
export function splitPhrases(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/[,\n]/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Case-insensitive substring match with a word-boundary guarantee at the
 * START of the phrase. We don't enforce trailing word boundary because
 * forbidden phrases often end with descriptive words ("no logos" should
 * match "no logos visible"). The leading boundary stops "no" from
 * matching "north" or "snowy".
 */
export function containsPhrase(haystack: string, phrase: string): boolean {
  if (!phrase) return false;
  const h = haystack.toLowerCase();
  const p = phrase.toLowerCase();
  // Word-boundary at start: either at position 0, or preceded by non-word char
  let idx = h.indexOf(p);
  while (idx !== -1) {
    const before = idx === 0 ? " " : h[idx - 1];
    if (!/\w/.test(before)) return true;
    idx = h.indexOf(p, idx + 1);
  }
  return false;
}

/**
 * Extract phrases the artist insists must appear in every shot. Pattern:
 *   "always wears <thing>"
 *   "must wear <thing>"
 *   "must include <thing>"
 *   "always has <thing>"
 *   "always include <thing>"
 *
 * Capture stops at comma, period, or end-of-string. Returns deduped lowercase.
 */
export function extractMustInclude(text: string | null | undefined): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const out = new Set<string>();
  const patterns = [
    /\balways\s+wears?\s+([^,.\n;]+)/g,
    /\balways\s+has\s+([^,.\n;]+)/g,
    /\balways\s+(?:include|includes)\s+([^,.\n;]+)/g,
    /\bmust\s+(?:wear|include|have)\s+([^,.\n;]+)/g,
  ];
  for (const re of patterns) {
    for (const m of lower.matchAll(re)) {
      const phrase = m[1].trim().replace(/^(the|a|an)\s+/, "");
      if (phrase.length >= 2) out.add(phrase);
    }
  }
  return [...out];
}

function humanField(field: ContinuityField): string {
  switch (field) {
    case "scene_description":
      return "scene description";
    case "camera_direction":
      return "camera direction";
    default:
      return field;
  }
}
