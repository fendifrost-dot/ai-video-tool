import { describe, expect, it } from "vitest";
import { renderContract } from "./renderContract";
import { parseShotSpec, type ShotSpec } from "@/lib/treatment/shotSpec";
import { fingerprint } from "@/lib/treatment/treatmentDoc";
import { planRelease } from "./rewrite";
import { structuredTreatmentToShotSpecs } from "@/lib/treatment/api";
import {
  BLANK_OVERRIDE,
  applyGenerated,
  applyOverride,
  boxFromRow,
  boxIsStale,
  boxWrite,
  boxesFromRows,
  storyboardShotRows,
  directorSet,
  editedOverride,
  legacyKeyOf,
  machineContext,
  neighbourSummaries,
  nextKey,
  planMaterialize,
  planMerge,
  planSplit,
  resolveSpec,
  rewrittenOverride,
  unlockedForGeneration,
  wardrobeGap,
  writtenFrom,
  type BoxRow,
  type StoryboardBox,
} from "./boxes";
import {
  boxMedia,
  buildTimeline,
  mediaTimeAt,
  planAssign,
  planDeselect,
  planMove,
  planMoveAll,
  planSelect,
  roleForAsset,
  segmentAt,
  sourceOfDerived,
  takeRangeForBox,
  timelineIssues,
  videoStateAt,
  videoTick,
  type Assignment,
  type MediaAsset,
  type TakeSync,
  type TimelineSegment,
} from "./media";

const AT = "2026-10-03T12:00:00.000Z";

function spec(id: string, start: number, end: number, over: Partial<ShotSpec> = {}): ShotSpec {
  return parseShotSpec({ id, purpose: `scene ${id}`, shotType: "b_roll", kind: "broll", timeline: { start, end }, ...over });
}

function rowOf(id: string, key: string, start: number, end: number, extra: Partial<BoxRow> = {}): BoxRow {
  const w = boxWrite({ key, start, end, section: "verse", generated: spec(key, start, end), override: null, locked: false, origin: "treatment", history: [] });
  return { id, project_id: "p1", shot_number: 1, ...w, updated_at: AT, ...extra } as BoxRow;
}

const box = (id: string, key: string, start: number, end: number, extra: Partial<BoxRow> = {}): StoryboardBox => boxFromRow(rowOf(id, key, start, end, extra))!;

