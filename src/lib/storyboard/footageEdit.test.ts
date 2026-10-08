/**
 * Footage inheritance across variations, and the edits a variation owns.
 *
 * The numbers in §1 are the REAL ones from the YSL (Ice On) project on 8 October 2026 — one uploaded take,
 * hero_clip_hd_1080.mp4, 190.34015 s, matched to the song by hand at +0.8538 s — because the defect reported was
 * about that take in that project. §1 is the regression test for the inheritance itself: it fails if a change
 * ever makes an original take stop reaching a variation's boxes.
 */
import { describe, expect, it } from "vitest";
import { boxMedia, type Assignment, type MediaAsset } from "./media";
import { coverageLabel, editOf, NO_EDIT, planFootageEdit, takeCoverage } from "./footageEdit";
import type { PerformanceSync } from "@/lib/sync/performanceSync";
import type { StoryboardBox } from "./boxes";

/** The one real uploaded take of the YSL project. */
const HERO: MediaAsset = {
  id: "70304981-d375-47a9-81df-aa062c62c6ec",
  assetType: "reference_video",
  footageRole: "performance",
  bucket: "project-references",
  path: "hero_clip_hd_1080.mp4",
  playback: null,
  name: "hero_clip_hd_1080.mp4",
  mime: "video/mp4",
  isVideo: true,
  isImage: false,
  durationSeconds: 190.34015,
  shotId: null,
  sourceTool: "manual",
  providerJobId: null,
  createdAt: "2026-07-20T14:35:03.780Z",
  derivedFrom: null,
  shows: "a woodland-camouflage short-sleeve military shirt, a navy baseball cap",
  filmedIn: "from the thighs up, in front of a white door",
  beatCheck: null,
  takeCheck: null,
  footageAnalyses: [],
  acceptance: null,
};

/** A restaged clip: one moment of the take, made for ONE variation's shot. Never offered under another shot. */
const RESTAGED: MediaAsset = {
  ...HERO,
  id: "beb97940-4676-480f-93d9-32eb4a611015",
  assetType: "generated_clip",
  name: "restaged 62.7 s",
  durationSeconds: 3.92,
  derivedFrom: { assetId: HERO.id, songStart: 62.749, sourceWindow: [61.9, 65.8], method: "restaged" },
};

const SYNC: PerformanceSync = {
  id: "28dbe292-dddf-4662-8305-d0948d7af102",
  projectId: "764a63d2-93cd-44f3-905f-292f14ab2f51",
  songAssetId: null,
  performanceAssetId: HERO.id,
  offsetSeconds: 0.8538,
  driftPpm: 0,
  method: "manual",
  status: "manual",
  confidence: {},
  notes: null,
} as unknown as PerformanceSync;

/** A box of one variation. Boxes are variation-scoped; this is the only thing that differs between variations. */
const box = (id: string, start: number, end: number) => ({ id, start, end }) as unknown as StoryboardBox;

const assignment = (over: Partial<Assignment> & { id: string; shotId: string; assetId: string }): Assignment => ({
  projectId: "p",
  role: "performance",
  sourceIn: null,
  sourceOut: null,
  trimHead: 0,
  trimTail: 0,
  excluded: false,
  isPrimary: true,
  sortOrder: 0,
  notes: null,
  createdAt: "2026-10-08T00:00:00Z",
  updatedAt: "2026-10-08T00:00:00Z",
  ...over,
});

const assets = new Map([HERO, RESTAGED].map((a) => [a.id, a]));

