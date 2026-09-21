import { describe, expect, it } from "vitest";
import { diffReviews, parseAstraReview, repairableDefects } from "./astraVisualReview";

const base = {
  schema_version: 1 as const,
  draft_id: "YSL_IceOn_bars24-46_v1",
  project_id: "764a63d2-93cd-44f3-905f-292f14ab2f51",
  treatment_version: "section-bars24-46@88cc4b9",
  review_timestamp: "2026-09-21T01:00:00Z",
  watched_video: true,
  overall: {
    treatment_conformance: 7, visual_coherence: 7, identity_preservation: 9,
    wardrobe_conformance: 7, environment_conformance: 8, edit_transition_conformance: 6,
    summary: "Real performance is the spine; wordmark instability is the main objective defect.",
  },
  shots: [{
    shot_id: "S12", song_range: [86.557, 90.492], draft_range: [39.344, 43.279],
    expected: "Look 1, hook out", observed: "Look 1 present; lettering oversized", verdict: "PARTIAL", confidence: 0.8,
    observations: [], defects: ["S12-WORDMARK-SCALE"], recommended_owner: "brand_repair", recommended_action: "regenerate or repair wordmark",
  }],
  transitions: [],
  sequence_defects: [
    { defect_id: "S12-WORDMARK-SCALE", severity: "major", category: "wardrobe", time_range: [39.3, 43.2], song_range: null, shot_id: "S12",
      description: "SAINT LAURENT lettering ~2x reference scale", evidence: "0:39.5-0:43.2 lettering spans most of the band", recommended_owner: "brand_repair",
      recommended_action: "re-run S12 edit or deterministic wordmark repair", requires_treatment_change: false },
    { defect_id: "TONE-TOO-DARK", severity: "note", category: "creative_intent", time_range: [0, 43], song_range: null, shot_id: null,
      description: "could be moodier", evidence: "overall", recommended_owner: "treatment", recommended_action: "ask Fendi", requires_treatment_change: true },
  ],
  answers: { q15: "Real video enhanced by AVT; evidence at 0:15.7 drop." },
  final_verdict: "REPAIR_REQUIRED",
  escalate_to_fendi: [],
};

describe("astra visual review contract", () => {
  it("parses a valid review and applies defaults", () => {
    const r = parseAstraReview(base);
    expect(r.reviewer).toBe("astra");
    expect(r.shots[0].defects).toEqual(["S12-WORDMARK-SCALE"]);
  });
  it("rejects unknown verdicts/owners", () => {
    expect(() => parseAstraReview({ ...base, final_verdict: "OK" })).toThrow();
    expect(() => parseAstraReview({ ...base, sequence_defects: [{ ...base.sequence_defects[0], recommended_owner: "someone" }] })).toThrow();
  });
  it("repairableDefects excludes treatment-level and notes", () => {
    const r = parseAstraReview(base);
    expect(repairableDefects(r).map((d) => d.defect_id)).toEqual(["S12-WORDMARK-SCALE"]);
  });
  it("diffReviews tracks defect identity across revisions", () => {
    const prev = parseAstraReview(base);
    const next = parseAstraReview({ ...base, sequence_defects: [{ ...base.sequence_defects[1] }, { ...base.sequence_defects[0], defect_id: "S08-BAND-FLICKER" }] });
    expect(diffReviews(prev, next)).toEqual({ resolved: ["S12-WORDMARK-SCALE"], persisting: ["TONE-TOO-DARK"], introduced: ["S08-BAND-FLICKER"] });
  });
});
