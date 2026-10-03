import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * The asset list leaves the song out (it is its own query). `useProjectMedia` once looked for the song inside that
 * list and never found it — Setup then asked a project that had a song to upload one, and Review had nothing to play.
 */
const state = vi.hoisted(() => ({
  assets: [] as unknown[],
  audio: null as unknown,
}));

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/queries/projectAssets", () => ({
  projectAssetsKeys: { all: ["project_assets"], forProject: (id: string) => ["project_assets", id] },
  bucketForAssetType: () => "project-generated",
  useProjectAssets: () => ({ data: state.assets, isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock("@/lib/queries/projects", () => ({
  useProjectAudio: () => ({ data: state.audio, isLoading: false, error: null }),
}));

import { useProjectMedia } from "@/lib/queries/storyboard";

const row = (over: Record<string, unknown>) => ({
  id: "a1",
  asset_type: "reference_video",
  file_url: "u/p/take.mp4",
  metadata_json: { mime_type: "video/mp4", original_filename: "take.mp4" },
  notes: null,
  shot_id: null,
  source_tool: "manual",
  created_at: "2026-10-01T00:00:00Z",
  footage_role: "performance",
  ...over,
});

describe("useProjectMedia", () => {
  it("takes the song from the song query, not from the asset list", () => {
    state.assets = [row({})];
    state.audio = row({ id: "song", asset_type: "audio", file_url: "u/p/song.wav", footage_role: null });
    const { result } = renderHook(() => useProjectMedia("p1"));
    expect(result.current.song?.id).toBe("song");
    expect(result.current.list.map((m) => m.id)).toEqual(["a1"]);
    expect(result.current.byId.get("a1")?.footageRole).toBe("performance");
  });

  it("has no song when the project has none", () => {
    state.assets = [row({})];
    state.audio = null;
    const { result } = renderHook(() => useProjectMedia("p1"));
    expect(result.current.song).toBeNull();
  });
});
