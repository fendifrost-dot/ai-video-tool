import { describe, expect, it } from "vitest";
import { planManifestCommit, planTimelineEvent } from "./commit";
import type { TimelineManifestJson } from "@/lib/export/timelineManifest";

const minimalManifest: TimelineManifestJson = {
  schema_version: 1,
  project_id: "p1",
  project_title: "Test",
  song_title: null,
  frame_rate: 24,
  aspect_ratio: "16:9",
  resolution: "1920x1080",
  duration_frames: 240,
  audio: null,
  timeline: [
    {
      id: "item-1",
      storyboard_node_id: null,
      shot_id: null,
      asset_id: null,
      track: "V1",
      order: 0,
      start_frame: 0,
      end_frame: 120,
      trim_in_frame: 0,
      trim_out_frame: null,
      start_seconds: 0,
      end_seconds: 5,
      song_section: null,
      cut_type: null,
      transition_in: {},
      transition_out: {},
      speed: 1,
      color_profile_id: null,
      vfx_profile_id: null,
      text_overlays: [],
      approved: false,
      notes: null,
      clip_filename: null,
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

describe("Editor Core Engine — planManifestCommit", () => {
  it("bumps version and plans version + event rows", () => {
    const plan = planManifestCommit({
      manifestId: "m1",
      currentVersionNumber: 3,
      manifestJson: minimalManifest,
      durationFrames: 240,
      actor: { type: "agent", name: "Claude" },
      changeSummary: "Claude reordered hook section",
    });

    expect(plan.nextVersionNumber).toBe(4);
    expect(plan.versionInsert.version_number).toBe(4);
    expect(plan.versionInsert.actor_name).toBe("Claude");
    expect(plan.eventInsert.event_type).toBe("manifest_committed");
    expect(plan.eventInsert.payload_json.item_count).toBe(1);
    expect(plan.manifestUpdate.version_number).toBe(4);
  });
});

describe("Editor Core Engine — planTimelineEvent", () => {
  it("builds granular event row", () => {
    const row = planTimelineEvent({
      manifestId: "m1",
      eventType: "clips_reordered",
      actor: { type: "user", name: "Fendi" },
      changeSummary: "User trimmed clip 8",
      payload: { clip_id: "c8", ordered_ids: ["a", "b"] },
    });

    expect(row.event_type).toBe("clips_reordered");
    expect(row.change_summary).toBe("User trimmed clip 8");
    expect(row.payload_json).toEqual({ clip_id: "c8", ordered_ids: ["a", "b"] });
  });
});
