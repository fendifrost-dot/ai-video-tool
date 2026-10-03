import { describe, expect, it, vi } from "vitest";

// boxShot is pure; the module's other exports reach the browser's Supabase client, which a test has no use for
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/worldBatch/browserDeps", () => ({ browserRunnerDeps: vi.fn() }));

import { parseShotSpec } from "@/lib/treatment/shotSpec";
import { boxFromRow, boxWrite, type BoxRow } from "./boxes";
import { boxShot, FULL_BLEED, NO_MARKS } from "./generate";

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

  it("is asked for as the whole frame — no border, frame line or bars — once", () => {
    for (const kind of ["b_roll", "performance"] as const) {
      const prompt = boxShot(box(kind), []).prompt;
      expect(prompt.endsWith(FULL_BLEED)).toBe(true);
      expect(prompt.match(/fills the frame from edge to edge/g)).toHaveLength(1);
    }
  });
});
