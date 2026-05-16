import { describe, expect, it } from "vitest";
import { buildEditDecisionNotes, buildManifest } from "./manifest";
import type {
  Artist,
  ProjectAsset,
  Prompt,
  Shot,
  VideoProject,
} from "@/integrations/supabase/types";

function project(over: Partial<VideoProject> = {}): VideoProject {
  return {
    id: "p1",
    user_id: "u1",
    artist_id: "a1",
    title: "Midnight Roses",
    song_title: "Midnight Roses",
    genre: "trap",
    bpm: 142,
    mood: "grimy",
    visual_style: "35mm",
    color_palette: ["#000", "#f55"],
    wardrobe_notes: null,
    lyrics: "[Intro]\n...\n[Verse 1]\n...",
    song_structure_json: [
      { name: "intro", start_seconds: 0, end_seconds: 8, bars: 4 },
      { name: "verse_1", start_seconds: 8, end_seconds: 32, bars: 16 },
    ],
    treatment_json: {},
    status: "in_production",
    notes: null,
    created_at: "2026-05-15T00:00:00Z",
    updated_at: "2026-05-15T00:00:00Z",
    ...over,
  };
}

function artist(over: Partial<Artist> = {}): Artist {
  return {
    id: "a1",
    user_id: "u1",
    name: "Iris",
    bio: null,
    identity_profile_json: {},
    continuity_rules: null,
    forbidden_inaccuracies: null,
    preferred_lighting: null,
    camera_rules: null,
    notes: null,
    created_at: "2026-05-15T00:00:00Z",
    updated_at: "2026-05-15T00:00:00Z",
    ...over,
  };
}

function shot(over: Partial<Shot> = {}): Shot {
  return {
    id: "s1",
    user_id: "u1",
    project_id: "p1",
    shot_number: 1,
    song_section: "hook",
    timestamp_start: 32,
    timestamp_end: 40,
    duration_seconds: 8,
    trim_in_seconds: null,
    trim_out_seconds: null,
    transition_in_type: null,
    transition_out_type: null,
    transition_duration: null,
    shot_type: "performance",
    scene_description: "Iris under a single bulb",
    camera_direction: "slow dolly in",
    lighting: "warm key",
    wardrobe: "black silk",
    environment: "narrow alley",
    recommended_tool: "runway",
    priority: "hero",
    status: "approved",
    notes: null,
    created_at: "2026-05-15T00:00:00Z",
    updated_at: "2026-05-15T00:00:00Z",
    ...over,
  };
}

function asset(over: Partial<ProjectAsset> = {}): ProjectAsset {
  return {
    id: "asset1",
    user_id: "u1",
    project_id: "p1",
    shot_id: "s1",
    prompt_id: null,
    asset_type: "generated_clip",
    file_url: "u1/p1/s1/take.mp4",
    source_tool: "runway",
    approval_status: "approved",
    version_number: 1,
    parent_asset_id: null,
    metadata_json: { original_filename: "take.mp4", size_bytes: 5_000_000 },
    notes: null,
    created_at: "2026-05-15T00:00:00Z",
    ...over,
  };
}

describe("buildManifest", () => {
  const built = buildManifest({
    project: project(),
    artist: artist(),
    shots: [shot({ shot_number: 1 }), shot({ id: "s2", shot_number: 2 })],
    prompts: [] as Prompt[],
    assets: [asset({ shot_id: "s1" }), asset({ id: "asset2", shot_id: "s2" })],
  });

  it("locks schema_version to 1", () => {
    expect(built.schema_version).toBe(1);
  });

  it("includes parsed song_structure", () => {
    expect(built.project.song_structure).toHaveLength(2);
    expect(built.project.song_structure[0].name).toBe("intro");
  });

  it("counts approved clips per shot", () => {
    expect(built.counts.approved_clips).toBe(2);
    expect(built.approved_clips).toHaveLength(2);
  });

  it("references approved clip filename in approved_clips manifest", () => {
    expect(built.approved_clips[0].filename_in_zip).toMatch(
      /^approved_clips\/shot_\d{3}_generated_clip\.mp4$/,
    );
  });

  it("attaches the resolved artist name + id", () => {
    expect(built.project.artist).toEqual({ id: "a1", name: "Iris" });
  });
});

describe("buildEditDecisionNotes", () => {
  it("lists approved shots in shot_number order with approved-clip filenames", () => {
    const md = buildEditDecisionNotes({
      project: project(),
      artist: artist(),
      shots: [shot({ shot_number: 2, id: "s2" }), shot({ shot_number: 1 })],
      approvedClipsByShot: {
        s1: asset(),
        s2: asset({ id: "asset2" }),
      },
    });
    const shot1Idx = md.indexOf("Shot 001");
    const shot2Idx = md.indexOf("Shot 002");
    expect(shot1Idx).toBeGreaterThan(0);
    expect(shot2Idx).toBeGreaterThan(shot1Idx);
    expect(md).toContain("approved_clips/shot_001_generated_clip.mp4");
    expect(md).toContain("approved_clips/shot_002_generated_clip.mp4");
  });

  it("notes when no clips are approved", () => {
    const md = buildEditDecisionNotes({
      project: project(),
      artist: artist(),
      shots: [shot()],
      approvedClipsByShot: {},
    });
    expect(md).toContain("No approved clips yet");
  });
});
