import { describe, expect, it, vi } from "vitest";

// boxShot is pure; the module's other exports reach the browser's Supabase client, which a test has no use for
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/worldBatch/browserDeps", () => ({ browserRunnerDeps: vi.fn() }));

import { parseShotSpec } from "@/lib/treatment/shotSpec";
import { boxFromRow, boxWrite, type BoxRow } from "./boxes";
import { boxShot, FULL_BLEED, madeFromBox, NO_MARKS } from "./generate";

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

