import { describe, expect, it } from "vitest";
import type { Shot } from "@/integrations/supabase/aliases";
import { treatmentClipToShotSpec, type TreatmentClip } from "./api";
import {
  ShotSpecSchema,
  SHOT_SPEC_VERSION,
  parseShotSpec,
  safeParseShotSpec,
  serializeShotSpec,
  deserializeShotSpec,
  shotSpecToShotRow,
  shotRowToShotSpec,
  type ShotSpec,
  type ShotSpecInput,
} from "./shotSpec";

// A fully-populated spec exercising every branch of the schema + mappers.
const FULL_SPEC: ShotSpecInput = {
  version: 1,
  id: "shot-001",
  title: "Rooftop wide",
  order: 3,
  purpose: "Establish the skyline and drop the beat",
  kind: "performance",
  shotType: "performance",
  priority: "hero",
  timeline: { start: 12.5, end: 16 },
  source: {
    kind: "captured",
    mediaId: "asset-abc",
    uri: "s3://takes/rooftop.mov",
    range: { start: 4, end: 7.5 },
    note: "second take",
  },
  wardrobe: {
    name: "Look A",
    description: "tailored coat, monochrome",
    lookId: "look-xyz",
    references: [{ kind: "image", uri: "s3://ref/coat.png", assetId: null, note: "front" }],
  },
  environment: {
    description: "downtown rooftop at dusk",
    location: "rooftop",
    timeOfDay: "dusk",
    references: [{ kind: "url", uri: "https://ref", assetId: null, note: "mood" }],
  },
  framing: "wide",
  cameraAngle: "low",
  lens: { focalLengthMm: 24, aperture: "f/2.8", description: "wide anamorphic" },
  cameraMotion: { type: "dolly", description: "slow push in" },
  lighting: { style: "golden hour", description: "warm backlight", references: [] },
  performanceDirection: "confident, chin up, walk toward lens",
  fx: [{ type: "lens_flare", description: "subtle", intensity: 0.3 }],
  transitionIn: { type: "crossfade", durationSeconds: 0.5 },
  transitionOut: { type: "whip_pan", durationSeconds: 0.2 },
  references: [{ kind: "video", uri: "s3://ref/clip.mp4", assetId: null, note: "energy" }],
  previs: { status: "sketch", uri: null, notes: "storyboard frame 3" },
  generation: {
    required: true,
    engine: "grok",
    model: "grok-image",
    prompt: "cinematic rooftop keyframe",
    negativePrompt: "blurry",
    seed: 42,
    parameters: { fps: 24, keyframeCadence: 12 },
    notes: "keyframe only",
  },
  reconstruction: {
    required: true,
    mode: "keyframe_propagation",
    maskVersion: "v3",
    referenceAssetHash: "sha256:deadbeef",
    preserve: ["face", "logo"],
    notes: "RAFT propagation",
  },
  qa: [
    { check: "identity_preserved", mustPass: true, notes: "face match >0.9" },
    { check: "no_flicker", mustPass: true, notes: "" },
  ],
  status: "planned",
  provenance: {
    source: "ai",
    createdAt: "2026-09-18T00:00:00.000Z",
    updatedAt: null,
    author: "grok",
    model: "grok-4",
    notes: "",
  },
};

describe("ShotSpec schema", () => {
  it("parses a fully-populated spec unchanged in shape", () => {
    const spec = parseShotSpec(FULL_SPEC);
    expect(spec.version).toBe(SHOT_SPEC_VERSION);
    expect(spec.id).toBe("shot-001");
    expect(spec.generation.parameters).toEqual({ fps: 24, keyframeCadence: 12 });
    expect(spec.reconstruction.preserve).toEqual(["face", "logo"]);
    expect(spec.qa).toHaveLength(2);
  });

  it("applies defaults for a minimal spec (id + purpose + timeline only)", () => {
    const spec = parseShotSpec({
      id: "min",
      purpose: "cutaway",
      timeline: { start: 0, end: 3 },
    });
    expect(spec.version).toBe(1);
    expect(spec.kind).toBe("performance");
    expect(spec.status).toBe("draft");
    expect(spec.framing).toBeNull();
    expect(spec.source.kind).toBe("none");
    expect(spec.fx).toEqual([]);
    expect(spec.generation.required).toBe(false);
    expect(spec.provenance.source).toBe("human");
  });

  it("rejects a spec missing required identity/intent fields", () => {
    expect(safeParseShotSpec({ timeline: { start: 0, end: 1 } })).toBeNull();
    expect(safeParseShotSpec({ id: "x", purpose: "y" })).toBeNull(); // no timeline
    expect(safeParseShotSpec({ id: "", purpose: "y", timeline: { start: 0, end: 1 } })).toBeNull();
  });

  it("rejects an inverted timeline range", () => {
    expect(safeParseShotSpec({ id: "x", purpose: "y", timeline: { start: 5, end: 2 } })).toBeNull();
  });

  it("rejects an unknown enum value", () => {
    const bad = { ...FULL_SPEC, framing: "telescopic" };
    expect(safeParseShotSpec(bad)).toBeNull();
  });
});

