import type { FeatureType } from "@/lib/queries/characterFeatures";

/**
 * The canonical taxonomy of Character DNA — feature type → ordered list of
 * sub-pose labels. Kept in one place so the tabs, slot grids, compiler, and
 * tests all reason against the same set.
 *
 * If you add a new label, also update the data-migration script in
 * supabase/migrations/20260517_phase_a_migrate_artist_assets.sql if the new
 * label could be the target of an existing legacy asset_type.
 */
export const FEATURE_TAXONOMY: Record<FeatureType, { labels: string[]; description: string }> = {
  face: {
    description: "Identity-critical. Used as the primary likeness anchor.",
    labels: [
      "neutral",
      "smiling",
      "mouth_open",
      "side_profile_left",
      "side_profile_right",
      "three_quarter_left",
      "three_quarter_right",
      "looking_up",
      "looking_down",
    ],
  },
  teeth: {
    description: "For singing / lipsync continuity.",
    labels: ["upper", "lower", "smile_visible"],
  },
  hands: {
    description: "Common drift source on close-ups and gestures.",
    labels: [
      "left",
      "right",
      "gesture_pointing",
      "gesture_open",
      "gesture_fist",
      "holding_object",
    ],
  },
  tattoos: {
    description: "Per-bodypart reference. Drives the prompt's distinguishing block.",
    labels: ["arm_left", "arm_right", "neck", "chest", "hands", "back", "leg"],
  },
  jewelry: {
    description: "Signature accessories — chain, grillz, watches.",
    labels: ["chain", "ring", "watch", "earrings", "grillz", "bracelet", "glasses"],
  },
  hair: {
    description: "Style + texture. Keep at least front + back for continuity.",
    labels: ["front", "side_left", "side_right", "back", "styled", "natural"],
  },
  body: {
    description: "Posture, silhouette, walk style.",
    labels: [
      "posture_neutral",
      "walk_style",
      "silhouette_front",
      "silhouette_side",
    ],
  },
};

export const FEATURE_TYPES_ORDERED: FeatureType[] = [
  "face",
  "hair",
  "teeth",
  "hands",
  "tattoos",
  "jewelry",
  "body",
];

export function formatLabel(label: string): string {
  return label
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

export function formatFeatureType(t: FeatureType): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
