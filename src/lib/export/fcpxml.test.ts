import { describe, expect, it } from "vitest";
import { buildFcpxml } from "./fcpxml";
import type { TimelineManifestJson } from "./timelineManifest";

const manifest: TimelineManifestJson = {
  schema_version: 1,
  project_id: "p1",
  project_title: "Test",
  song_title: null,
  frame_rate: 24,
  aspect_ratio: "16:9",
  resolution: "1920x1080",
  duration_frames: 96,
  audio: null,
  timeline: [
    {
      id: "ti1",
      storyboard_node_id: null,
      shot_id: "s1",
      asset_id: "a1",
      track: "V1",
      order: 0,
      start_frame: 0,
      end_frame: 48,
      trim_in_frame: 0,
      trim_out_frame: 48,
      start_seconds: 0,
      end_seconds: 2,
      song_section: null,
      cut_type: "hard_cut",
      transition_in: {},
      transition_out: {},
      speed: 1,
      color_profile_id: null,
      vfx_profile_id: null,
      text_overlays: [],
      approved: true,
      notes: null,
      clip_filename: "shot_001_generated_clip.mp4",
    },
  ],
  global_style: {
    color_direction: "",
    grain: "",
    lens_language: "",
    reference_videos: [],
  },
  export_targets: { premiere: true, resolve: true, remotion: true },
};

describe("buildFcpxml", () => {
  it("produces well-formed XML with clip references", () => {
    const xml = buildFcpxml(manifest, { a1: "approved_clips/shot_001_generated_clip.mp4" });
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain("<fcpxml");
    expect(xml).toContain("approved_clips/shot_001_generated_clip.mp4");
    expect(xml).toContain('frameDuration="1/24s"');
  });
});