describe("ShotSpec JSON round-trip", () => {
  it("serialize → deserialize is stable and idempotent", () => {
    const spec = parseShotSpec(FULL_SPEC);
    const json = serializeShotSpec(spec);
    const back = deserializeShotSpec(json);
    expect(back).toEqual(spec);
    // Re-serializing the round-tripped value yields identical bytes.
    expect(serializeShotSpec(back)).toBe(json);
  });

  it("round-trips a defaulted minimal spec", () => {
    const spec = parseShotSpec({ id: "m", purpose: "p", timeline: { start: 1, end: 2 } });
    expect(deserializeShotSpec(serializeShotSpec(spec))).toEqual(spec);
  });

  it("safeParse accepts what parse produced", () => {
    const spec = parseShotSpec(FULL_SPEC);
    expect(safeParseShotSpec(JSON.parse(JSON.stringify(spec)))).toEqual(spec);
  });
});

describe("ShotSpec ↔ shots row mappers", () => {
  it("maps spec → row for the columns the contract owns", () => {
    const spec = parseShotSpec(FULL_SPEC);
    const row = shotSpecToShotRow(spec);
    expect(row.scene_description).toBe("Establish the skyline and drop the beat");
    expect(row.shot_type).toBe("performance");
    expect(row.priority).toBe("hero");
    expect(row.status).toBe("planned");
    expect(row.timestamp_start).toBe(12.5);
    expect(row.timestamp_end).toBe(16);
    expect(row.duration_seconds).toBe(3.5);
    expect(row.trim_in_seconds).toBe(4);
    expect(row.trim_out_seconds).toBe(7.5);
    expect(row.wardrobe).toBe("Look A — tailored coat, monochrome");
    expect(row.environment).toContain("dusk");
    expect(row.recommended_tool).toBe("grok");
    expect(row.locked_look_id).toBe("look-xyz");
    expect(row.transition_out_type).toBe("whip_pan");
    expect(row.transition_duration).toBe(0.2);
    // framing/angle/lens have no column → folded into camera_direction.
    expect(row.camera_direction).toContain("dolly");
    expect(row.camera_direction).toContain("framing:wide");
    expect(row.camera_direction).toContain("angle:low");
  });

  it("maps draft status → planned and no-engine → null tool", () => {
    const spec = parseShotSpec({
      id: "d",
      purpose: "p",
      timeline: { start: 0, end: 2 },
      generation: { required: false },
    });
    const row = shotSpecToShotRow(spec);
    expect(row.status).toBe("planned");
    expect(row.recommended_tool).toBeNull();
  });

  it("derives shot_type from kind when shotType left default matches", () => {
    const spec = parseShotSpec({
      id: "b",
      purpose: "cutaway",
      timeline: { start: 0, end: 2 },
      kind: "broll",
      shotType: "b_roll",
    });
    expect(shotSpecToShotRow(spec).shot_type).toBe("b_roll");
  });

  it("maps a row → spec and validates", () => {
    const row: Partial<Shot> & { id: string } = {
      id: "row-1",
      scene_description: "wide skyline",
      shot_type: "b_roll",
      priority: "high",
      status: "approved",
      timestamp_start: 10,
      timestamp_end: 14,
      duration_seconds: 4,
      trim_in_seconds: 1,
      trim_out_seconds: 5,
      wardrobe: "coat",
      environment: "rooftop",
      lighting: "backlit",
      camera_direction: "slow dolly",
      recommended_tool: "runway",
      locked_look_id: "look-1",
      notes: "chin up",
      transition_in_type: "crossfade",
      transition_out_type: "cut",
      transition_duration: 0.5,
      created_at: "2026-09-18T00:00:00.000Z",
      updated_at: "2026-09-18T01:00:00.000Z",
    };
    const spec = shotRowToShotSpec(row);
    expect(spec.id).toBe("row-1");
    expect(spec.purpose).toBe("wide skyline");
    expect(spec.kind).toBe("broll");
    expect(spec.shotType).toBe("b_roll");
    expect(spec.priority).toBe("high");
    expect(spec.status).toBe("approved");
    expect(spec.timeline).toEqual({ start: 10, end: 14 });
    expect(spec.source.range).toEqual({ start: 1, end: 5 });
    expect(spec.generation.required).toBe(true);
    expect(spec.generation.engine).toBe("runway");
    expect(spec.provenance.source).toBe("import");
    // Must be a valid ShotSpec.
    expect(ShotSpecSchema.safeParse(spec).success).toBe(true);
  });

  it("supplies a placeholder purpose for a row with no description", () => {
    const spec = shotRowToShotSpec({ id: "empty", timestamp_start: 0, timestamp_end: 1 });
    expect(spec.purpose.length).toBeGreaterThan(0);
    expect(spec.status).toBe("planned");
  });

  it("row → spec → row preserves the columns the contract owns", () => {
    const row: Partial<Shot> & { id: string } = {
      id: "rt",
      scene_description: "close up",
      shot_type: "performance",
      priority: "normal",
      status: "generated",
      timestamp_start: 2,
      timestamp_end: 6,
      wardrobe: "jacket",
      environment: "studio",
      lighting: "hard key",
      recommended_tool: "veo",
    };
    const back = shotSpecToShotRow(shotRowToShotSpec(row));
    expect(back.scene_description).toBe("close up");
    expect(back.shot_type).toBe("performance");
    expect(back.status).toBe("generated");
    expect(back.timestamp_start).toBe(2);
    expect(back.timestamp_end).toBe(6);
    expect(back.recommended_tool).toBe("veo");
    // wardrobe re-serializes with the look name prefix omitted (name empty).
    expect(back.wardrobe).toBe("jacket");
  });
});

