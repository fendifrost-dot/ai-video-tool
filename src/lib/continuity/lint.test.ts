import { describe, expect, it } from "vitest";
import {
  containsPhrase,
  extractMustInclude,
  lintShotContinuity,
  splitPhrases,
} from "./lint";
import type { Artist, Shot } from "@/integrations/supabase/types";

function makeArtist(overrides: Partial<Artist> = {}): Artist {
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
    ...overrides,
  };
}

function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: "s1",
    user_id: "u1",
    project_id: "p1",
    shot_number: 1,
    song_section: "verse_1",
    timestamp_start: 0,
    timestamp_end: 5,
    duration_seconds: 5,
    shot_type: "performance",
    scene_description: "",
    camera_direction: "",
    lighting: "",
    wardrobe: "",
    environment: "",
    recommended_tool: null,
    priority: "normal",
    status: "planned",
    notes: null,
    created_at: "2026-05-15T00:00:00Z",
    updated_at: "2026-05-15T00:00:00Z",
    ...overrides,
  };
}

describe("splitPhrases", () => {
  it("splits on commas", () => {
    expect(splitPhrases("no jewelry, no logos")).toEqual(["no jewelry", "no logos"]);
  });
  it("splits on newlines too", () => {
    expect(splitPhrases("no jewelry\nno logos")).toEqual(["no jewelry", "no logos"]);
  });
  it("drops empty entries", () => {
    expect(splitPhrases("a,,b, ,c")).toEqual(["a", "b", "c"]);
  });
  it("returns [] for null/undefined/empty", () => {
    expect(splitPhrases(null)).toEqual([]);
    expect(splitPhrases(undefined)).toEqual([]);
    expect(splitPhrases("")).toEqual([]);
  });
});

describe("containsPhrase", () => {
  it("matches case-insensitively", () => {
    expect(containsPhrase("A NEON SIGN", "neon sign")).toBe(true);
  });
  it("requires word boundary at the start", () => {
    expect(containsPhrase("snowy field", "no")).toBe(false);
    expect(containsPhrase("nope ahead", "no")).toBe(true); // 'no' at index 0
  });
  it("matches in the middle when preceded by whitespace", () => {
    expect(containsPhrase("a long no entry zone", "no entry")).toBe(true);
  });
  it("returns false for empty phrase", () => {
    expect(containsPhrase("anything", "")).toBe(false);
  });
});

describe("extractMustInclude", () => {
  it("captures 'always wears X'", () => {
    expect(extractMustInclude("always wears gold chain")).toEqual(["gold chain"]);
  });
  it("captures 'must include X'", () => {
    expect(extractMustInclude("must include a left-arm tattoo")).toEqual([
      "left-arm tattoo",
    ]);
  });
  it("stops capture at comma/period", () => {
    expect(
      extractMustInclude("always wears gold chain, sometimes wears hat"),
    ).toEqual(["gold chain"]);
  });
  it("dedupes across multiple matches", () => {
    expect(
      extractMustInclude(
        "always wears gold chain. always wears gold chain. must include gold chain",
      ),
    ).toEqual(["gold chain"]);
  });
  it("returns [] for null/empty", () => {
    expect(extractMustInclude(null)).toEqual([]);
    expect(extractMustInclude("")).toEqual([]);
  });
});

describe("lintShotContinuity", () => {
  it("returns [] when the artist has no rules", () => {
    expect(lintShotContinuity(makeArtist(), makeShot())).toEqual([]);
  });

  it("returns [] when artist is null", () => {
    expect(lintShotContinuity(null, makeShot())).toEqual([]);
  });

  it("flags forbidden phrase in wardrobe", () => {
    const result = lintShotContinuity(
      makeArtist({ forbidden_inaccuracies: "no jewelry" }),
      makeShot({ wardrobe: "leather jacket with no jewelry visible" }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("error");
    expect(result[0].field).toBe("wardrobe");
    expect(result[0].rule).toBe("no jewelry");
  });

  it("flags forbidden phrase across multiple fields", () => {
    const result = lintShotContinuity(
      makeArtist({ forbidden_inaccuracies: "fake teeth" }),
      makeShot({
        scene_description: "iris flashes fake teeth at camera",
        environment: "alleyway",
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe("scene_description");
  });

  it("warns when continuity rule must-include phrase is missing from wardrobe", () => {
    const result = lintShotContinuity(
      makeArtist({ continuity_rules: "always wears gold chain" }),
      makeShot({ wardrobe: "leather jacket, dark jeans" }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("warning");
    expect(result[0].field).toBe("wardrobe");
    expect(result[0].rule).toBe("gold chain");
  });

  it("does NOT warn when must-include phrase is already in wardrobe", () => {
    const result = lintShotContinuity(
      makeArtist({ continuity_rules: "always wears gold chain" }),
      makeShot({ wardrobe: "gold chain, leather jacket" }),
    );
    expect(result).toEqual([]);
  });

  it("returns multiple warnings when multiple rules are violated", () => {
    const result = lintShotContinuity(
      makeArtist({
        forbidden_inaccuracies: "no jewelry, fake teeth",
        continuity_rules: "always wears gold chain",
      }),
      makeShot({
        wardrobe: "no jewelry, plain shirt",
        scene_description: "fake teeth visible",
      }),
    );
    // 2 errors (forbidden) + 1 warning (missing must-include)
    expect(result).toHaveLength(3);
    expect(result.filter((w) => w.severity === "error")).toHaveLength(2);
    expect(result.filter((w) => w.severity === "warning")).toHaveLength(1);
  });
});
