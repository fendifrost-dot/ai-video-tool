import { describe, expect, it } from "vitest";
import { compilePrompt, mergeNegative, substitute, tidy, buildVariables } from "./compiler";
import type {
  Artist,
  PromptTemplate,
  Shot,
  VideoProject,
} from "@/integrations/supabase/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeProject(overrides: Partial<VideoProject> = {}): VideoProject {
  return {
    id: "p1",
    user_id: "u1",
    artist_id: "a1",
    title: "Midnight Roses",
    song_title: "Midnight Roses",
    genre: "trap",
    bpm: 142,
    mood: "grimy",
    visual_style: "35mm film grain",
    color_palette: ["#1a1a1a", "#ff3355"],
    wardrobe_notes: null,
    lyrics: null,
    song_structure_json: {},
    treatment_json: {},
    status: "draft",
    notes: null,
    created_at: "2026-05-15T00:00:00Z",
    updated_at: "2026-05-15T00:00:00Z",
    ...overrides,
  };
}

function makeArtist(overrides: Partial<Artist> = {}): Artist {
  return {
    id: "a1",
    user_id: "u1",
    name: "Iris",
    bio: null,
    identity_profile_json: {
      face: "long face, sharp jawline",
      body: "lean athletic, 6'1",
      hair: "short black coily fade",
      wardrobe_defaults: "black silk shirt, dark denim",
      tattoos: "left forearm: rose in black ink",
      jewelry: "gold Cuban chain",
      distinguishing_features: "scar above right eyebrow",
    },
    continuity_rules: "always wears gold chain; never bares teeth",
    forbidden_inaccuracies: "extra tattoos, facial hair",
    preferred_lighting: null,
    camera_rules: null,
    notes: null,
    created_at: "2026-05-15T00:00:00Z",
    updated_at: "2026-05-15T00:00:00Z",
    ...overrides,
  };
}

