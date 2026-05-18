import { describe, expect, it } from "vitest";
import {
  approvedFilename,
  buildPromptLogCsv,
  buildShotListCsv,
  PROMPT_LOG_HEADER,
  SHOT_LIST_HEADER,
  toCsv,
} from "./csv";
import type {
  ProjectAsset,
  Prompt,
  PromptTemplate,
  Shot,
} from "@/integrations/supabase/aliases";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------
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
    wardrobe: "black silk shirt",
    environment: "narrow alley",
    recommended_tool: "runway",
    priority: "hero",
    status: "approved",
    notes: null,
    locked_look_id: null,
    created_at: "2026-05-15T00:00:00Z",
    updated_at: "2026-05-15T00:00:00Z",
    ...over,
  };
}

function asset(over: Partial<ProjectAsset> = {}): ProjectAsset {
  return {
    id: "a1",
    user_id: "u1",
    project_id: "p1",
    shot_id: "s1",
    prompt_id: null,
    asset_type: "generated_clip",
    file_url: "u1/p1/s1/take_001.mp4",
    source_tool: "runway",
    approval_status: "approved",
    version_number: 1,
    parent_asset_id: null,
    metadata_json: { original_filename: "take_001.mp4", size_bytes: 1024 },
    notes: null,
    locked_look_id: null,
    created_at: "2026-05-15T00:00:00Z",
    ...over,
  };
}

function prompt(over: Partial<Prompt> = {}): Prompt {
  return {
    id: "pr1",
    user_id: "u1",
    project_id: "p1",
    shot_id: "s1",
    template_id: "t1",
    provider: "runway",
    prompt_text: "cinematic shot of Iris",
    negative_prompt: "distorted face",
    settings_json: { duration_seconds: 5, aspect_ratio: "9:16" },
    version_number: 1,
    parent_prompt_id: null,
    result_asset_id: "a1",
    notes: null,
    locked_look_id: null,
    created_at: "2026-05-15T00:00:00Z",
    ...over,
  };
}

function template(over: Partial<PromptTemplate> = {}): PromptTemplate {
  return {
    id: "t1",
    user_id: null,
    name: "Runway — Performance",
    description: null,
    provider: "runway",
    category: "performance",
    template_body: "...",
    default_negative_prompt: null,
    default_settings_json: {},
    is_seed: true,
    created_at: "2026-05-15T00:00:00Z",
    updated_at: "2026-05-15T00:00:00Z",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// toCsv
// ---------------------------------------------------------------------------
describe("toCsv", () => {
  it("joins simple rows", () => {
    expect(toCsv([["a", "b"], [1, 2]])).toBe("a,b\n1,2");
  });

  it("quotes cells containing commas, quotes, or newlines (RFC 4180)", () => {
    expect(toCsv([["he said \"hi\"", "a,b", "line1\nline2"]])).toBe(
      '"he said ""hi""","a,b","line1\nline2"',
    );
  });

  it("treats null/undefined as empty cells", () => {
    expect(toCsv([[null, undefined, "x"]])).toBe(",,x");
  });
});

// ---------------------------------------------------------------------------
// approvedFilename
// ---------------------------------------------------------------------------
describe("approvedFilename", () => {
  it("uses shot number when available and preserves extension", () => {
    expect(approvedFilename(asset(), 1)).toBe("shot_001_generated_clip.mp4");
  });

  it("zero-pads shot number to 3 digits", () => {
    expect(approvedFilename(asset(), 42)).toBe("shot_042_generated_clip.mp4");
  });

  it("falls back to asset id slice when shot number missing", () => {
    expect(approvedFilename(asset({ id: "abc12345-xxxx" }))).toMatch(
      /^generated_clip_[a-z0-9]{8}\.mp4$/,
    );
  });
});

// ---------------------------------------------------------------------------
// buildShotListCsv
// ---------------------------------------------------------------------------
describe("buildShotListCsv", () => {
  it("emits the expected header and one row per shot", () => {
    const shots = [shot({ shot_number: 1 }), shot({ id: "s2", shot_number: 2, scene_description: "another" })];
    const csv = buildShotListCsv(shots, { s1: asset() });
    const lines = csv.split("\n");
    expect(lines[0]).toBe(SHOT_LIST_HEADER.join(","));
    expect(lines.length).toBe(3);
    expect(lines[1]).toContain("shot_001_generated_clip.mp4");
    expect(lines[2]).toContain("another");
  });

  it("leaves approved_clip_filename blank when no approval", () => {
    const csv = buildShotListCsv([shot()], {});
    expect(csv.split("\n")[1]).toMatch(/,,$|,$/);
  });
});

// ---------------------------------------------------------------------------
// buildPromptLogCsv
// ---------------------------------------------------------------------------
describe("buildPromptLogCsv", () => {
  it("emits the expected header and resolves shot/template/asset references", () => {
    const csv = buildPromptLogCsv(
      [prompt()],
      { s1: shot() },
      { t1: template() },
      { a1: asset() },
    );
    const lines = csv.split("\n");
    expect(lines[0]).toBe(PROMPT_LOG_HEADER.join(","));
    expect(lines[1]).toContain("Runway — Performance");
    expect(lines[1]).toContain("shot_001_generated_clip.mp4");
    expect(lines[1]).toContain("yes"); // approved -> yes/no
  });

  it("compacts settings into k=v; pairs", () => {
    const csv = buildPromptLogCsv(
      [prompt()],
      { s1: shot() },
      { t1: template() },
      { a1: asset() },
    );
    expect(csv).toContain("duration_seconds=5");
    expect(csv).toContain("aspect_ratio=9:16");
  });
});
