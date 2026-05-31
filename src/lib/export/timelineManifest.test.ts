import { describe, expect, it } from "vitest";
import { buildTimelineManifest } from "./timelineManifest";
import type { Shot, VideoProject } from "@/integrations/supabase/aliases";
import type { SongAnalysis } from "@/lib/songAnalysis/types";
import type { TimelineItem } from "@/lib/timeline/types";

function project(): VideoProject {
  return {
    id: "p1",
    user_id: "u1",
    artist_id: null,
    title: "Test MV",
    song_title: "Track",
    genre: null,
    bpm: 120,
    mood: null,
    visual_style: "noir",
    color_palette: [],
    wardrobe_notes: null,
    lyrics: null,
    song_structure_json: [],
    treatment_json: { color_direction: "teal shadows", grain: "35mm" },
    status: "in_production",
    notes: null,
    created_at: "",
    updated_at: "",
  };
}

function item(over: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: "ti1",
    manifest_id: "m1",
    storyboard_node_id: null,
    shot_id: "s1",
    asset_id: null,
    track: "V1",
    item_order: 0,
    start_frame: 0,
    end_frame: 48,
    trim_in_frame: 0,
    trim_out_frame: 48,
    song_section: "intro",
    cut_type: "hard_cut",
    transition_in_json: {},
    transition_out_json: {},
    speed: 1,
    color_profile_id: null,
    vfx_profile_id: null,
    text_overlays_json: [],
    approved: true,
    notes: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

const analysis: SongAnalysis = {
  id: "sa1",
  project_id: "p1",
  bpm: 120,
  duration_seconds: 10,
  beat_map_json: [{ t: 0, beat: 1, bar: 1 }],
  sections_json: [{ name: "intro", start: 0, end: 10 }],
  drops_json: [],
  hooks_json: [],
  energy_curve_json: [],
  analysis_provider: "test",
  analyzed_at: "",
};

describe("buildTimelineManifest", () => {
  it("references song_analyses for audio without re-deriving beats", () => {
    const json = buildTimelineManifest({
      project: project(),
      manifest: {
        id: "m1",
        aspect_ratio: "16:9",
        frame_rate: 24,
        resolution: "1920x1080",
        duration_frames: null,
      },
      items: [item()],
      songAnalysis: analysis,
      nodesById: {},
      shotsById: {
        s1: {
          id: "s1",
          shot_number: 1,
          scene_description: "alley",
          camera_direction: "dolly",
        } as Shot,
      },
      assets: [],
    });

    expect(json.audio?.song_analysis_id).toBe("sa1");
    expect(json.audio?.beat_markers).toEqual(analysis.beat_map_json);
    expect(json.audio?.song_sections).toEqual(analysis.sections_json);
    expect(json.frame_rate).toBe(24);
    expect(json.timeline[0]?.start_seconds).toBe(0);
    expect(json.timeline[0]?.end_seconds).toBe(2);
  });
});
