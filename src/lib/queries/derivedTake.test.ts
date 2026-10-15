import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { mediaAssetOf } from "./storyboard";

const row = (derived_from: unknown) =>
  ({
    id: "a1",
    asset_type: "generated_clip",
    file_url: "u/p/j/clip.mp4",
    metadata_json: {
      bucket: "project-clips",
      mime_type: "video/mp4",
      duration_seconds: 4.004,
      derived_from,
    },
    footage_role: "performance",
    shot_id: null,
    source_tool: "higgsfield",
    created_at: "2026-10-15T00:00:00Z",
    notes: null,
  }) as never;

describe("a take made from a take, read off its asset", () => {
  it("reads a dressed take with its dress record", () => {
    const dress = {
      version: 1,
      sourceAssetId: "t1",
      window: [72.673, 76.677],
      songStart: 73.526,
      sourceSeconds: 4.004,
      promptVersion: "dress-v1",
    };
    const a = mediaAssetOf(
      row({
        asset_id: "t1",
        song_start: 73.526,
        source_window: [72.673, 76.677],
        method: "dressed",
        dress,
      }),
    );
    expect(a.derivedFrom).toMatchObject({
      assetId: "t1",
      songStart: 73.526,
      sourceWindow: [72.673, 76.677],
      method: "dressed",
      dress: { sourceAssetId: "t1" },
    });
    expect(a.durationSeconds).toBe(4.004);
  });

  it("keeps reading restaged and composite takes as before", () => {
    expect(mediaAssetOf(row({ asset_id: "t1", song_start: 1 })).derivedFrom).toEqual({
      assetId: "t1",
      songStart: 1,
      sourceWindow: null,
      method: "restaged",
    });
    expect(
      mediaAssetOf(row({ asset_id: "t1", song_start: 1, method: "composite" })).derivedFrom?.method,
    ).toBe("composite");
  });
});