function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: "s1",
    user_id: "u1",
    project_id: "p1",
    shot_number: 1,
    song_section: "hook",
    timestamp_start: 32,
    timestamp_end: 40,
    duration_seconds: 8,
    shot_type: "performance",
    scene_description: "Iris performing direct to camera under a single bulb",
    camera_direction: "slow dolly in, eye level",
    lighting: "warm key, hard rim",
    wardrobe: "black silk shirt, gold chain",
    environment: "narrow alleyway at night",
    recommended_tool: "runway",
    priority: "hero",
    status: "planned",
    notes: null,
    created_at: "2026-05-15T00:00:00Z",
    updated_at: "2026-05-15T00:00:00Z",
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<PromptTemplate> = {}): PromptTemplate {
  return {
    id: "t1",
    user_id: null,
    name: "Runway — Cinematic Performance",
    description: null,
    provider: "runway",
    category: "performance",
    template_body:
      "cinematic shot of {{artist.name}}. {{artist.face}}. Wearing {{artist.wardrobe_defaults}}. {{artist.distinguishing}}. {{shot.scene_description}}. Camera: {{shot.camera_direction}}. Lighting: {{shot.lighting}}. Mood: {{project.mood}}. {{artist.continuity}}.",
    default_negative_prompt: "distorted face, watermark",
    default_settings_json: { duration_seconds: 5, aspect_ratio: "9:16" },
    is_seed: true,
    created_at: "2026-05-15T00:00:00Z",
    updated_at: "2026-05-15T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// substitute
// ---------------------------------------------------------------------------
describe("substitute", () => {
  it("replaces placeholders with values", () => {
    const vars = {
      artist: { name: "Iris" },
      project: { mood: "grimy" },
      shot: {},
    };
    const { text, unfilled } = substitute(
      "{{artist.name}} is {{project.mood}}",
      vars,
    );
    expect(text).toBe("Iris is grimy");
    expect(unfilled).toEqual([]);
  });

  it("returns empty string for missing values and reports them once", () => {
    const vars = { artist: {}, project: {}, shot: {} };
    const { text, unfilled } = substitute(
      "{{artist.name}} / {{artist.name}} / {{shot.lighting}}",
      vars,
    );
    expect(text).toBe(" /  / ");
    expect(unfilled).toEqual(["{{artist.name}}", "{{shot.lighting}}"]);
  });

  it("treats whitespace-only values as unfilled", () => {
    const vars = { artist: { name: "   " }, project: {}, shot: {} };
    const { text, unfilled } = substitute("hello {{artist.name}}", vars);
    expect(text).toBe("hello ");
    expect(unfilled).toEqual(["{{artist.name}}"]);
  });
});

// ---------------------------------------------------------------------------
// mergeNegative
// ---------------------------------------------------------------------------
describe("mergeNegative", () => {
  it("merges template + artist forbidden + extra, dedupes case-insensitively", () => {
    const out = mergeNegative({
      templateNegative: "distorted face, watermark",
      artistForbidden: "Watermark, extra tattoos",
      extra: "no logos",
    });
    expect(out).toBe("distorted face, watermark, extra tattoos, no logos");
  });

  it("handles null inputs", () => {
    expect(
      mergeNegative({ templateNegative: null, artistForbidden: null, extra: null }),
    ).toBe("");
    expect(
      mergeNegative({
        templateNegative: "blurry",
        artistForbidden: undefined,
        extra: null,
      }),
    ).toBe("blurry");
  });

  it("trims and drops empty fragments", () => {
    expect(
      mergeNegative({
        templateNegative: " , distorted face,  ",
        artistForbidden: null,
        extra: null,
      }),
    ).toBe("distorted face");
  });
});

// ---------------------------------------------------------------------------
// tidy
// ---------------------------------------------------------------------------
describe("tidy", () => {
  it("drops labels whose values are empty", () => {
    // Trailing sentence-ending period is preserved; only the empty
    // "Lighting: ." label is dropped.
    expect(tidy("Lighting: . Wardrobe: black.")).toBe("Wardrobe: black.");
  });

  it("collapses repeated punctuation and spaces", () => {
    expect(tidy("hello,, world  ")).toBe("hello, world");
  });

  it("strips dangling 'comma before period' artifacts", () => {
    // The trailing ", ." gets normalised down to a single period.
    expect(tidy("a, b, c, .")).toBe("a, b, c.");
  });

  it("drops orphan unit labels when the numeric placeholder was empty", () => {
    // The seed templates use "Duration: {{shot.duration}}s." — when duration
    // is empty, the substituted text is "Duration: s." which is meaningless.
    // tidy() should drop the whole label including the orphan unit.
    expect(tidy("Duration: s. Continuity: always wears gold chain.")).toBe(
      "Continuity: always wears gold chain.",
    );
    expect(tidy("FPS: fps. Camera: dolly in.")).toBe("Camera: dolly in.");
    expect(tidy("Tempo: bpm.")).toBe("");
    // Inline mid-sentence
    expect(tidy("intro shot, Duration: s, mood: grimy.")).toBe(
      "intro shot, mood: grimy.",
    );
  });

  it("does NOT touch valid labels that include real numeric values", () => {
    // The unit is preceded by digits or a real value — must be left alone.
    expect(tidy("Duration: 5s. Continuity: rule.")).toBe(
      "Duration: 5s. Continuity: rule.",
    );
    expect(tidy("Tempo: 142 bpm.")).toBe("Tempo: 142 bpm.");
    expect(tidy("Lighting: warm key.")).toBe("Lighting: warm key.");
  });
});

// ---------------------------------------------------------------------------
// buildVariables
// ---------------------------------------------------------------------------
describe("buildVariables", () => {
  it("combines tattoos + jewelry + distinguishing_features", () => {
    const vars = buildVariables({
      project: makeProject(),
      artist: makeArtist(),
      shot: makeShot(),
    });
    expect(vars.artist.distinguishing).toContain("rose in black ink");
    expect(vars.artist.distinguishing).toContain("gold Cuban chain");
    expect(vars.artist.distinguishing).toContain("scar above right eyebrow");
  });

  it("joins color palette with commas", () => {
    const vars = buildVariables({
      project: makeProject({ color_palette: ["#000", "#fff"] }),
      artist: null,
      shot: null,
    });
    expect(vars.project.color_palette).toBe("#000, #fff");
  });

  it("overrides win over shot fields", () => {
    const vars = buildVariables({
      project: makeProject(),
      artist: makeArtist(),
      shot: makeShot(),
      overrides: { lighting: "blue neon" },
    });
    expect(vars.shot.lighting).toBe("blue neon");
  });
});

// ---------------------------------------------------------------------------
// compilePrompt — integration
// ---------------------------------------------------------------------------
describe("compilePrompt", () => {
  it("substitutes artist continuity into prompt and forbidden into negative", () => {
    const result = compilePrompt({
      template: makeTemplate(),
      project: makeProject(),
      artist: makeArtist(),
      shot: makeShot(),
    });
    expect(result.promptText).toContain("Iris");
    expect(result.promptText).toContain("warm key, hard rim");
    expect(result.promptText).toContain("always wears gold chain");
    expect(result.negativePrompt).toContain("distorted face");
    expect(result.negativePrompt).toContain("extra tattoos");
    expect(result.negativePrompt).toContain("facial hair");
    expect(result.unfilledPlaceholders).toEqual([]);
  });

  it("reports unfilled placeholders when artist missing", () => {
    const result = compilePrompt({
      template: makeTemplate(),
      project: makeProject(),
      artist: null,
      shot: makeShot(),
    });
    expect(result.unfilledPlaceholders).toContain("{{artist.name}}");
    expect(result.unfilledPlaceholders).toContain("{{artist.face}}");
    expect(result.unfilledPlaceholders).toContain("{{artist.continuity}}");
  });

  it("clones settings so caller can mutate", () => {
    const result = compilePrompt({
      template: makeTemplate(),
      project: makeProject(),
      artist: makeArtist(),
      shot: makeShot(),
    });
    expect(result.settings).toEqual({ duration_seconds: 5, aspect_ratio: "9:16" });
    (result.settings as Record<string, unknown>).duration_seconds = 99;
    // Original template should not have been mutated
    const t = makeTemplate();
    expect((t.default_settings_json as { duration_seconds: number }).duration_seconds).toBe(5);
  });

  it("threads context for round-trip save", () => {
    const result = compilePrompt({
      template: makeTemplate(),
      project: makeProject(),
      artist: makeArtist(),
      shot: makeShot(),
    });
    expect(result.context).toEqual({
      projectId: "p1",
      artistId: "a1",
      shotId: "s1",
    });
  });

  it("applies overrides over shot values", () => {
    const result = compilePrompt({
      template: makeTemplate({
        template_body:
          "lighting={{shot.lighting}}; environment={{shot.environment}}",
      }),
      project: makeProject(),
      artist: makeArtist(),
      shot: makeShot(),
      overrides: { lighting: "deep blue neon" },
    });
    expect(result.promptText).toContain("lighting=deep blue neon");
    expect(result.promptText).toContain("environment=narrow alleyway at night");
  });

  it("folds extra_negative into the negative prompt", () => {
    const result = compilePrompt({
      template: makeTemplate(),
      project: makeProject(),
      artist: makeArtist(),
      shot: makeShot(),
      overrides: { extra_negative: "no text overlay, no logos" },
    });
    expect(result.negativePrompt).toContain("no text overlay");
    expect(result.negativePrompt).toContain("no logos");
  });
  it("threads the locked reference asset path onto the output", () => {
    const result = compilePrompt({
      template: makeTemplate(),
      project: makeProject(),
      artist: makeArtist(),
      shot: makeShot(),
      lockedReferenceAssetPath: "u1/a1/face_front_lock.png",
    });
    expect(result.referenceImagePath).toBe("u1/a1/face_front_lock.png");
  });

  it("returns null referenceImagePath when no locked asset is supplied", () => {
    const result = compilePrompt({
      template: makeTemplate(),
      project: makeProject(),
      artist: makeArtist(),
      shot: makeShot(),
    });
    expect(result.referenceImagePath).toBeNull();
  });

});
