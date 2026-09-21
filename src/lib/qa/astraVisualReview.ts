/**
 * Astra visual QA — structured review contract (Phase 1, 2026-09-21).
 *
 * Astra (GPT-6 Astra, reached through Fendi's ChatGPT/OpenAI access) reviews a
 * COMPLETED DRAFT against the treatment / ShotSpecs and returns this shape.
 * Claude ingests it, routes each defect to the subsystem that owns the fix,
 * repairs, rerenders only the affected shots and sends the new draft back.
 *
 * Astra is a reviewer, not the creative director: it compares INTENT vs OUTPUT.
 * Fendi is final creative authority. Anything that would change treatment intent,
 * is low-confidence, contradictory or purely aesthetic escalates to Fendi.
 *
 * Kept deliberately close to the ShotSpec vocabulary (shot ids, song-clock ranges,
 * transition types) so reports join onto docs/treatments/*.shotspecs.json and the
 * assembly manifest without translation.
 */
import { z } from "zod";

export const REVIEW_VERDICTS = ["PASS", "FAIL", "PARTIAL", "UNCERTAIN"] as const;
export const FINAL_VERDICTS = ["PASS", "REPAIR_REQUIRED", "HUMAN_REVIEW_REQUIRED"] as const;
export const DEFECT_SEVERITIES = ["blocker", "major", "minor", "note"] as const;

/** Which production subsystem can actually fix the defect (routing, not blame). */
export const DEFECT_OWNERS = [
  "wardrobe_generation", // wrong look / garment not on body → hero frame / video edit lane
  "temporal_propagation", // morphing, garment flicker, instability across frames
  "brand_repair", // wordmark / logo / lettering defects → deterministic branding repair
  "identity", // face/body drift → identity anchors / generation / compositing
  "environment", // closet still visible, plate mismatch → environment transformation
  "compositing_mask", // matte edge, halo, holes → segmentation / compositing
  "edit_fx", // transition / FX not matching treatment or not working musically
  "source_range", // wrong performance moment used → timeline / source-range mapping
  "sync", // lips / performance vs song clock
  "broll", // B-roll not matching treatment or purpose
  "export_quality", // soft / low-res / compression → reconstruction / upscale / export
  "treatment", // requires a treatment decision → Fendi
  "unknown",
] as const;

export const DEFECT_CATEGORIES = [
  "wardrobe",
  "identity",
  "environment",
  "framing",
  "transition",
  "sync",
  "broll",
  "artifact",
  "quality",
  "continuity",
  "creative_intent",
] as const;

export const AstraDefectSchema = z.object({
  defect_id: z.string().min(1), // stable across revisions, e.g. "S12-WORDMARK-SCALE"
  severity: z.enum(DEFECT_SEVERITIES),
  category: z.enum(DEFECT_CATEGORIES),
  /** Draft-relative seconds [start, end]; song-clock seconds when song_range is set. */
  time_range: z.tuple([z.number().min(0), z.number().min(0)]),
  song_range: z.tuple([z.number(), z.number()]).nullable().default(null),
  shot_id: z.string().nullable().default(null),
  description: z.string().min(1),
  evidence: z.string().min(1), // what Astra actually saw, with timecodes
  recommended_owner: z.enum(DEFECT_OWNERS),
  recommended_action: z.string().min(1),
  requires_treatment_change: z.boolean().default(false),
});
export type AstraDefect = z.infer<typeof AstraDefectSchema>;

export const AstraShotReviewSchema = z.object({
  shot_id: z.string().min(1),
  song_range: z.tuple([z.number(), z.number()]),
  draft_range: z.tuple([z.number(), z.number()]),
  expected: z.string().min(1),
  observed: z.string().min(1),
  verdict: z.enum(REVIEW_VERDICTS),
  confidence: z.number().min(0).max(1),
  observations: z.array(z.string()).default([]),
  defects: z.array(z.string()).default([]), // defect_ids
  recommended_owner: z.enum(DEFECT_OWNERS).nullable().default(null),
  recommended_action: z.string().nullable().default(null),
});
export type AstraShotReview = z.infer<typeof AstraShotReviewSchema>;

export const AstraTransitionReviewSchema = z.object({
  from_shot: z.string().min(1),
  to_shot: z.string().min(1),
  draft_time: z.number().min(0),
  expected: z.string().min(1),
  observed: z.string().min(1),
  verdict: z.enum(REVIEW_VERDICTS),
  defects: z.array(z.string()).default([]),
  recommended_action: z.string().nullable().default(null),
});
export type AstraTransitionReview = z.infer<typeof AstraTransitionReviewSchema>;

const Score = z.number().min(0).max(10);

export const AstraReviewSchema = z.object({
  schema_version: z.literal(1),
  draft_id: z.string().min(1),
  project_id: z.string().min(1),
  treatment_version: z.string().min(1),
  reviewer: z.string().default("astra"),
  review_timestamp: z.string().min(1),
  /** Only true when Astra actually watched the assembled video (not stills/metadata). */
  watched_video: z.boolean(),
  overall: z.object({
    treatment_conformance: Score,
    visual_coherence: Score,
    identity_preservation: Score,
    wardrobe_conformance: Score,
    environment_conformance: Score,
    edit_transition_conformance: Score,
    summary: z.string().min(1),
  }),
  shots: z.array(AstraShotReviewSchema).min(1),
  transitions: z.array(AstraTransitionReviewSchema).default([]),
  sequence_defects: z.array(AstraDefectSchema).default([]),
  /** Answers to the standing questions (e.g. "real video enhanced by AVT" vs "AI content"). */
  answers: z.record(z.string(), z.string()).default({}),
  final_verdict: z.enum(FINAL_VERDICTS),
  escalate_to_fendi: z.array(z.string()).default([]),
});
export type AstraReview = z.infer<typeof AstraReviewSchema>;

export function parseAstraReview(input: unknown): AstraReview {
  return AstraReviewSchema.parse(input);
}

/** Defects that Claude must fix before re-review (objective, technically repairable). */
export function repairableDefects(review: AstraReview): AstraDefect[] {
  return review.sequence_defects.filter(
    (d) => !d.requires_treatment_change && d.recommended_owner !== "treatment" && d.recommended_owner !== "unknown" && d.severity !== "note",
  );
}

/** Compare two reviews by defect_id: what got fixed, what is new, what persists. */
export function diffReviews(prev: AstraReview, next: AstraReview) {
  const p = new Map(prev.sequence_defects.map((d) => [d.defect_id, d]));
  const n = new Map(next.sequence_defects.map((d) => [d.defect_id, d]));
  return {
    resolved: [...p.keys()].filter((k) => !n.has(k)),
    persisting: [...p.keys()].filter((k) => n.has(k)),
    introduced: [...n.keys()].filter((k) => !p.has(k)),
  };
}