describe("box records", () => {
  it("a row without a key is not a storyboard box", () => {
    expect(boxFromRow({ ...rowOf("r1", "c001", 0, 4), spec_key: null })).toBeNull();
  });

  it("the storyboard is the shot list: a leftover row of the old shot list is not counted as a shot of the video", () => {
    const rows = [rowOf("r1", "c001", 0, 4), rowOf("r2", "c002", 4, 8), { id: "old", spec_key: null }];
    // one count everywhere: what the storyboard shows, what Export counts and what the package carries
    expect(storyboardShotRows(rows).map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(boxesFromRows(rows.filter((r): r is BoxRow => "project_id" in r)).length).toBe(2);
    // a project that has no storyboard yet keeps the rows it has
    expect(storyboardShotRows([{ id: "a", spec_key: null }, { id: "b" }]).map((r) => r.id)).toEqual(["a", "b"]);
    expect(storyboardShotRows([])).toEqual([]);
  });

  it("identity is the record and its key, never the position: re-ordering keeps both", () => {
    const rows = [rowOf("r2", "c002", 4, 8), rowOf("r1", "c001", 0, 4)];
    const ordered = boxesFromRows(rows);
    expect(ordered.map((b) => b.key)).toEqual(["c001", "c002"]);
    expect(ordered.map((b) => b.id)).toEqual(["r1", "r2"]);
    // move the first box's window after the second: the order changes, the records do not
    const moved = boxesFromRows([{ ...rows[1], timestamp_start: 8, timestamp_end: 12 }, rows[0]]);
    expect(moved.map((b) => b.key)).toEqual(["c002", "c001"]);
    expect(moved.find((b) => b.key === "c001")!.id).toBe("r1");
  });

  it("the window on the row is the authority for time, not the JSON inside it", () => {
    const r = rowOf("r1", "c001", 0, 4);
    const b = boxFromRow({ ...r, timestamp_start: "10.5", timestamp_end: "13.25" })!;
    expect(b.spec.timeline).toEqual({ start: 10.5, end: 13.25 });
    expect(b.generated.timeline).toEqual({ start: 10.5, end: 13.25 });
  });

  it("resolve applies only what the director changed", () => {
    const g = spec("c001", 0, 4, { performanceDirection: "generated direction", framing: "wide" });
    const s = resolveSpec(g, { direction: "his direction", frame: null, cameraMotion: null, framing: null, transitionIn: null, requiredElements: null, notes: null }, { start: 0, end: 4 }, "c001");
    expect(s.performanceDirection).toBe("his direction");
    expect(s.framing).toBe("wide");
    expect(s.origin).toBe("override");
  });

  it("the box type is the director's to change", () => {
    const g = spec("c001", 0, 4);
    const s = resolveSpec(g, { direction: null, cameraMotion: null, framing: null, transitionIn: null, requiredElements: null, notes: null, shotType: "performance" }, { start: 0, end: 4 }, "c001");
    expect(s.shotType).toBe("performance");
    expect(s.kind).toBe("performance");
  });

  it("an edit locks the box; clearing it hands the box back, and the earlier scene is kept in history", () => {
    const b = box("r1", "c001", 0, 4);
    const w = applyOverride(b, { direction: "mine", cameraMotion: null, framing: null, transitionIn: null, requiredElements: null, notes: null }, AT);
    expect(w.locked).toBe(true);
    expect(w.spec_json.performanceDirection).toBe("mine");
    expect(w.history_json.at(-1)?.purpose).toBe("scene c001");
    const edited = boxFromRow({ ...rowOf("r1", "c001", 0, 4), ...w, id: "r1", project_id: "p1", shot_number: 1 } as BoxRow)!;
    const back = applyOverride(edited, null, AT);
    expect(back.locked).toBe(false);
    expect(back.override_json).toBeNull();
    expect(back.spec_json.origin).toBe("generated");
  });

  it("the write keeps the JSON and the legacy text columns in step", () => {
    const w = boxWrite({ key: "c009", start: 1.004, end: 5.006, section: "hook", generated: spec("x", 0, 1, { purpose: "a car" }), override: null, locked: false, origin: "treatment", history: [] });
    expect(w.timestamp_start).toBe(1);
    expect(w.timestamp_end).toBe(5.01);
    expect(w.spec_json.id).toBe("c009");
    expect(w.spec_json.timeline).toEqual({ start: 1, end: 5.01 });
    expect(w.scene_description).toBe("a car");
    expect(w.notes).toContain("TKEY:c009");
  });
});

describe("materialise a generated treatment into box records", () => {
  const specs = [spec("c001", 0, 4), spec("c002", 4, 8), spec("c003", 8, 12)];

  it("uses the row that already exists for a key — a box, or a legacy committed row — and inserts the rest", () => {
    const plan = planMaterialize({
      specs,
      existing: [
        { id: "box-1", spec_key: "c001", notes: null, shot_number: 5 },
        { id: "legacy-2", spec_key: null, notes: 'TKEY:c002\nLYRIC: "x"', shot_number: 2 },
        { id: "other", spec_key: null, notes: "a hand-made shot", shot_number: 1 },
      ],
      at: AT,
    });
    expect(plan.updates.map((u) => [u.id, u.write.spec_key])).toEqual([
      ["box-1", "c001"],
      ["legacy-2", "c002"],
    ]);
    expect(plan.inserts.map((w) => w.spec_key)).toEqual(["c003"]);
  });

  it("carries a saved edit across onto its own box and locks it", () => {
    const plan = planMaterialize({
      specs,
      overrides: { c002: { specId: "c002", direction: "the Bentley scene", frame: "a Bentley at the kerb", cameraMotion: null, framing: null, transitionIn: null, requiredElements: ["four kids"], notes: null } },
      existing: [],
      at: AT,
    });
    const w = plan.inserts.find((x) => x.spec_key === "c002")!;
    expect(w.locked).toBe(true);
    expect(w.spec_json.performanceDirection).toBe("the Bentley scene");
    expect(w.spec_json.openingFrame).toBe("a Bentley at the kerb");
    expect(w.generated_json.performanceDirection).toBe("");
    expect(plan.inserts.find((x) => x.spec_key === "c001")!.locked).toBe(false);
  });

  it("reads the key a legacy row was committed for", () => {
    expect(legacyKeyOf("TKEY:c006\nsomething")).toBe("c006");
    expect(legacyKeyOf("CDKEY:x")).toBeNull();
    expect(legacyKeyOf(null)).toBeNull();
  });

  it("a whole-board generation rewrites only boxes that are unlocked, unedited and hold no footage", () => {
    const a = box("r1", "c001", 0, 4);
    const b = box("r2", "c002", 4, 8, { locked: true });
    const c = box("r3", "c003", 8, 12);
    const d = box("r4", "c004", 12, 16);
    expect(unlockedForGeneration([a, b, c, d], new Set(["r3"])).map((x) => x.key)).toEqual(["c001", "c004"]);
    const w = applyGenerated(a, spec("anything", 99, 100, { purpose: "a new scene" }), AT);
    expect(w.spec_key).toBe("c001");
    expect([w.timestamp_start, w.timestamp_end]).toEqual([0, 4]);
    expect(w.spec_json.purpose).toBe("a new scene");
    expect(w.history_json.at(-1)?.purpose).toBe("scene c001");
  });
});

describe("split and merge", () => {
  it("a split makes two permanent records that cover exactly the original window", () => {
    const b = box("r1", "c006", 10, 14);
    const { first, second } = planSplit(b, 12, ["c005", "c006", "c007"], AT);
    expect([first.spec_key, first.timestamp_start, first.timestamp_end]).toEqual(["c006", 10, 12]);
    expect([second.timestamp_start, second.timestamp_end]).toEqual([12, 14]);
    expect(second.spec_key).toBe("c006_2");
    expect(second.box_origin).toBe("split");
    expect(second.spec_json.purpose).toBe(first.spec_json.purpose);
  });

  it("a split refuses a point that would leave a sliver", () => {
    expect(() => planSplit(box("r1", "c006", 10, 14), 10.2, ["c006"], AT)).toThrow(/at least/);
    expect(() => planSplit(box("r1", "c006", 10, 14), 14, ["c006"], AT)).toThrow();
  });

  it("new keys never collide and never renumber a neighbour", () => {
    expect(nextKey(["c006", "c006_2"], "c006")).toBe("c006_3");
    expect(nextKey(["c006", "c006_2"], "c006_2")).toBe("c006_3");
  });

  it("a merge keeps the earlier record, takes the whole window and records what the later one said", () => {
    const a = box("r1", "c006", 10, 12);
    const n = box("r2", "c006_2", 12, 14);
    const w = planMerge(a, n, AT);
    expect([w.spec_key, w.timestamp_start, w.timestamp_end]).toEqual(["c006", 10, 14]);
    expect(w.history_json.at(-1)?.event).toBe("merge");
    expect(w.history_json.at(-1)?.purpose).toBe("scene c006_2");
    expect(() => planMerge(a, box("r3", "c009", 20, 24), AT)).toThrow(/follows directly/);
  });
});

describe("what a per-box rewrite is told", () => {
  it("neighbours are one line each; the ends of the board have one neighbour", () => {
    const boxes = [box("r1", "c001", 0, 4), box("r2", "c002", 4, 8), box("r3", "c003", 8, 12)];
    expect(neighbourSummaries(boxes, "r2")).toEqual({ before: "insert: scene c001", after: "insert: scene c003" });
    expect(neighbourSummaries(boxes, "r1").before).toBeNull();
    expect(neighbourSummaries(boxes, "r3").after).toBeNull();
  });

  it("machine context is structured facts — window, take range, media, what the director locked", () => {
    const b = box("r1", "c001", 32, 36.2, { override_json: { framing: "close_up", requiredElements: ["the gator boots"] } });
    const ctx = machineContext({
      box: b,
      performance: { takeName: "Take 1", range: { start: 31.1462, end: 35.3462 } },
      media: [{ role: "b_roll", name: "street.mov", selected: true }],
      constraints: ["no night", "  "],
    });
    expect(ctx.song_window_seconds).toEqual([32, 36.2]);
    expect(ctx.performance_source).toEqual({ take: "Take 1", source_range_seconds: [31.15, 35.35] });
    expect(ctx.locked_by_director).toEqual({ framing: "close_up", must_be_in_frame: ["the gator boots"] });
    expect(ctx.constraints).toEqual(["no night"]);
    expect(ctx.assigned_media).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

function asset(id: string, over: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id,
    assetType: "generated_clip",
    footageRole: null,
    bucket: "project-clips",
    path: `u/p/${id}.mp4`,
    playback: null,
    name: `${id}.mp4`,
    mime: "video/mp4",
    isVideo: true,
    isImage: false,
    durationSeconds: 5,
    shotId: null,
    sourceTool: null,
    providerJobId: null,
    createdAt: AT,
    ...over,
  };
}
function assign(id: string, shotId: string, assetId: string, role: Assignment["role"], over: Partial<Assignment> = {}): Assignment {
  return { id, projectId: "p1", shotId, assetId, role, sourceIn: null, sourceOut: null, isPrimary: false, sortOrder: 0, notes: null, createdAt: AT, updatedAt: AT, ...over };
}
const sync = (over: Partial<TakeSync> = {}): TakeSync => ({
  id: "s1",
  projectId: "p1",
  songAssetId: "song",
  performanceAssetId: "take1",
  offsetSeconds: 0.8538,
  driftPpm: 0,
  method: "manual",
  status: "confirmed",
  ...over,
});
const take = asset("take1", { footageRole: "performance", assetType: "reference_video", durationSeconds: 190.34, name: "take1.mp4" });

describe("the performance range of a box", () => {
  it("is the song window mapped through the sync — cut, never stretched", () => {
    const r = takeRangeForBox({ start: 32, end: 36.2 }, sync(), 190.34)!;
    expect(r.coverage).toBe("full");
    expect(r.start).toBeCloseTo(31.1462, 4);
    expect(r.end).toBeCloseTo(35.3462, 4);
    // one second of song is one second of take
    expect(r.end - r.start).toBeCloseTo(4.2, 6);
  });

  it("clamps to the recording when the take covers only part of the window, and is null when it covers none", () => {
    const head = takeRangeForBox({ start: 0, end: 4 }, sync(), 190.34)!;
    expect(head.coverage).toBe("partial");
    expect(head.start).toBe(0);
    expect(head.end).toBeCloseTo(3.1462, 4);
    // the recording starts 0.8538 s into the box; the take is not slid forward to fill it
    expect(head.leadIn).toBeCloseTo(0.8538, 4);
    expect(takeRangeForBox({ start: 195, end: 199 }, sync(), 190.34)).toBeNull();
  });

  it("moving or resizing the box moves the range with it — nothing is re-measured", () => {
    const a = takeRangeForBox({ start: 40, end: 44 }, sync(), 190.34)!;
    const b = takeRangeForBox({ start: 42, end: 44 }, sync(), 190.34)!;
    expect(b.start - a.start).toBeCloseTo(2, 6);
    expect(b.end).toBeCloseTo(a.end, 6);
  });
});

describe("which take a clip was made from", () => {
  const record = { derivedFrom: { assetId: "take", songStart: 62.749, sourceWindow: [61.895, 65.832] as [number, number], method: "composite" as const } };
  it("is read off the job that made it", () => {
    expect(sourceOfDerived({ derivedFrom: null }, { sourceAssetId: "take", sourceWindow: [46.2, 50.2] })).toEqual({ assetId: "take", window: [46.2, 50.2] });
  });
  it("is read off the clip's own record when no job made it — a composite filed from outside the app", () => {
    expect(sourceOfDerived(record, null)).toEqual({ assetId: "take", window: [61.895, 65.832] });
  });
  it("the job's word comes first", () => {
    expect(sourceOfDerived(record, { sourceAssetId: "other", sourceWindow: [1, 5] })).toEqual({ assetId: "other", window: [1, 5] });
  });
  it("is nobody's when neither names a take and a stretch of it", () => {
    expect(sourceOfDerived({ derivedFrom: null }, null)).toBeNull();
    expect(sourceOfDerived({ derivedFrom: { assetId: "take", songStart: 0 } }, null)).toBeNull();
    expect(sourceOfDerived({ derivedFrom: null }, { sourceAssetId: "take", sourceWindow: [5, 5] })).toBeNull();
  });
});

describe("what a box shows", () => {
  const b = { id: "r1", start: 32, end: 36 };
  const assets = new Map([take, asset("clip1"), asset("still1", { assetType: "generated_still", isVideo: false, isImage: true, mime: "image/png", durationSeconds: null })].map((a) => [a.id, a]));

  it("with nothing put on it, the synced take shows through as the base layer", () => {
    const m = boxMedia({ box: b, assignments: [], assets, syncs: [sync()] });
    expect(m.showing?.base).toBe(true);
    expect(m.showing?.role).toBe("performance");
    expect(m.showing?.sourceIn).toBeCloseTo(31.1462, 4);
  });

  it("an unconfirmed measurement is not a base layer", () => {
    expect(boxMedia({ box: b, assignments: [], assets, syncs: [sync({ status: "auto" })] }).showing).toBeNull();
  });

  it("the selected assignment is what shows; the take stays available underneath", () => {
    const m = boxMedia({ box: b, assignments: [assign("a1", "r1", "clip1", "generated_clip", { isPrimary: true })], assets, syncs: [sync()] });
    expect(m.showing?.asset.id).toBe("clip1");
    expect(m.showing?.sourceIn).toBe(0);
    expect(m.showing?.sourceOut).toBe(4); // trimmed to the box, not stretched over it
    expect(m.items.some((i) => i.base && i.asset.id === "take1")).toBe(true);
  });

  it("a clip shorter than the box says so", () => {
    const m = boxMedia({ box: { id: "r1", start: 0, end: 8 }, assignments: [assign("a1", "r1", "clip1", "generated_clip", { isPrimary: true })], assets, syncs: [] });
    expect(m.showing?.note).toMatch(/5\.0 s of footage for a 8\.0 s box/);
  });

  it("a take assigned to a box plays the box's own range of it", () => {
    const m = boxMedia({ box: b, assignments: [assign("a1", "r1", "take1", "performance", { isPrimary: true })], assets, syncs: [sync()] });
    expect(m.showing?.base).toBe(false);
    expect(m.showing?.sourceIn).toBeCloseTo(31.1462, 4);
    expect(m.items.filter((i) => i.asset.id === "take1")).toHaveLength(1);
  });

  it("deselecting removes nothing and lets the base layer show", () => {
    const list = [assign("a1", "r1", "clip1", "generated_clip", { isPrimary: true })];
    expect(planDeselect(list, "r1")).toEqual([{ op: "update", id: "a1", patch: { is_primary: false } }]);
    const m = boxMedia({ box: b, assignments: [{ ...list[0], isPrimary: false }], assets, syncs: [sync()] });
    expect(m.showing?.base).toBe(true);
    expect(m.items.some((i) => i.asset.id === "clip1")).toBe(true);
  });

  it("classifies what an asset is when it lands on a box", () => {
    expect(roleForAsset(take)).toBe("performance");
    expect(roleForAsset(asset("x"))).toBe("generated_clip");
    expect(roleForAsset(asset("x", { assetType: "generated_still", isVideo: false, isImage: true }))).toBe("generated_image");
    expect(roleForAsset(asset("x", { assetType: "reference_video", footageRole: "b_roll" }))).toBe("b_roll");
    expect(roleForAsset(asset("x", { assetType: "audio", isVideo: false }))).toBeNull();
  });
});

describe("assigning, selecting and moving change rows, never files", () => {
  it("assigning selects the new media and unselects the old; assigning the same thing twice adds nothing", () => {
    const list = [assign("a1", "r1", "clip1", "generated_clip", { isPrimary: true, sortOrder: 1 })];
    const ops = planAssign({ assignments: list, shotId: "r1", assetId: "clip2", role: "b_roll" });
    expect(ops[0]).toEqual({ op: "update", id: "a1", patch: { is_primary: false } });
    expect(ops[1]).toMatchObject({ op: "insert", shotId: "r1", assetId: "clip2", role: "b_roll", isPrimary: true, sortOrder: 2 });
    expect(planAssign({ assignments: list, shotId: "r1", assetId: "clip1", role: "generated_clip" })).toEqual([]);
  });

  it("a reference never becomes the picture", () => {
    const ops = planAssign({ assignments: [], shotId: "r1", assetId: "ref", role: "reference" });
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: "insert", isPrimary: false });
  });

  it("a performance assignment stores no range", () => {
    const [op] = planAssign({ assignments: [], shotId: "r1", assetId: "take1", role: "performance", sourceIn: 3, sourceOut: 9 });
    expect(op).toMatchObject({ op: "insert", sourceIn: null, sourceOut: null });
  });

  it("select makes exactly one primary", () => {
    const list = [assign("a1", "r1", "clip1", "generated_clip", { isPrimary: true }), assign("a2", "r1", "clip2", "b_roll")];
    expect(planSelect(list, "a2")).toEqual([
      { op: "update", id: "a1", patch: { is_primary: false } },
      { op: "update", id: "a2", patch: { is_primary: true } },
    ]);
  });

  it("moving re-points the row; onto a box that already has the asset the row collapses", () => {
    const list = [assign("a1", "r1", "clip1", "generated_clip", { isPrimary: true }), assign("a2", "r2", "clip9", "b_roll", { isPrimary: true, sortOrder: 3 })];
    expect(planMove(list, "a1", "r2")).toEqual([
      { op: "update", id: "a2", patch: { is_primary: false } },
      { op: "update", id: "a1", patch: { shot_id: "r2", is_primary: true, sort_order: 4 } },
    ]);
    const twin = [...list, assign("a3", "r2", "clip1", "generated_clip")];
    const ops = planMove(twin, "a1", "r2");
    expect(ops).toContainEqual({ op: "delete", id: "a1" });
    expect(ops).toContainEqual({ op: "update", id: "a3", patch: { is_primary: true } });
    expect(planMove(list, "a1", "r1")).toEqual([]);
  });

  it("a merge moves everything across and keeps the survivor's selection", () => {
    const list = [
      assign("a1", "r1", "clip1", "generated_clip", { isPrimary: true, sortOrder: 1 }),
      assign("a2", "r2", "clip2", "b_roll", { isPrimary: true }),
      assign("a3", "r2", "clip1", "generated_clip"),
    ];
    expect(planMoveAll(list, "r2", "r1")).toEqual([
      { op: "update", id: "a2", patch: { shot_id: "r1", sort_order: 2, is_primary: false } },
      { op: "delete", id: "a3" },
    ]);
  });
});

describe("the timeline Review plays", () => {
  const boxes = [box("r2", "c002", 4, 8), box("r1", "c001", 0, 4), box("r3", "c003", 8, 12)];
  const assets = new Map([take, asset("clip1"), asset("still1", { assetType: "generated_still", isVideo: false, isImage: true, mime: "image/png", durationSeconds: null })].map((a) => [a.id, a]));
  const timeline = buildTimeline({
    boxes,
    assignments: [assign("a1", "r2", "clip1", "generated_clip", { isPrimary: true }), assign("a2", "r3", "still1", "generated_image", { isPrimary: true })],
    assets,
    syncs: [sync()],
  });

  it("is one segment per box in song order, each naming its record and its media", () => {
    expect(timeline.map((s) => [s.index, s.key, s.shotId, s.media.kind])).toEqual([
      [1, "c001", "r1", "video"],
      [2, "c002", "r2", "video"],
      [3, "c003", "r3", "image"],
    ]);
    expect(timeline[0].media).toMatchObject({ role: "performance", base: true });
    expect(timeline[1].media).toMatchObject({ assetId: "clip1", sourceIn: 0, sourceOut: 4 });
  });

  it("finds the segment and the place in its media for a song time", () => {
    expect(segmentAt(timeline, 5.5)?.key).toBe("c002");
    expect(mediaTimeAt(segmentAt(timeline, 5.5)!, 5.5)).toBeCloseTo(1.5, 6);
    // the base take at song 2.0 s is take 1.1462 s — in sync even though the recording starts inside this box
    expect(mediaTimeAt(segmentAt(timeline, 2)!, 2)).toBeCloseTo(2 - 0.8538, 3);
    expect(mediaTimeAt(segmentAt(timeline, 0.3)!, 0.3)).toBe(0);
    expect(segmentAt(timeline, -1)).toBeNull();
  });

  it("the render contract names the ORIGINAL file of every segment, its in/out and the record it came from", () => {
    const withCopy = new Map(assets);
    withCopy.set("take1", { ...take, playback: { bucket: "project-clips", path: "u/p/take1_720p.mp4" } });
    const song = { assetId: "song", bucket: "project-audio", path: "u/p/song.wav" };
    const plan = renderContract({ timeline, assets: withCopy, song });
    // the frame a renderer draws into: the project's, 9:16 when it has never been set, media fitted whole
    expect(plan.frame).toEqual({ aspect: "9:16", width: 1080, height: 1920, fit: "contain", background: "#000000" });
    expect(renderContract({ timeline, assets: withCopy, song: null, aspect: "16:9" }).frame).toMatchObject({ aspect: "16:9", width: 1920, height: 1080, fit: "contain" });
    expect(plan).toMatchObject({ version: 2, clock: "song", duration_seconds: 12, audio: { asset_id: "song", path: "u/p/song.wav", song_in: 0 } });
    expect(plan.segments.map((s) => [s.shot_id, s.key, s.song_in, s.song_out, s.media.kind])).toEqual([
      ["r1", "c001", 0, 4, "video"],
      ["r2", "c002", 4, 8, "video"],
      ["r3", "c003", 8, 12, "image"],
    ]);
    // the browser's lighter copy is never what a renderer is given
    expect(plan.segments[0].media).toMatchObject({ path: "u/p/take1.mp4", role: "performance", base_layer: true, lead_in: 0.8538 });
    expect(plan.segments[1].media).toMatchObject({ asset_id: "clip1", source_in: 0, source_out: 4, base_layer: false });
  });

  it("reports gaps and overlaps between boxes", () => {
    expect(timelineIssues(timeline)).toEqual([]);
    const gappy = buildTimeline({ boxes: [box("r1", "c001", 0, 4), box("r2", "c002", 5, 8), box("r3", "c003", 7, 9)], assignments: [], assets, syncs: [] });
    expect(timelineIssues(gappy)).toEqual(["1.00 s with no box between 1 and 2", "boxes 2 and 3 overlap by 1.00 s"]);
    expect(gappy[0].media.kind).toBe("none");
  });
});

// ---------------------------------------------------------------------------
import { energyForWindow, gridFromBoxes, planRewrite } from "./rewrite";

describe("which treatment a shot was written from", () => {
  const OLD = "He walks a black runway under one white light.";
  const NEW = "A fashion show burns in a forest; a woman mounts a horse.";
  const stamped = (id: string, key: string, text: string, extra: Partial<BoxRow> = {}) => {
    const w = boxWrite({ key, start: 0, end: 4, section: "verse", generated: spec(key, 0, 4, { provenance: { source: "ai", createdAt: AT, treatment: fingerprint(text) } } as Partial<ShotSpec>), override: null, locked: false, origin: "treatment", history: [] });
    return boxFromRow({ id, project_id: "p1", shot_number: 1, ...w, updated_at: AT, ...extra } as BoxRow)!;
  };
  const treatment = (text: string, updatedAt = "2026-10-07T02:40:51.000Z") => ({ text, updatedAt });

  it("a shot carries the stamp of the text it was written from", () => {
    const b = stamped("r1", "c001", OLD);
    expect(writtenFrom(b)).toEqual({ treatment: fingerprint(OLD), at: AT });
    expect(boxIsStale(b, treatment(OLD))).toBe(false);
    expect(boxIsStale(b, treatment(NEW))).toBe(true);
    // whitespace is not a change of treatment
    expect(boxIsStale(b, treatment(`  ${OLD.replace(/ /g, "  ")}\n`))).toBe(false);
  });

  it("a whole-board rewrite stamps what it writes and leaves the kept shots saying where THEY came from", () => {
    const boxes = [stamped("r1", "c001", OLD), stamped("r2", "c002", OLD, { locked: true })];
    const drafted = structuredTreatmentToShotSpecs(
      { clips: ["c001", "c002"].map((key) => ({ key, start: 0, end: 4, section: "verse", energy: "mid", shot_type: "b_roll", scene_description: `new ${key}`, camera_direction: "", lighting: "", wardrobe: "", environment: "", recommended_tool: "manual", lyric_ref: null, priority: "normal", dependencies: [] })), model: "m", generated_at: "2026-10-07T03:00:00.000Z" } as never,
      fingerprint(NEW),
    );
    const plan = planRewrite({ boxes, boxIdsWithMedia: new Set(), drafted, sections: {}, existingRows: [], lyricLines: undefined, at: "2026-10-07T03:00:00.000Z" });
    expect(plan.updates.map((u) => u.id)).toEqual(["r1"]);
    const rewritten = boxFromRow({ id: "r1", project_id: "p1", shot_number: 1, ...plan.updates[0].write, updated_at: AT } as BoxRow)!;
    expect(boxIsStale(rewritten, treatment(NEW))).toBe(false);
    // the locked one was kept: the board was "written from this treatment", and this shot still was not
    expect(boxIsStale(boxes[1], treatment(NEW))).toBe(true);
  });

  it("a scene the director writes, or a per-shot rewrite, takes the stamp of the treatment that stands; a small edit does not", () => {
    const b = stamped("r1", "c001", OLD);
    const now = "2026-10-07T04:00:00.000Z";
    const framing = boxFromRow({ id: "r1", project_id: "p1", shot_number: 1, ...applyOverride(b, { ...BLANK_OVERRIDE, framing: "close" }, now, "edit", fingerprint(NEW)), updated_at: now } as BoxRow)!;
    expect(boxIsStale(framing, treatment(NEW))).toBe(true);
    const scene = boxFromRow({ id: "r1", project_id: "p1", shot_number: 1, ...applyOverride(b, { ...BLANK_OVERRIDE, direction: "the rider turns to camera" }, now, "edit", fingerprint(NEW)), updated_at: now } as BoxRow)!;
    expect(scene.override?.treatment).toBe(fingerprint(NEW));
    expect(boxIsStale(scene, treatment(NEW))).toBe(false);
    // a later small edit keeps the stamp the scene has
    const later = boxFromRow({ id: "r1", project_id: "p1", shot_number: 1, ...applyOverride(scene, { ...scene.override!, framing: "wide" }, now, "edit", fingerprint("something else again")), updated_at: now } as BoxRow)!;
    expect(later.override?.treatment).toBe(fingerprint(NEW));
    const rewrite = boxFromRow({ id: "r1", project_id: "p1", shot_number: 1, ...applyOverride(b, { ...BLANK_OVERRIDE, direction: "old words kept" }, now, "rewrite", fingerprint(NEW)), updated_at: now } as BoxRow)!;
    expect(boxIsStale(rewrite, treatment(NEW))).toBe(false);
  });

  it("a shot from before stamps is judged by when it was written against when the treatment was saved", () => {
    const legacy = box("r1", "c001", 0, 4); // no stamp, no date
    expect(writtenFrom(legacy).treatment).toBeNull();
    // nothing to compare: an unknown is not an accusation
    expect(boxIsStale(legacy, treatment(NEW))).toBe(false);
    const dated = (createdAt: string) => boxFromRow({ ...rowOf("r1", "c001", 0, 4), generated_json: spec("c001", 0, 4, { provenance: { source: "ai", createdAt } } as Partial<ShotSpec>) } as BoxRow)!;
    expect(boxIsStale(dated("2026-10-03T19:26:38.850Z"), treatment(NEW, "2026-10-07T02:40:51.627Z"))).toBe(true);
    // written in the same act as the text was saved (moments apart), or after it
    expect(boxIsStale(dated("2026-10-07T02:40:50.000Z"), treatment(NEW, "2026-10-07T02:40:51.627Z"))).toBe(false);
    expect(boxIsStale(dated("2026-10-07T05:00:00.000Z"), treatment(NEW, "2026-10-07T02:40:51.627Z"))).toBe(false);
    // no treatment at all: nothing is stale
    expect(boxIsStale(dated("2026-10-03T19:26:38.850Z"), treatment(""))).toBe(false);
  });
});

describe("releasing the director's shots to a replaced treatment", () => {
  const OLD = "He walks a black runway under one white light.";
  const NEW = "A fashion show burns in a forest; a woman mounts a horse.";
  const made = (id: string, key: string, start: number, text: string, extra: Partial<BoxRow> = {}) => {
    const w = boxWrite({ key, start, end: start + 4, section: "verse", generated: spec(key, start, start + 4, { purpose: `old ${key}`, provenance: { source: "ai", createdAt: AT, treatment: fingerprint(text) } } as Partial<ShotSpec>), override: null, locked: false, origin: "treatment", history: [] });
    return boxFromRow({ id, project_id: "p1", shot_number: 1, ...w, updated_at: AT, ...extra } as BoxRow)!;
  };
  const on = (id: string, shotId: string, assetId: string, role: Assignment["role"], isPrimary: boolean): Assignment => ({ id, projectId: "p1", shotId, assetId, role, sourceIn: null, sourceOut: null, isPrimary, sortOrder: 1, notes: null, createdAt: AT, updatedAt: AT });
  const boxes = [
    made("r1", "c001", 0, OLD), // open already: a rewrite reaches it
    made("r2", "c002", 4, OLD, { locked: true, override_json: { direction: "my runway scene", manual: ["direction"], treatment: fingerprint(OLD) } }),
    made("r3", "c003", 8, OLD), // holds footage
    made("r4", "c004", 12, NEW, { locked: true }), // the director's, and already of this treatment
  ];
  const assignments = [on("a1", "r3", "clip_old", "generated_clip", true), on("a2", "r3", "img_old", "generated_image", false), on("a3", "r4", "clip_new", "generated_clip", true)];
  const now = "2026-10-07T05:00:00.000Z";
  const plan = planRelease({ boxes, assignments, treatment: { text: NEW, updatedAt: "2026-10-07T02:40:51Z" }, at: now });

  it("takes only the shots that are his AND from the earlier treatment", () => {
    expect(plan.updates.map((u) => u.id)).toEqual(["r2", "r3"]);
    expect([plan.released, plan.withFootage, plan.pieces]).toEqual([2, 1, 2]);
  });

  it("opens them, keeps the scene they had, and says what footage came off — nothing is deleted but the rows", () => {
    const r2 = plan.updates[0].write;
    expect(r2.locked).toBe(false);
    expect(r2.override_json).toBeNull();
    const last = r2.history_json[r2.history_json.length - 1];
    expect(last).toMatchObject({ at: now, event: "reset", direction: "my runway scene", note: "released to be rewritten from the treatment" });
    const r3 = plan.updates[1].write.history_json.slice(-1)[0];
    expect(r3.note).toBe("released to be rewritten from the treatment; footage taken off — showing was clip_old (generated_clip); also on it: img_old (generated_image)");
    // the footage of the released shots only; the shot that is already of this treatment keeps its clip
    expect(plan.assignmentOps).toEqual([
      { op: "delete", id: "a1" },
      { op: "delete", id: "a2" },
    ]);
  });

  it("after it, the whole-board rewrite reaches them", () => {
    const after = boxes.map((b) => {
      const u = plan.updates.find((x) => x.id === b.id);
      return u ? boxFromRow({ id: b.id, project_id: "p1", shot_number: 1, ...u.write, updated_at: now } as BoxRow)! : b;
    });
    const left = new Set(assignments.filter((a) => !plan.assignmentOps.some((o) => o.op === "delete" && o.id === a.id)).map((a) => a.shotId));
    expect(unlockedForGeneration(after, left).map((b) => b.id)).toEqual(["r1", "r2", "r3"]);
  });

  it("releases nothing when no shot of his is stale", () => {
    expect(planRelease({ boxes, assignments, treatment: { text: OLD, updatedAt: AT }, at: now }).released).toBe(1); // r4 is of NEW: under OLD it is the stale one
    expect(planRelease({ boxes: [boxes[0]], assignments: [], treatment: { text: NEW, updatedAt: AT }, at: now })).toMatchObject({ released: 0, updates: [], assignmentOps: [] });
  });
});

describe("a wardrobe the footage cannot deliver", () => {
  const dressed = (shotType: "performance" | "narrative", source: "" | "footage" | "treatment", description = "his YSL leather coat.") =>
    spec("c001", 0, 4, { shotType, wardrobe: { name: "", description, lookId: null, references: [], source } } as Partial<ShotSpec>);

  it("is said on a performance shot the treatment dresses: a restaging keeps the clothes he was filmed in", () => {
    const gap = wardrobeGap(dressed("performance", "treatment"), "a woodland-camouflage shirt, a navy cap");
    expect(gap).toContain("The treatment dresses him in: his YSL leather coat.");
    expect(gap).toContain("Your footage shows him in a woodland-camouflage shirt, a navy cap.");
    expect(gap).toContain("cannot be made as the treatment asks from the footage on file");
    expect(wardrobeGap(dressed("performance", "treatment"), null)).toContain("That is not what your footage shows.");
  });

  it("is said on any other shot he is in: the image model is shown neither him nor the garment", () => {
    expect(wardrobeGap(dressed("narrative", "treatment", "his YSL denim look"))).toContain("No picture of him or of that garment is handed to the image model");
  });

  it("is not said when he wears the footage, when nobody said, or when he is not in the shot", () => {
    expect(wardrobeGap(dressed("performance", "footage"))).toBeNull();
    expect(wardrobeGap(dressed("performance", ""))).toBeNull();
    expect(wardrobeGap(dressed("narrative", "treatment", "none"))).toBeNull();
    expect(wardrobeGap(dressed("narrative", "treatment", "  "))).toBeNull();
  });
});

describe("writing the storyboard from the treatment", () => {
  const beat = [
    { key: "c001", start: 0, end: 4, section: "intro", energy: "low" as const },
    { key: "c002", start: 4, end: 8, section: "verse", energy: "high" as const },
  ];

  it("hands the model the storyboard's own boxes as its grid", () => {
    const boxes = [box("r2", "c006_2", 6, 8), box("r1", "c006", 2, 6, { song_section: null })];
    expect(gridFromBoxes(boxes, beat)).toEqual([
      { key: "c006", start: 2, end: 6, section: "intro", energy: "low" },
      { key: "c006_2", start: 6, end: 8, section: "verse", energy: "high" },
    ]);
    expect(energyForWindow({ start: 100, end: 104 }, beat)).toBe("mid");
  });

  it("with no boxes, every drafted clip becomes a box", () => {
    const plan = planRewrite({ boxes: [], boxIdsWithMedia: new Set(), drafted: [spec("c001", 0, 4), spec("c002", 4, 8)], sections: { c001: "intro" }, existingRows: [], lyricLines: undefined, at: AT });
    expect(plan.inserts.map((w) => [w.spec_key, w.song_section])).toEqual([
      ["c001", "intro"],
      ["c002", null],
    ]);
    expect([plan.written, plan.kept]).toEqual([2, 0]);
  });

  it("with boxes, only the director's are kept — on their own records, windows and keys", () => {
    const boxes = [box("r1", "c001", 0, 4), box("r2", "c002", 4, 8, { locked: true }), box("r3", "c003", 8, 12), box("r4", "c004", 12, 16)];
    const drafted = ["c001", "c002", "c003", "c004"].map((k, i) => spec(k, 90 + i, 95 + i, { purpose: `new ${k}` }));
    const plan = planRewrite({ boxes, boxIdsWithMedia: new Set(["r3"]), drafted, sections: {}, existingRows: [], lyricLines: undefined, at: AT });
    expect(plan.updates.map((u) => [u.id, u.write.spec_key, u.write.timestamp_start, u.write.spec_json.purpose])).toEqual([
      ["r1", "c001", 0, "new c001"],
      ["r4", "c004", 12, "new c004"],
    ]);
    expect([plan.written, plan.kept]).toEqual([2, 2]);
    expect(plan.inserts).toEqual([]);
  });

  it("a box the model did not write for is left alone", () => {
    const boxes = [box("r1", "c001", 0, 4), box("r2", "c002", 4, 8)];
    const plan = planRewrite({ boxes, boxIdsWithMedia: new Set(), drafted: [spec("c001", 0, 4, { purpose: "new" })], sections: {}, existingRows: [], lyricLines: undefined, at: AT });
    expect(plan.updates.map((u) => u.id)).toEqual(["r1"]);
    expect(plan.kept).toBe(1);
  });
});

describe("who wrote which field", () => {
  const blank = { direction: null, frame: null, cameraMotion: null, framing: null, transitionIn: null, requiredElements: null, notes: null };

  it("an override from before the record existed is all the director's", () => {
    expect([...directorSet({ ...blank, direction: "x", framing: "wide" })].sort()).toEqual(["direction", "framing"]);
  });

  it("a rewrite replaces what a rewrite wrote and keeps what he set", () => {
    const first = rewrittenOverride(null, { direction: "ai scene 1", frame: "ai frame 1", framing: "close_up" });
    expect(first.manual).toEqual([]);
    // he changes the framing by hand and leaves the rest as written
    const his = editedOverride(first, { ...first, framing: "wide" });
    expect(his.manual).toEqual(["framing"]);
    const second = rewrittenOverride(his, { direction: "ai scene 2", frame: "ai frame 2", framing: "extreme_close_up" });
    expect(second.direction).toBe("ai scene 2");
    expect(second.frame).toBe("ai frame 2");
    expect(second.framing).toBe("wide");
    expect(second.manual).toEqual(["framing"]);
  });

  it("only what he set is told to the model as already decided", () => {
    const o = editedOverride(rewrittenOverride(null, { framing: "close_up", requiredElements: ["a rim"] }), { ...blank, framing: "close_up", requiredElements: ["a rim", "four kids"] });
    const b = box("r1", "c001", 0, 4, { override_json: o });
    expect(machineContext({ box: b }).locked_by_director).toEqual({ must_be_in_frame: ["a rim", "four kids"] });
  });

  it("a field he empties is no longer his, or anyone's", () => {
    const o = editedOverride({ ...blank, direction: "x", framing: "wide", manual: ["direction", "framing"] }, { ...blank, direction: "x" });
    expect(o.manual).toEqual(["direction"]);
  });
});

describe("what a shot's video does at a moment of the song", () => {
  const seg = (over: Partial<Extract<TimelineSegment["media"], { kind: "video" }>> = {}, start = 188, end = 194): TimelineSegment => ({
    shotId: "s1",
    key: "c042",
    index: 42,
    start,
    end,
    section: null,
    scene: "",
    note: null,
    events: [],
    media: { kind: "video", assetId: "take", role: "performance", sourceIn: 187.15, sourceOut: 190.34, leadIn: 0, base: true, ...over },
  });

  it("runs in place while the take covers the shot", () => {
    expect(videoStateAt(seg(), 189, 190.4)).toEqual({ at: 188.15, hold: null });
  });

  it("holds the last frame once the take has run out before the shot has, and never asks for a time past the file", () => {
    const s = videoStateAt(seg(), 192.5, 190.375)!;
    expect(s.hold).toBe("ran_out");
    expect(s.at).toBeLessThanOrEqual(190.375);
    expect(s.at).toBeGreaterThan(190);
  });

  it("a file shorter than its recorded length still holds rather than restarting", () => {
    expect(videoStateAt(seg({ sourceOut: null }), 193, 190.375)!.hold).toBe("ran_out");
  });

  it("a cut that lands on the out-point is not run out: the take carries on into the next shot", () => {
    const first = seg({ sourceIn: 10, sourceOut: 14 }, 10.85, 14.85);
    expect(videoStateAt(first, 14.849, 190)!.hold).toBeNull();
    expect(videoStateAt(first, 14.85, 190)!.hold).toBeNull();
  });

  it("holds the first frame inside a take's lead-in", () => {
    const s = videoStateAt(seg({ sourceIn: 0, sourceOut: 3.07, leadIn: 0.85 }, 0, 3.92), 0.4, 190)!;
    expect(s).toEqual({ at: 0, hold: "lead_in" });
    expect(videoStateAt(seg({ sourceIn: 0, sourceOut: 3.07, leadIn: 0.85 }, 0, 3.92), 1.85, 190)).toEqual({ at: 1, hold: null });
  });

  it("is not asked of an image or an empty shot", () => {
    expect(videoStateAt({ ...seg(), media: { kind: "none" } }, 189)).toBeNull();
  });

  it("a video that has played to its own end holds its last frame — it is never asked to play again from zero", () => {
    // the take is 190.375 s long; the video ran 0.03 s ahead of the song and ended while the arithmetic still said "running"
    const state = videoStateAt(seg(), 191.17, 190.375)!;
    expect(state).toEqual({ at: 190.32, hold: null });
    const ended = videoTick({ state, currentTime: 190.375, ended: true, playing: true });
    expect(ended).toEqual({ seekTo: null, run: false, rate: 1 });
    // the same moment with the video still running: it runs, nudged back toward the song
    expect(videoTick({ state, currentTime: 190.36, ended: false, playing: true })).toMatchObject({ seekTo: null, run: true });
    // scrubbed back while ended: the seek takes it off its end and it runs from there
    const back = videoStateAt(seg(), 189, 190.375)!;
    expect(videoTick({ state: back, currentTime: 190.375, ended: true, playing: true })).toEqual({ seekTo: back.at, run: true, rate: 1 });
    // far from where the song says: a seek, at normal speed; a frame or two out: a nudge, no seek
    expect(videoTick({ state: back, currentTime: back.at - 1, ended: false, playing: true })).toEqual({ seekTo: back.at, run: true, rate: 1 });
    expect(videoTick({ state: back, currentTime: back.at + 0.1, ended: false, playing: true })).toEqual({ seekTo: null, run: true, rate: 0.94 });
    expect(videoTick({ state: back, currentTime: back.at - 0.1, ended: false, playing: true })).toEqual({ seekTo: null, run: true, rate: 1.06 });
    expect(videoTick({ state: back, currentTime: back.at + 0.01, ended: false, playing: true })).toEqual({ seekTo: null, run: true, rate: 1 });
    // paused, or holding: it does not run
    expect(videoTick({ state: back, currentTime: back.at, ended: false, playing: false }).run).toBe(false);
    expect(videoTick({ state: { at: 190.325, hold: "ran_out" }, currentTime: 190.325, ended: false, playing: true }).run).toBe(false);
  });
});
