import { describe, expect, it } from "vitest";
import type { GridClip } from "@/lib/treatment/grid";
import { ShotSpecSchema } from "@/lib/treatment/shotSpec";
import {
  planWithMock,
  MockCreativeDirectorPlanner,
  getPlanner,
  listPlanners,
  DEFAULT_PLANNER_ID,
} from "./planner";
import { DEFAULT_CAPABILITIES, type ProviderCapabilities } from "./capabilities";
import type { CreativeBrief, PlanInput } from "./types";

const GRID: GridClip[] = [
  { key: "c001", start: 0, end: 4, section: "intro", energy: "low" },
  { key: "c002", start: 4, end: 7, section: "verse", energy: "mid" },
  { key: "c003", start: 7, end: 10, section: "hook", energy: "high" },
  { key: "c004", start: 10, end: 12, section: "hook", energy: "drop" },
  { key: "c005", start: 12, end: 16, section: "outro", energy: "low" },
];

const BRIEF: CreativeBrief = {
  format: "music_video",
  concept: "Late-night rooftop confidence",
  mood: "Opulent",
  visualStyle: "high-contrast, kinetic",
  wardrobe: [
    { name: "Opening look", description: "tailored coat" },
    { name: "Hook look", description: "monochrome" },
  ],
  sourceFootage: [{ description: "full-song rooftop performance", durationSeconds: 200 }],
};

function baseInput(over: Partial<PlanInput> = {}): PlanInput {
  return { brief: BRIEF, grid: GRID, ...over };
}

describe("planWithMock", () => {
  it("produces one valid ShotSpec per grid clip, timeline-aligned", () => {
    const plan = planWithMock(baseInput());
    expect(plan.shots).toHaveLength(GRID.length);
    plan.shots.forEach((spec, i) => {
      // Every shot validates against the contract.
      expect(() => ShotSpecSchema.parse(spec)).not.toThrow();
      // Grid owns timing — the planner never moves cut points.
      expect(spec.timeline.start).toBe(GRID[i].start);
      expect(spec.timeline.end).toBe(GRID[i].end);
      expect(spec.id).toBe(GRID[i].key);
      expect(spec.order).toBe(i);
    });
  });

  it("is deterministic — same input yields identical output", () => {
    const a = planWithMock(baseInput());
    const b = planWithMock(baseInput());
    expect(JSON.stringify(a.shots)).toBe(JSON.stringify(b.shots));
    expect(a.rationale).toBe(b.rationale);
  });

  it("speaks filmmaker language in purpose + direction", () => {
    const plan = planWithMock(baseInput());
    const intro = plan.shots[0];
    expect(intro.purpose.length).toBeGreaterThan(0);
    expect(intro.performanceDirection.length).toBeGreaterThan(0);
    // Low-energy intro is wide and deliberate.
    expect(intro.framing).toBe("wide");
    // High-energy hook pulls in.
    expect(plan.shots[2].framing).toBe("medium_close");
    // The drop gets a punch-in accent.
    expect(plan.shots[3].fx.length).toBeGreaterThan(0);
    expect(plan.shots[3].priority).toBe("hero");
  });

  it("rotates supplied wardrobe by section without hardcoding a brand", () => {
    const plan = planWithMock(baseInput());
    const names = new Set(plan.shots.map((s) => s.wardrobe.name).filter(Boolean));
    // Uses ONLY the names we supplied — nothing invented, no YSL.
    expect([...names].every((n) => ["Opening look", "Hook look"].includes(n))).toBe(true);
    expect(names.size).toBeGreaterThan(1);
    const joined = JSON.stringify(plan).toLowerCase();
    expect(joined).not.toContain("ysl");
    expect(joined).not.toContain("saint laurent");
  });

  it("leaves wardrobe open when the brief supplies no looks", () => {
    const plan = planWithMock(baseInput({ brief: { ...BRIEF, wardrobe: [] } }));
    expect(plan.shots.every((s) => s.wardrobe.name === "")).toBe(true);
  });

  it("only recommends engines within capabilities", () => {
    const plan = planWithMock(baseInput());
    const allowed = new Set(DEFAULT_CAPABILITIES.engines.map((e) => e.engine));
    for (const s of plan.shots) {
      if (s.generation.required) {
        expect(s.generation.engine).not.toBeNull();
        expect(allowed.has(s.generation.engine!)).toBe(true);
      }
    }
  });

  it("prefers captured footage for performance when footage is available", () => {
    const plan = planWithMock(baseInput());
    const performance = plan.shots.filter((s) => s.kind === "performance");
    expect(performance.length).toBeGreaterThan(0);
    // Performance beats cut from footage → captured source, no generation.
    expect(performance.every((s) => s.source.kind === "captured")).toBe(true);
    expect(performance.every((s) => !s.generation.required)).toBe(true);
  });

  it("plans generation for performance when NO footage is available", () => {
    const noFootage: ProviderCapabilities = { ...DEFAULT_CAPABILITIES, hasSourceFootage: false };
    const plan = planWithMock(
      baseInput({ brief: { ...BRIEF, sourceFootage: [] }, capabilities: noFootage }),
    );
    // With capabilities honoured, no shot should reference an engine we can't run.
    const allowed = new Set(DEFAULT_CAPABILITIES.engines.map((e) => e.engine));
    for (const s of plan.shots) {
      if (s.generation.engine) expect(allowed.has(s.generation.engine)).toBe(true);
    }
  });

  it("derives ordered, de-duplicated sections", () => {
    const plan = planWithMock(baseInput());
    expect(plan.sections.map((s) => s.name)).toEqual(["intro", "verse", "hook", "outro"]);
    expect(plan.sections.every((s) => s.intent.length > 0)).toBe(true);
  });

  it("handles an empty grid without throwing", () => {
    const plan = planWithMock(baseInput({ grid: [] }));
    expect(plan.shots).toHaveLength(0);
    expect(plan.sections).toHaveLength(0);
  });
});

describe("planner registry", () => {
  it("registers the mock planner as the default", () => {
    const planner = getPlanner(DEFAULT_PLANNER_ID);
    expect(planner).not.toBeNull();
    expect(planner!.isFree).toBe(true);
    expect(listPlanners().some((p) => p.id === "mock")).toBe(true);
  });

  it("MockCreativeDirectorPlanner.planSequence matches planWithMock + a timestamp", async () => {
    const planner = new MockCreativeDirectorPlanner();
    const viaAdapter = await planner.planSequence(baseInput());
    const viaCore = planWithMock(baseInput());
    expect(JSON.stringify(viaAdapter.shots)).toBe(JSON.stringify(viaCore.shots));
  });
});
