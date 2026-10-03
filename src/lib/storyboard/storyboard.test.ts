import { describe, expect, it } from "vitest";
import { parseShotSpec, type ShotSpec } from "@/lib/treatment/shotSpec";
import {
  applyGenerated,
  applyOverride,
  boxFromRow,
  boxWrite,
  boxesFromRows,
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
  renderPlan,
  roleForAsset,
  segmentAt,
  takeRangeForBox,
  timelineIssues,
  type Assignment,
  type MediaAsset,
  type TakeSync,
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

  it("the render plan names the ORIGINAL file of every segment, its in/out and the record it came from", () => {
    const withCopy = new Map(assets);
    withCopy.set("take1", { ...take, playback: { bucket: "project-clips", path: "u/p/take1_720p.mp4" } });
    const plan = renderPlan(timeline, withCopy, { assetId: "song", bucket: "project-audio", path: "u/p/song.wav" });
    expect(plan).toMatchObject({ version: 1, clock: "song", duration_seconds: 12, song: { asset_id: "song", path: "u/p/song.wav" } });
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