describe("1 · an original take reaches a variation that has never seen it", () => {
  // Interrupted Broadcast's own boxes: the same 3.92 s grid, in a variation with no assignments at all
  const IB = box("ib-c005", 15.68, 19.6);

  it("is offered under a box of a variation with no footage rows of its own", () => {
    const m = boxMedia({ box: IB, assignments: [], assets, syncs: [SYNC] });
    const base = m.items.find((i) => i.base);
    expect(base?.asset.id).toBe(HERO.id);
    expect(m.showing?.asset.id).toBe(HERO.id);
  });

  it("is offered at the range the SYNC puts it at, not from the top of the file", () => {
    const m = boxMedia({ box: IB, assignments: [], assets, syncs: [SYNC] });
    const base = m.items.find((i) => i.base)!;
    // song 15.68 s maps to take 14.8262 s through a +0.8538 s offset, and one song second is one take second
    expect(base.sourceIn).toBeCloseTo(14.8262, 4);
    expect(base.sourceOut).toBeCloseTo(18.7462, 4);
    expect(base.sourceOut! - base.sourceIn!).toBeCloseTo(IB.end - IB.start, 4);
  });

  it("is offered to EVERY variation's boxes from the one project sync — nothing is per-variation", () => {
    const paris = boxMedia({ box: box("pbr-c005", 15.68, 19.6), assignments: [], assets, syncs: [SYNC] });
    const ib = boxMedia({ box: IB, assignments: [], assets, syncs: [SYNC] });
    expect(ib.items.find((i) => i.base)?.sourceIn).toBeCloseTo(paris.items.find((i) => i.base)!.sourceIn!, 6);
  });

  it("stops being offered past the end of the recording, rather than showing a frozen last frame", () => {
    // the recording ends at song 191.19 s; the board runs to 201.87 s
    const past = boxMedia({ box: box("ib-c050", 194, 197.92), assignments: [], assets, syncs: [SYNC] });
    expect(past.items.find((i) => i.base)).toBeUndefined();
    expect(past.showing).toBeNull();
  });

  it("does NOT offer another variation's restaged clips under this variation's boxes", () => {
    // the restaged clip has its own confirmed sync in the real project; it is one moment of a take, made for one
    // shot of one variation, and must never appear as the base layer of a different shot
    const restagedSync = { ...SYNC, id: "s2", performanceAssetId: RESTAGED.id, offsetSeconds: 62.749, status: "confirmed" } as PerformanceSync;
    const m = boxMedia({ box: box("ib-c017", 62.72, 66.64), assignments: [], assets, syncs: [SYNC, restagedSync] });
    expect(m.items.filter((i) => i.base).map((i) => i.asset.id)).toEqual([HERO.id]);
  });
});

describe("2 · a trim is a narrowing, never a slide", () => {
  const B = box("c005", 15.68, 19.6);

  it("takes seconds off the head without moving the footage", () => {
    const whole = takeCoverage({ box: B, sync: SYNC, takeDurationSeconds: HERO.durationSeconds });
    const trimmed = takeCoverage({ box: B, sync: SYNC, takeDurationSeconds: HERO.durationSeconds, edit: { head: 0.5, tail: 0, excluded: false } });
    // the picture starts half a second later IN THE FILE TOO — the same moment of the performance, not an earlier one
    expect(trimmed.sourceIn).toBeCloseTo(whole.sourceIn! + 0.5, 4);
    expect(trimmed.sourceOut).toBeCloseTo(whole.sourceOut!, 4);
    expect(trimmed.leadIn).toBeCloseTo(0.5, 4);
    expect(trimmed.from).toBe("trimmed");
  });

  it("takes seconds off the tail and says how much of the shot is left uncovered", () => {
    const c = takeCoverage({ box: B, sync: SYNC, takeDurationSeconds: HERO.durationSeconds, edit: { head: 0.25, tail: 0.75, excluded: false } });
    expect(c.sourceOut! - c.sourceIn!).toBeCloseTo(3.92 - 1.0, 4);
    expect(c.leadIn).toBeCloseTo(0.25, 4);
    expect(c.tailOut).toBeCloseTo(0.75, 4);
    expect(c.coverage).toBe("partial");
  });

  it("survives a corrected sync, because the trim was never stored as file seconds", () => {
    const corrected = { ...SYNC, offsetSeconds: 1.3538 } as PerformanceSync;
    const before = takeCoverage({ box: B, sync: SYNC, takeDurationSeconds: HERO.durationSeconds, edit: { head: 0.5, tail: 0, excluded: false } });
    const after = takeCoverage({ box: B, sync: corrected, takeDurationSeconds: HERO.durationSeconds, edit: { head: 0.5, tail: 0, excluded: false } });
    // the trim is still half a second of the shot; the file position moved with the sync, as it must
    expect(after.leadIn).toBeCloseTo(before.leadIn, 6);
    expect(after.sourceIn).toBeCloseTo(before.sourceIn! - 0.5, 4);
  });

  it("reports a trim that leaves nothing as a removal, not as a zero-length clip", () => {
    const c = takeCoverage({ box: B, sync: SYNC, takeDurationSeconds: HERO.durationSeconds, edit: { head: 2, tail: 2, excluded: false } });
    expect(c.from).toBe("emptied");
    expect(c.sourceIn).toBeNull();
  });

  it("distinguishes a deliberate exclusion from a take that simply has no footage here", () => {
    expect(takeCoverage({ box: B, sync: SYNC, takeDurationSeconds: HERO.durationSeconds, edit: { ...NO_EDIT, excluded: true } }).from).toBe("excluded");
    expect(takeCoverage({ box: box("late", 194, 197.92), sync: SYNC, takeDurationSeconds: HERO.durationSeconds }).from).toBe("uncovered");
    expect(takeCoverage({ box: B, sync: { ...SYNC, status: "auto" } as PerformanceSync, takeDurationSeconds: HERO.durationSeconds }).from).toBe("unsynced");
    expect(coverageLabel({ ...takeCoverage({ box: B, sync: SYNC, takeDurationSeconds: HERO.durationSeconds }) })).toContain("covers the shot");
  });
});

