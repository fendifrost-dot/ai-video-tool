import { describe, expect, it, vi } from "vitest";

// boxShot is pure; the module's other exports reach the browser's Supabase client, which a test has no use for
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/worldBatch/browserDeps", () => ({ browserRunnerDeps: vi.fn() }));

import { parseShotSpec } from "@/lib/treatment/shotSpec";
import { boxFromRow, boxWrite, type BoxRow } from "./boxes";
import { boxPromptConflicts, boxShot, FULL_BLEED, imageEstimateUsd, madeFromBox, NO_MARKS, wardrobeWords } from "./generate";
import { indexEntities, type ContinuityEntity } from "@/lib/continuity/entities";
import { resolveCast } from "@/lib/casting/cast";

function box(shotType: "b_roll" | "performance") {
  const spec = parseShotSpec({ id: "c001", purpose: "a ring on a marble console under one hard light", shotType, kind: shotType === "performance" ? "performance" : "broll", timeline: { start: 0, end: 4 } });
  const w = boxWrite({ key: "c001", start: 0, end: 4, section: "hook", generated: spec, override: null, locked: false, origin: "treatment", history: [] });
  return boxFromRow({ id: "r1", project_id: "p1", shot_number: 1, ...w, updated_at: "2026-10-03T00:00:00Z" } as BoxRow)!;
}

describe("a box's generation request follows the project's frame", () => {
  it("is 9:16 when the project says nothing, as it always was", () => {
    expect(boxShot(box("b_roll"), []).aspect).toBe("9:16");
  });

  it("asks for the project's shape", () => {
    expect(boxShot(box("b_roll"), [], { aspect: "16:9" }).aspect).toBe("16:9");
    expect(boxShot(box("b_roll"), [], { aspect: "1:1" }).aspect).toBe("1:1");
    expect(boxShot(box("performance"), [], { aspect: "16:9" }).aspect).toBe("16:9");
  });

  it("asks for the nearest shape the image model has when it has no 4:5", () => {
    expect(boxShot(box("b_roll"), [], { aspect: "4:5" }).aspect).toBe("3:4");
  });
});

describe("every picture the storyboard draws", () => {
  it("is asked for without logos, brand marks or lettering — a cutaway and a performance shot's place alike", () => {
    expect(boxShot(box("b_roll"), []).prompt).toContain(NO_MARKS);
    const place = boxShot(box("performance"), []).prompt;
    expect(place).toContain(NO_MARKS);
    expect(place.match(/Nothing in the picture carries a logo/g)).toHaveLength(1);
  });

  it("forbids the marks nobody asked for, not the one the shot names", () => {
    expect(NO_MARKS).toContain("other than what this description itself names");
    const spec = parseShotSpec({ id: "c001", purpose: "From high above a burning forest at night, an enormous YSL monogram is cut into the forest floor, fire around its edge", shotType: "b_roll", kind: "broll", timeline: { start: 0, end: 4 } });
    const w = boxWrite({ key: "c001", start: 0, end: 4, section: "intro", generated: spec, override: null, locked: false, origin: "treatment", history: [] });
    const prompt = boxShot(boxFromRow({ id: "r1", project_id: "p1", shot_number: 1, ...w, updated_at: "2026-10-07T00:00:00Z" } as BoxRow)!, []).prompt;
    expect(prompt).toContain("YSL monogram is cut into the forest floor");
    expect(prompt).not.toContain("Nothing in the picture carries a logo, a brand mark or readable lettering.");
  });

  it("is asked for as the whole frame — no border, frame line or bars — once", () => {
    for (const kind of ["b_roll", "performance"] as const) {
      const prompt = boxShot(box(kind), []).prompt;
      expect(prompt.endsWith(FULL_BLEED)).toBe(true);
      expect(prompt.match(/fills the frame from edge to edge/g)).toHaveLength(1);
    }
  });

  it("is asked for as the scene, never as a scan of film — no leak, scratch or hair", () => {
    expect(FULL_BLEED).toMatch(/not a scan of a film frame/);
    expect(FULL_BLEED).toMatch(/no light leak at the edges/);
    expect(FULL_BLEED).toMatch(/no scratches, dust or hair/);
  });
});

