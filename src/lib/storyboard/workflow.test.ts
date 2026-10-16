import { describe, expect, it } from "vitest";
import { DRESS_PROMPT_VERSION, type DressRecord } from "./dress";
import { dressedTakeState, workflowStatus, type WorkflowShot } from "./workflow";

const shot = (over: Partial<WorkflowShot> = {}): WorkflowShot => ({
  performance: false,
  hasTake: false,
  hasSelectedClip: false,
  needsDress: false,
  dressed: [],
  composited: false,
  ...over,
});

describe("the workflow checklist", () => {
  it("an empty project: nothing done, the swap and composite steps say why", () => {
    const steps = workflowStatus({ hasTreatment: false, outfits: 0, scenes: [], shots: [] });
    expect(steps.map((s) => [s.id, s.state, s.count])).toEqual([
      ["treatment", "todo", "0/1"],
      ["outfits", "todo", "0/0"],
      ["ai_shots", "none", "0/0"],
      ["performance", "none", "0/0"],
      ["dress", "none", "0/0"],
      ["integrate", "none", "0/0"],
    ]);
    expect(steps[5]).toMatchObject({
      label: "Integrate (composite)",
      detail: expect.stringMatching(/no shot has a dressed take/),
    });
  });

  it("counts each step from the shots", () => {
    const steps = workflowStatus({
      hasTreatment: true,
      outfits: 2,
      scenes: [{ assigned: true }, { assigned: true }, { assigned: false }],
      shots: [
        shot({ hasSelectedClip: true }),
        shot(),
        shot({ performance: true, hasTake: true, needsDress: true, dressed: [{ stale: false }] }),
        shot({ performance: true, hasTake: true, needsDress: true, dressed: [{ stale: true }] }),
        shot({ performance: true, hasTake: true, needsDress: true }),
        shot({ performance: true, hasTake: true, composited: true }),
        shot({ performance: true }),
      ],
    });
    const by = Object.fromEntries(steps.map((s) => [s.id, s]));
    expect(by.treatment).toMatchObject({ state: "done", count: "1/1" });
    expect(by.outfits).toMatchObject({
      state: "partial",
      count: "2/3",
      detail: "2 outfits · scenes assigned",
    });
    expect(by.ai_shots).toMatchObject({ state: "partial", count: "1/2" });
    expect(by.performance).toMatchObject({ state: "partial", count: "4/5" });
    expect(by.dress).toMatchObject({
      state: "partial",
      count: "1/3",
      stale: 1,
      detail: expect.stringContaining("1 stale"),
    });
    // the lane composites a dressed take: two shots have one, neither is composited; the composite on an undressed
    // shot (filed from outside) is not counted against them
    expect(by.integrate).toMatchObject({ state: "todo", count: "0/2", detail: expect.stringContaining("dressed take") });
  });

  it("a shot with one current and one stale dressed take counts as dressed", () => {
    const by = Object.fromEntries(
      workflowStatus({
        hasTreatment: true,
        outfits: 1,
        scenes: [{ assigned: true }],
        shots: [
          shot({
            performance: true,
            hasTake: true,
            needsDress: true,
            dressed: [{ stale: true }, { stale: false }],
          }),
        ],
      }).map((s) => [s.id, s]),
    );
    expect(by.dress).toMatchObject({ state: "done", count: "1/1", stale: 0 });
    expect(by.outfits.state).toBe("done");
  });
});

describe("a dressed take on its shot, against the state now", () => {
  const record = {
    outfit: { id: "o1", key: "mastic", name: "Mastic", version: 2 },
    window: [71.5, 75.45],
    sync: { offsetSeconds: 0.853, driftPpm: 0 },
    syncId: "s1",
    promptVersion: DRESS_PROMPT_VERSION,
  } as unknown as DressRecord;
  const sync = { id: "s1", offsetSeconds: 0.853, driftPpm: 0, status: "confirmed" };
  // song 72.853–74.603 → take 72.0–73.75
  const box = { start: 72.853, end: 74.603 };

  it("current when the shot still sits inside the dressed cut", () => {
    expect(
      dressedTakeState({ record, box, outfit: record.outfit, parentSync: sync, parentSeconds: 200 })
        .state,
    ).toBe("current");
  });

  it("stale when the shot moved past the handles, or the take lost its sync", () => {
    expect(
      dressedTakeState({
        record,
        box: { start: 76, end: 77.5 },
        outfit: record.outfit,
        parentSync: sync,
        parentSeconds: 200,
      }).reasons.map((r) => r.code),
    ).toEqual(["window_outside"]);
    expect(
      dressedTakeState({
        record,
        box,
        outfit: record.outfit,
        parentSync: { ...sync, status: "rejected" },
        parentSeconds: 200,
      }).reasons.map((r) => r.code),
    ).toEqual(["window_outside", "sync_changed"]);
  });

  it("stale when it carries no record", () => {
    expect(
      dressedTakeState({ record: null, box, outfit: null, parentSync: sync, parentSeconds: 200 })
        .state,
    ).toBe("stale");
  });
});

describe("a dressed take held against what a dress would send now", () => {
  const record = {
    outfit: { id: "o1", key: "mastic", name: "Mastic", version: 2 },
    window: [71.5, 75.45],
    sync: { offsetSeconds: 0.853, driftPpm: 0 },
    syncId: "s1",
    promptVersion: DRESS_PROMPT_VERSION,
    sourceAssetId: "take_1",
    references: [{ pieceId: "j", path: "a/jacket.jpg", angle: "front" }],
    prompt: "the words",
  } as unknown as DressRecord;
  const sync = { id: "s1", offsetSeconds: 0.853, driftPpm: 0, status: "confirmed" };
  const box = { start: 72.853, end: 74.603 };

  it("current when the take, the pictures and the words are the same", () => {
    expect(
      dressedTakeState({
        record,
        box,
        outfit: record.outfit,
        parentSync: sync,
        parentSeconds: 200,
        now: {
          sourceAssetId: "take_1",
          references: [{ path: "a/jacket.jpg" }],
          prompt: "the words",
        },
      }).state,
    ).toBe("current");
  });

  it("flags a replaced picture, other words, or another take", () => {
    const codes = (now: {
      sourceAssetId: string | null;
      references?: { path: string }[];
      prompt?: string;
    }) =>
      dressedTakeState({
        record,
        box,
        outfit: record.outfit,
        parentSync: sync,
        parentSeconds: 200,
        now,
      }).reasons.map((r) => r.code);
    expect(
      codes({
        sourceAssetId: "take_1",
        references: [{ path: "a/jacket_new.jpg" }],
        prompt: "the words",
      }),
    ).toEqual(["references_changed"]);
    expect(
      codes({
        sourceAssetId: "take_1",
        references: [{ path: "a/jacket.jpg" }],
        prompt: "other words",
      }),
    ).toEqual(["prompt_changed"]);
    expect(codes({ sourceAssetId: "take_2" })).toEqual(["take_changed"]);
  });
});
