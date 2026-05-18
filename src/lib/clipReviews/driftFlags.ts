/**
 * Phase A — drift_flags computation.
 *
 * When a clip review is saved, we look at face_consistency_score,
 * wardrobe_score, and lighting_score. Any score that's a real number AND
 * below the DRIFT_THRESHOLD is flagged. The returned array tells the future
 * auto-reinforcement loop which features came in low so it can boost their
 * references the next time we generate a similar shot.
 *
 * Scores are optional — null/undefined are not flagged (a missing score means
 * the reviewer didn't rate that dimension, not that the dimension drifted).
 */

import type { ClipReview } from "@/integrations/supabase/aliases";

export type DriftFlag = "face" | "wardrobe" | "lighting";

export const DRIFT_THRESHOLD = 7;

const DRIFT_RULES: ReadonlyArray<{ flag: DriftFlag; key: keyof ClipReview }> = [
  { flag: "face", key: "face_consistency_score" },
  { flag: "wardrobe", key: "wardrobe_score" },
  { flag: "lighting", key: "lighting_score" },
];

export function computeDriftFlags(
  review: Partial<
    Pick<
      ClipReview,
      "face_consistency_score" | "wardrobe_score" | "lighting_score"
    >
  >,
): DriftFlag[] {
  const out: DriftFlag[] = [];
  for (const rule of DRIFT_RULES) {
    const value = review[rule.key];
    if (typeof value !== "number") continue;
    if (value < DRIFT_THRESHOLD) {
      out.push(rule.flag);
    }
  }
  return out;
}