describe("a correction on the shot that the words appended to its prompt would undo is said before the spend", () => {
  const walkers = (description: string): ContinuityEntity => ({ id: "e1", projectId: "p1", variationId: "v1", kind: "character", key: "THE_WALKERS", name: "The walkers", description, constraints: "", approvedAssetId: null, referenceAssetIds: [], cast: { role: "fictional", identityMode: "invent", artistId: null }, outfit: null, archived: false, createdAt: "t", updatedAt: "t" });
  function ground(description: string, action = "cross paths") {
    const spec = parseShotSpec({ id: "c003", purpose: "At eye level, walkers pass close to the lens among burning trees. No visible ACME letters, emblem geometry, or logo-shaped cleared paths.", shotType: "b_roll", kind: "broll", timeline: { start: 8, end: 12 }, cast: { members: [{ key: "THE_WALKERS", action, placement: "among the trees", framing: "medium", identityMode: null }], open: false, none: false } });
    const w = boxWrite({ key: "c003", start: 8, end: 12, section: "intro", generated: spec, override: null, locked: false, origin: "treatment", history: [] });
    const b = boxFromRow({ id: "r3", project_id: "p1", shot_number: 3, ...w, updated_at: "2026-10-09T00:00:00Z" } as BoxRow)!;
    return { b, cast: resolveCast(b.spec, indexEntities([walkers(description)])) };
  }

  it("a character whose own description asks for the name the shot refuses is reported, with whose words they are", () => {
    const { b, cast } = ground("People walking the cleared strokes of the ACME emblem cut into the forest floor.");
    expect(boxPromptConflicts(b, { cast })).toEqual([expect.objectContaining({ name: "ACME", from: "The walkers", askedBy: expect.stringContaining("ACME emblem") })]);
    // the request is still built — the note is for a person to read in the confirmation and in the driver's output
    expect(boxShot(b, [], { cast }).prompt).toContain("ACME emblem");
  });

  it("the description is read, not what this shot says the character does; once it agrees with the shot there is nothing to say", () => {
    expect(boxPromptConflicts(ground("People in the show's looks.", "walk past an ACME banner").b, { cast: ground("People in the show's looks.", "walk past an ACME banner").cast })).toEqual([]);
    const { b, cast } = ground("People in the show's looks, moving in deliberate, intersecting formations.");
    expect(boxPromptConflicts(b, { cast })).toEqual([]);
  });
});

describe("the estimate of a still follows the model that takes its pictures", () => {
  const support = { accepted: true, max: 5, model: null, tiers: [{ model: "model-a", max: 3, usdPerImage: { "2k": 0.07 }, usdPerInputImage: 0 }, { model: "model-b", max: 5, usdPerImage: { "2k": 0.08 }, usdPerInputImage: 0.01 }] };
  it("is the plain rate without pictures and on the usual model, and the larger model's own rate past its limit", () => {
    const shot = boxShot(box("b_roll"), []);
    expect(shot.stills).toBe(2);
    expect(imageEstimateUsd(shot)).toBe(0.14);
    expect(imageEstimateUsd(shot, { pictures: 0, support })).toBe(0.14);
    expect(imageEstimateUsd(shot, { pictures: 3, support })).toBe(0.14);
    expect(imageEstimateUsd(shot, { pictures: 4, support })).toBe(0.24);
    expect(imageEstimateUsd(shot, { pictures: 5, support })).toBe(0.26);
    // a generator that does not take pictures draws from words at the plain rate
    expect(imageEstimateUsd(shot, { pictures: 5, support: { ...support, accepted: false } })).toBe(0.14);
  });
});

describe("what a job remembers of the shot it was made from", () => {
  it("is the treatment the scene was written from, when, and when the shot last changed", () => {
    const spec = parseShotSpec({ id: "c001", purpose: "a ring on a marble console", shotType: "b_roll", kind: "broll", timeline: { start: 0, end: 4 }, provenance: { source: "ai", createdAt: "2026-10-07T03:00:00.000Z", treatment: "57:abc123" } });
    const w = boxWrite({ key: "c001", start: 0, end: 4, section: "hook", generated: spec, override: null, locked: false, origin: "treatment", history: [] });
    const b = boxFromRow({ id: "r1", project_id: "p1", shot_number: 1, ...w, updated_at: "2026-10-07T03:00:01Z" } as BoxRow)!;
    expect(madeFromBox(b)).toEqual({ treatment: "57:abc123", sceneWrittenAt: "2026-10-07T03:00:00.000Z", shotUpdatedAt: "2026-10-07T03:00:01Z" });
    // a shot from before stamps says so, rather than borrowing the current treatment's
    expect(madeFromBox(box("b_roll")).treatment).toBeNull();
  });
});


describe("what the shot dresses the artist in", () => {
  const wardrobe = (description: string, name = "") => ({ wardrobe: { name, description, lookId: null, references: [], source: "treatment" as const, garments: [], outfitMode: "inherit" as const, outfitKey: null } });
  it("is the writer's words when the shot points at no Look record", () => {
    expect(wardrobeWords(wardrobe("exact YSL denim look"), null)).toBe("exact YSL denim look");
    expect(wardrobeWords(wardrobe("exact YSL denim look", "Look A"), null)).toBe("Look A: exact YSL denim look");
  });
  it("is nothing when the writer dressed him in nothing", () => {
    expect(wardrobeWords(wardrobe("none"), null)).toBe("");
    expect(wardrobeWords(wardrobe(""), null)).toBe("");
  });
  it("is the Look record's words when the shot points at one", () => {
    expect(wardrobeWords(wardrobe("exact YSL denim look"), { name: "Denim look", description: "black denim trucker jacket over black jeans" })).toBe("Denim look: black denim trucker jacket over black jeans");
    expect(wardrobeWords(wardrobe("exact YSL denim look"), { name: "Denim look", description: null })).toBe("Denim look");
  });
});
