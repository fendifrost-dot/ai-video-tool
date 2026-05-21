import { describe, expect, it } from "vitest";
import {
  pickLockedFeaturePaths,
  type CharacterFeature,
} from "./characterFeatures";

function f(partial: Partial<CharacterFeature>): CharacterFeature {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    artist_id: "a1",
    feature_type: partial.feature_type ?? "face",
    label: partial.label ?? "neutral",
    file_url: partial.file_url ?? null,
    storage_path: partial.storage_path ?? null,
    is_primary: partial.is_primary ?? false,
    is_locked: partial.is_locked ?? false,
    reinforce_on_drift: partial.reinforce_on_drift ?? true,
    metadata_json: partial.metadata_json ?? {},
    uploaded_at: partial.uploaded_at ?? "2026-05-17T00:00:00Z",
    reference_images: partial.reference_images ?? null,
  };
}

describe("pickLockedFeaturePaths", () => {
  it("returns an empty array when nothing is locked", () => {
    expect(
      pickLockedFeaturePaths([
        f({ feature_type: "face", file_url: "x/face.png", is_locked: false }),
        f({ feature_type: "hands", file_url: "x/hands.png", is_locked: false }),
      ]),
    ).toEqual([]);
  });

  it("skips locked rows that have no file_url", () => {
    expect(
      pickLockedFeaturePaths([
        f({ feature_type: "face", file_url: null, is_locked: true }),
        f({ feature_type: "hands", file_url: "x/hands.png", is_locked: true }),
      ]),
    ).toEqual(["x/hands.png"]);
  });

  it("returns locked paths in the canonical type priority order", () => {
    // priority: face → hands → jewelry → tattoos → hair → teeth → body
    const out = pickLockedFeaturePaths([
      f({ feature_type: "body", file_url: "x/body.png", is_locked: true }),
      f({ feature_type: "jewelry", file_url: "x/jewelry.png", is_locked: true }),
      f({ feature_type: "hands", file_url: "x/hands.png", is_locked: true }),
      f({ feature_type: "face", file_url: "x/face.png", is_locked: true }),
    ]);
    expect(out).toEqual([
      "x/face.png",
      "x/hands.png",
      "x/jewelry.png",
      "x/body.png",
    ]);
  });

  it("within a feature type, primary comes before non-primary", () => {
    const out = pickLockedFeaturePaths([
      f({
        feature_type: "face",
        label: "smiling",
        file_url: "x/face_smiling.png",
        is_locked: true,
        is_primary: false,
      }),
      f({
        feature_type: "face",
        label: "neutral",
        file_url: "x/face_neutral.png",
        is_locked: true,
        is_primary: true,
      }),
    ]);
    expect(out).toEqual(["x/face_neutral.png", "x/face_smiling.png"]);
  });

  it("de-duplicates by file_url across feature types", () => {
    const out = pickLockedFeaturePaths([
      f({ feature_type: "face", file_url: "shared.png", is_locked: true }),
      f({ feature_type: "hands", file_url: "shared.png", is_locked: true }),
    ]);
    expect(out).toEqual(["shared.png"]);
  });
});