describe("TreatmentClip → ShotSpec bridge", () => {
  const clip: TreatmentClip = {
    key: "c003",
    start: 8,
    end: 12,
    section: "hook",
    energy: "high",
    shot_type: "vfx",
    scene_description: "kinetic light streaks over the artist",
    camera_direction: "whip pan",
    lighting: "strobe",
    wardrobe: "Look B",
    environment: "black void",
    recommended_tool: "grok",
    lyric_ref: "we run the night",
    priority: "hero",
    dependencies: [],
  };

  it("maps a treatment clip into a valid ShotSpec", () => {
    const spec = treatmentClipToShotSpec(clip, {
      model: "grok-4",
      generatedAt: "2026-09-18T00:00:00Z",
    });
    expect(spec.id).toBe("c003");
    expect(spec.purpose).toBe("kinetic light streaks over the artist");
    expect(spec.kind).toBe("generated");
    expect(spec.shotType).toBe("vfx");
    expect(spec.priority).toBe("hero");
    expect(spec.timeline).toEqual({ start: 8, end: 12 });
    expect(spec.lighting.description).toBe("strobe");
    expect(spec.cameraMotion.description).toBe("whip pan");
    expect(spec.generation.required).toBe(true);
    expect(spec.generation.engine).toBe("grok");
    expect(spec.fx).toHaveLength(1);
    expect(spec.references[0].note).toContain("we run the night");
    expect(spec.provenance).toMatchObject({ source: "ai", model: "grok-4" });
  });

  it("falls back safely for unknown tool / non-vfx clips", () => {
    const spec = treatmentClipToShotSpec({
      ...clip,
      shot_type: "performance",
      recommended_tool: "manual",
      lyric_ref: null,
    });
    expect(spec.kind).toBe("performance");
    // "manual" is a valid engine literal but is never "required" generation.
    expect(spec.generation.required).toBe(false);
    expect(spec.generation.engine).toBe("manual");
    expect(spec.fx).toEqual([]);
    expect(spec.references).toEqual([]);
  });
});