describe("3 · the edit is what the box plays", () => {
  const B = box("c005", 15.68, 19.6);

  it("a trimmed take plays its trimmed range, not the whole synced coverage", () => {
    const a = assignment({ id: "a1", shotId: B.id, assetId: HERO.id, trimHead: 0.5, trimTail: 0.4 });
    const m = boxMedia({ box: B, assignments: [a], assets, syncs: [SYNC] });
    const item = m.items.find((i) => i.assignmentId === "a1")!;
    expect(item.sourceOut! - item.sourceIn!).toBeCloseTo(3.92 - 0.9, 4);
    expect(item.leadIn).toBeCloseTo(0.5, 4);
    expect(item.edit?.from).toBe("trimmed");
    expect(m.showing?.assignmentId).toBe("a1");
  });

  it("an excluded take is not shown, is not offered again as a base layer, and is not what the cut reaches for", () => {
    const a = assignment({ id: "a1", shotId: B.id, assetId: HERO.id, excluded: true, isPrimary: false });
    const m = boxMedia({ box: B, assignments: [a], assets, syncs: [SYNC] });
    expect(m.items.filter((i) => i.base)).toHaveLength(0);
    expect(m.showing).toBeNull();
    expect(m.items.find((i) => i.assignmentId === "a1")?.edit?.from).toBe("excluded");
  });

  it("an untrimmed assignment is still derived from the sync, exactly as before this feature", () => {
    const a = assignment({ id: "a1", shotId: B.id, assetId: HERO.id });
    const m = boxMedia({ box: B, assignments: [a], assets, syncs: [SYNC] });
    const item = m.items.find((i) => i.assignmentId === "a1")!;
    expect(item.sourceIn).toBeCloseTo(14.8262, 4);
    expect(item.edit?.from).toBe("sync");
  });

  it("reads a row written before the columns existed as 'nothing decided'", () => {
    const legacy = { ...assignment({ id: "a1", shotId: B.id, assetId: HERO.id }) } as Assignment;
    delete (legacy as { trimHead?: unknown }).trimHead;
    delete (legacy as { trimTail?: unknown }).trimTail;
    delete (legacy as { excluded?: unknown }).excluded;
    expect(editOf(legacy)).toEqual(NO_EDIT);
    expect(boxMedia({ box: B, assignments: [legacy], assets, syncs: [SYNC] }).items[0].edit?.from).toBe("sync");
  });
});

describe("4 · one variation's edits cannot reach another", () => {
  // the same song second, the same take, two variations — the ONLY difference is which rows belong to which
  const PBR = box("pbr-c005", 15.68, 19.6);
  const IB = box("ib-c005", 15.68, 19.6);

  it("a trim in one variation leaves the other at the full synced coverage", () => {
    const parisRows = [assignment({ id: "p1", shotId: PBR.id, assetId: HERO.id, trimHead: 1.2 })];
    const paris = boxMedia({ box: PBR, assignments: parisRows, assets, syncs: [SYNC] });
    const ib = boxMedia({ box: IB, assignments: [], assets, syncs: [SYNC] });

    expect(paris.showing!.leadIn).toBeCloseTo(1.2, 4);
    expect(ib.showing!.leadIn).toBe(0);
    expect(ib.showing!.sourceOut! - ib.showing!.sourceIn!).toBeCloseTo(3.92, 4);
  });

  it("an exclusion in one variation does not remove the take from the other", () => {
    const paris = boxMedia({ box: PBR, assignments: [assignment({ id: "p1", shotId: PBR.id, assetId: HERO.id, excluded: true, isPrimary: false })], assets, syncs: [SYNC] });
    const ib = boxMedia({ box: IB, assignments: [], assets, syncs: [SYNC] });
    expect(paris.showing).toBeNull();
    expect(ib.showing?.asset.id).toBe(HERO.id);
  });
});

