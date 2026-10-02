import { describe, expect, it } from "vitest";
import { isImageAsset } from "./projectAssets";
import type { ProjectAsset } from "@/integrations/supabase/aliases";

function asset(partial: Partial<ProjectAsset> & Pick<ProjectAsset, "asset_type">): ProjectAsset {
  return {
    id: "a1",
    project_id: "p1",
    user_id: "u1",
    file_url: "user/project/no-extension",
    approval_status: "pending",
    asset_type: partial.asset_type,
    created_at: "2026-01-01T00:00:00Z",
    metadata_json: null,
    parent_asset_id: null,
    shot_id: null,
    source_tool: null,
    ...partial,
  };
}

describe("isImageAsset", () => {
  it("treats known image asset types as images without mime or extension", () => {
    expect(isImageAsset(asset({ asset_type: "reference_image" }))).toBe(true);
    expect(isImageAsset(asset({ asset_type: "generated_still" }))).toBe(true);
    expect(isImageAsset(asset({ asset_type: "thumbnail" }))).toBe(true);
  });

  it("still detects images via mime_type and file extension", () => {
    expect(
      isImageAsset(
        asset({
          asset_type: "other",
          metadata_json: { mime_type: "image/png" },
        }),
      ),
    ).toBe(true);
    expect(
      isImageAsset(asset({ asset_type: "other", file_url: "path/to/photo.jpeg" })),
    ).toBe(true);
  });

  it("returns false for non-image asset types without image signals", () => {
    expect(isImageAsset(asset({ asset_type: "generated_clip" }))).toBe(false);
    expect(isImageAsset(asset({ asset_type: "lut" }))).toBe(false);
  });
});
