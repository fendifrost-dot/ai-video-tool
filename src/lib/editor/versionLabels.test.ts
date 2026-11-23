import { describe, expect, it } from "vitest";
import type { ProjectAsset } from "@/integrations/supabase/aliases";
import { groupVersions } from "./versionLabels";

const row = (over: Partial<ProjectAsset>): ProjectAsset =>
  ({ id: "a", asset_type: "generated_clip", file_url: "u/p/clip.mp4", footage_role: null, metadata_json: { mime_type: "video/mp4" }, notes: null, source_tool: "manual", ...over }) as ProjectAsset;

describe("the Cut page's versions", () => {
  it("lists a clip, and never a preview copy of built effects", () => {
    const clip = row({ id: "clip" });
    // the row make_preview.py files, and one whose record does not parse: both are post's small file, not footage
    const copy = row({ id: "copy", asset_type: "other", file_url: "u/p/effects_preview/storm_verse_v1.mp4", metadata_json: { bucket: "project-exports", mime_type: "video/mp4", effects_preview: { section: "storm_verse", version: 1, song_start: 127.9, song_end: 207.5, fps: 24, frames: 1911 } } });
    const unreadable = row({ id: "bad", asset_type: "other", file_url: "u/p/effects_preview/x_v1.mp4", metadata_json: { mime_type: "video/mp4", effects_preview: { section: "BAD" } } });
    const listed = Object.values(groupVersions([clip, copy, unreadable])).flat().map((a) => a.id);
    expect(listed).toEqual(["clip"]);
  });
});