describe("5 · the edits a director can make", () => {
  const B = box("c005", 15.68, 19.6);

  it("trimming a take that was only OFFERED writes the row that records the decision", () => {
    const { ops, refused } = planFootageEdit({ assignments: [], box: B, assetId: HERO.id, action: { do: "trim", head: 0.5, tail: 0 } });
    expect(refused).toBeNull();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: "insert", assetId: HERO.id, role: "performance", trim_head_seconds: 0.5, trim_tail_seconds: 0, excluded: false, isPrimary: true });
    // never the derived file seconds: the sync stays the only authority for those
    expect(ops[0]).toMatchObject({ sourceIn: null, sourceOut: null });
  });

  it("leaving an offered take out writes a row that is NOT primary", () => {
    const { ops } = planFootageEdit({ assignments: [], box: B, assetId: HERO.id, action: { do: "exclude" } });
    expect(ops[0]).toMatchObject({ op: "insert", excluded: true, isPrimary: false });
  });

  it("excluding the take the box was showing clears the selection too", () => {
    const row = assignment({ id: "a1", shotId: B.id, assetId: HERO.id, isPrimary: true });
    const { ops } = planFootageEdit({ assignments: [row], box: B, assetId: HERO.id, action: { do: "exclude" } });
    expect(ops[0]).toEqual({ op: "update", id: "a1", patch: { trim_head_seconds: 0, trim_tail_seconds: 0, excluded: true, is_primary: false } });
  });

  it("restoring an excluded take keeps the trim it had", () => {
    const row = assignment({ id: "a1", shotId: B.id, assetId: HERO.id, excluded: true, isPrimary: false, trimHead: 0.8 });
    const { ops } = planFootageEdit({ assignments: [row], box: B, assetId: HERO.id, action: { do: "restore" } });
    expect(ops[0]).toEqual({ op: "update", id: "a1", patch: { trim_head_seconds: 0.8, trim_tail_seconds: 0, excluded: false } });
  });

  it("resetting goes back to the whole synced coverage", () => {
    const row = assignment({ id: "a1", shotId: B.id, assetId: HERO.id, trimHead: 0.8, trimTail: 0.4 });
    const { ops } = planFootageEdit({ assignments: [row], box: B, assetId: HERO.id, action: { do: "reset" } });
    expect(ops[0]).toEqual({ op: "update", id: "a1", patch: { trim_head_seconds: 0, trim_tail_seconds: 0, excluded: false } });
  });

  it("refuses a trim that would leave no picture, and says to leave the take out instead", () => {
    const { ops, refused } = planFootageEdit({ assignments: [], box: B, assetId: HERO.id, action: { do: "trim", head: 2, tail: 2 } });
    expect(ops).toEqual([]);
    expect(refused).toMatch(/leave it out instead/);
  });

  it("writes nothing when nothing changed", () => {
    const row = assignment({ id: "a1", shotId: B.id, assetId: HERO.id, trimHead: 0.5 });
    expect(planFootageEdit({ assignments: [row], box: B, assetId: HERO.id, action: { do: "trim", head: 0.5, tail: 0 } }).ops).toEqual([]);
    expect(planFootageEdit({ assignments: [], box: B, assetId: HERO.id, action: { do: "reset" } }).ops).toEqual([]);
  });

  it("edits only the row of the box it was given, never the same take on another box", () => {
    const rows = [
      assignment({ id: "a1", shotId: "c005", assetId: HERO.id }),
      assignment({ id: "a2", shotId: "c006", assetId: HERO.id }),
    ];
    const { ops } = planFootageEdit({ assignments: rows, box: B, assetId: HERO.id, action: { do: "trim", head: 0.3, tail: 0 } });
    expect(ops).toEqual([{ op: "update", id: "a1", patch: { trim_head_seconds: 0.3, trim_tail_seconds: 0, excluded: false } }]);
  });
});
