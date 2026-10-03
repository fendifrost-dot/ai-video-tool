import { describe, expect, it, vi } from "vitest";

// the plan is pure; the effects reach the browser's Supabase client, which a test has no use for
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/worldBatch/browserDeps", () => ({ browserRunnerDeps: vi.fn() }));
vi.mock("@/lib/queries/storyboard", () => ({}));

import { parseShotSpec } from "@/lib/treatment/shotSpec";
import { buildMotionRequest, estimateShotUsd, missingInput } from "@/lib/worldBatch";
import { boxFromRow, boxWrite, type BoxRow } from "./boxes";
import { boxMedia, buildTimeline, imageForClip, isOriginalTake, type Assignment, type BoxMediaItem, type MediaAsset, type TakeSync } from "./media";
import { verifyCut } from "./verify";
import { clipLyrics } from "./build";
import { footageSummary, setupStatus } from "./setup";
import { boxShot, placePrompt } from "./generate";
import { NEVER_WIDER, restageAngle, restageEstimateUsd, restageKeep, restageSeconds, restageShot, restageSource, restageTemporalPlan, RESTAGE_MAX_SECONDS } from "./restage";

const AT = "2026-10-03T00:00:00Z";
function asset(id: string, over: Partial<MediaAsset> = {}): MediaAsset {
  return { id, assetType: "generated_clip", footageRole: null, bucket: "project-clips", path: `u/p/${id}.mp4`, playback: null, name: `${id}.mp4`, mime: "video/mp4", isVideo: true, isImage: false, durationSeconds: 5, shotId: null, sourceTool: null, providerJobId: null, createdAt: AT, ...over };
}
const sync = (over: Partial<TakeSync> = {}): TakeSync => ({ id: "s1", projectId: "p1", songAssetId: "song", performanceAssetId: "take1", offsetSeconds: 0.8538, driftPpm: 0, method: "manual", status: "confirmed", ...over });
const take = asset("take1", { footageRole: "performance", assetType: "reference_video", bucket: "project-references", durationSeconds: 190.34, name: "take1.mp4", shows: "a camouflage shirt, dark cap and sunglasses", filmedIn: "a walk-in closet, in front of a white door" });
function box(start: number, end: number, shotType: "performance" | "b_roll" = "performance") {
  const spec = parseShotSpec({ id: "c013", purpose: "backstage of a runway show, racks of white garments under one hard light", shotType, kind: shotType === "performance" ? "performance" : "broll", timeline: { start, end }, cameraMotion: { type: "dolly", description: "a slow push toward him" } });
  const w = boxWrite({ key: "c013", start, end, section: "verse", generated: spec, override: null, locked: false, origin: "treatment", history: [] });
  return boxFromRow({ id: "r13", project_id: "p1", shot_number: 14, ...w, updated_at: AT } as BoxRow)!;
}
const assign = (id: string, assetId: string, role: Assignment["role"], over: Partial<Assignment> = {}): Assignment => ({ id, projectId: "p1", shotId: "r13", assetId, role, sourceIn: null, sourceOut: null, isPrimary: false, sortOrder: 0, notes: null, createdAt: AT, updatedAt: AT, ...over });

describe("which take a performance shot restages", () => {
  const b = box(47.06, 50.98);
  it("is the synced take under the shot, at the shot's own place in it", () => {
    const m = boxMedia({ box: b, assignments: [], assets: new Map([[take.id, take]]), syncs: [sync()] });
    const r = restageSource(m.items, [sync()]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source.take.id).toBe("take1");
    expect(r.source.takeIn).toBeCloseTo(46.2062, 3);
    expect(r.source.takeOut - r.source.takeIn).toBeCloseTo(3.92, 3);
  });

  it("says why when there is nothing to restage", () => {
    expect(restageSource([], [])).toMatchObject({ ok: false });
    // a take that only reaches part of the shot is not restaged whole
    const head = boxMedia({ box: box(0, 4), assignments: [], assets: new Map([[take.id, take]]), syncs: [sync()] });
    const r = restageSource(head.items, [sync()]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toMatch(/only part/);
  });

  it("never restages a restaging: the source is always the take as filmed", () => {
    const derived = asset("re1", { footageRole: "performance", durationSeconds: 4, derivedFrom: { assetId: "take1", songStart: 47.06 } });
    const syncs = [sync(), sync({ id: "s2", performanceAssetId: "re1", offsetSeconds: 47.06, method: "derived" })];
    const m = boxMedia({ box: b, assignments: [assign("a1", "re1", "performance", { isPrimary: true })], assets: new Map([[take.id, take], [derived.id, derived]]), syncs });
    expect(m.showing?.asset.id).toBe("re1");
    const r = restageSource(m.items, syncs);
    expect(r.ok && r.source.take.id).toBe("take1");
  });
});

describe("what a restaging asks for and costs", () => {
  it("asks for whole seconds that cover the shot, four at least, and refuses a shot too long for one piece", () => {
    expect(restageSeconds(3.92)).toBe(4);
    expect(restageSeconds(2)).toBe(4);
    expect(restageSeconds(5.88)).toBe(6);
    expect(restageSeconds(4.01)).toBe(5);
    // the cut opens on the frame showing when the shot starts, up to a frame early: a shot a hair under a whole second needs the next one
    expect(restageSeconds(3.98)).toBe(5);
    // a cut that has to open 1.4 s early pays for that too
    expect(restageSeconds(3.92, 1.4)).toBe(6);
    expect(restageSeconds(RESTAGE_MAX_SECONDS + 0.5)).toBeNull();
  });

  it("prices the seconds given and the seconds returned", () => {
    expect(restageEstimateUsd(4)).toBeCloseTo(3.6976, 4);
  });

  it("keeps what the take shows, in the director's words, or everything he wears when Setup does not say", () => {
    expect(restageKeep(take)).toEqual(["his face, skin and build", "a camouflage shirt, dark cap and sunglasses"]);
    expect(restageKeep({ shows: null })[1]).toMatch(/every piece of his wardrobe/);
  });

  it("compiles to one reference-to-video shot the runner accepts, placed on the song clock", () => {
    const b = box(47.06, 50.98);
    const req = restageShot({
      box: b,
      lyricLines: [],
      source: { take, sync: sync(), takeIn: 46.2062, takeOut: 50.1262 },
      sourcePath: "u/p/seedance/storyboard_c013_src.mp4",
      stillPath: "u/p/stills/c013.png",
      cut: { start: 46.2, seconds: 4.0000003 },
      temporal: restageTemporalPlan(b),
    });
    expect(req.seconds).toBe(4);
    // the clip's first frame sits where the cut began: take time through the take's own sync
    expect(req.songStart).toBeCloseTo(47.054, 3);
    expect(req.shot).toMatchObject({ id: "c013", route: "seedance_ref", kind: "angle", aspect: "9:16", seconds: 4, source_seconds: 4, source_asset_id: "take1", masterStart: req.songStart, still_path: "u/p/stills/c013.png", resolution: "720p" });
    // the camera sentence is the shot's own framing and move, and says nothing of what he does
    expect(req.shot.angle).toBe(`a medium shot from the waist up, the camera pushing slowly toward him. ${NEVER_WIDER}`);
    // a wide frame is asked for without asking for the body the take never filmed
    const wide = restageAngle({ ...b, spec: { ...b.spec, framing: "wide" } });
    expect(wide).toContain("framed as far down as @Video1 frames him and no further");
    expect(wide).not.toMatch(/whole body|knees/);
    expect(missingInput(req.shot)).toBe("");
    expect(estimateShotUsd(req.shot)).toBeCloseTo(restageEstimateUsd(4), 4);
    const motion = buildMotionRequest(req.shot, { prompt: "x", stillUrl: "https://s/still", sourceUrl: "https://s/src", userId: "u", projectId: "p" });
    expect(motion.body).toMatchObject({ mode: "reference_to_video", referenceVideoUrls: ["https://s/src"], referenceImageUrls: ["https://s/still"], duration: 4, generate_audio: false });
  });

  it("asks for the project's frame", () => {
    const b = box(47.06, 50.98);
    const base = { box: b, lyricLines: [], source: { take, sync: sync(), takeIn: 46.2, takeOut: 50.12 }, sourcePath: "a.mp4", stillPath: "b.png", cut: { start: 46.2, seconds: 4 }, temporal: restageTemporalPlan(b) };
    expect(restageShot({ ...base, aspect: "16:9" }).shot.aspect).toBe("16:9");
    expect(restageShot({ ...base, aspect: "4:5" }).shot.aspect).toBe("3:4");
  });
});

describe("a restaged take is one moment of a take, not a take of the song", () => {
  const derived = asset("re1", { footageRole: "performance", durationSeconds: 4, derivedFrom: { assetId: "take1", songStart: 47.0538 } });
  const assets = new Map([[take.id, take], [derived.id, derived]]);
  const syncs = [sync(), sync({ id: "s2", performanceAssetId: "re1", offsetSeconds: 47.0538, method: "derived" })];

  it("plays on the shot it was made for by the song clock, like the master", () => {
    const m = boxMedia({ box: box(47.06, 50.98), assignments: [assign("a1", "re1", "performance", { isPrimary: true })], assets, syncs });
    expect(m.showing?.asset.id).toBe("re1");
    expect(m.showing?.sourceIn).toBeCloseTo(0.0062, 4);
    expect(m.showing!.sourceOut! - m.showing!.sourceIn!).toBeCloseTo(3.92, 4);
    expect(m.showing?.note).toBeNull();
    // the take as filmed is still there underneath, one click away
    expect(m.items.some((i) => i.base && i.asset.id === "take1")).toBe(true);
  });

  it("covers its shot when it starts a few milliseconds off the shot's own start (a cut lands on a frame, not on a millisecond)", () => {
    // the first live restaging: the shot starts at 47.060, the clip's first frame sits at 47.067
    const late = [sync(), sync({ id: "s2", performanceAssetId: "re1", offsetSeconds: 47.067, method: "derived" })];
    const m = boxMedia({ box: box(47.06, 50.98), assignments: [assign("a1", "re1", "performance", { isPrimary: true })], assets, syncs: late });
    expect(m.showing?.asset.id).toBe("re1");
    expect(m.showing?.note).toBeNull();
    expect(m.showing?.sourceIn).toBe(0);
    // it is said to cover the shot, and it is still placed to the millisecond: the 7 ms stay a lead-in, the clip is not slid
    expect(m.showing?.leadIn).toBeCloseTo(0.007, 4);
    // more than a frame short is still said
    const short = [sync(), sync({ id: "s2", performanceAssetId: "re1", offsetSeconds: 47.2, method: "derived" })];
    expect(boxMedia({ box: box(47.06, 50.98), assignments: [assign("a1", "re1", "performance", { isPrimary: true })], assets, syncs: short }).showing?.note).toMatch(/only part/);
  });

  it("holds against the song clock in 'Check this cut', placed where its own sync says — not slid to the cut", () => {
    // found on the live project: counting the 7 ms as nothing put the clip 7 ms early and the check caught it
    const late = [sync(), sync({ id: "s2", performanceAssetId: "re1", offsetSeconds: 47.067, method: "derived" })];
    const boxes = [box(47.06, 50.98)];
    const assignments = [assign("a1", "re1", "performance", { isPrimary: true })];
    const timeline = buildTimeline({ boxes, assignments, assets, syncs: late });
    const report = verifyCut({ timeline, boxes: boxes.map((b) => ({ id: b.id, key: b.key, start: b.start, end: b.end })), assignments, assets, syncs: late, fileSeconds: new Map([["re1", 4.04]]), songSeconds: null });
    const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
    expect(byId.sync.ok, byId.sync.failures.join("; ")).toBe(true);
    expect(byId.resume?.ok ?? true).toBe(true);
    expect(byId.hold?.ok ?? true, byId.hold?.failures.join("; ")).toBe(true);
  });

  it("is never the base layer of another shot", () => {
    // the next shot starts inside the restaged clip's last frames: it must not show a sliver of it
    const next = boxMedia({ box: { id: "r14", start: 50.98, end: 54.9 }, assignments: [], assets, syncs });
    expect(next.items.map((i) => i.asset.id)).toEqual(["take1"]);
    const same = boxMedia({ box: { id: "r13", start: 47.06, end: 50.98 }, assignments: [], assets, syncs });
    expect(same.items.map((i) => i.asset.id)).toEqual(["take1"]);
  });

  it("says so when it is moved to a shot it has no footage for", () => {
    const m = boxMedia({ box: { id: "r20", start: 70, end: 74 }, assignments: [{ ...assign("a1", "re1", "performance", { isPrimary: true }), shotId: "r20" }], assets, syncs });
    expect(m.items[0].note).toMatch(/no footage for this part of the song/);
    expect(m.showing?.asset.id).toBe("take1");
  });

  it("is not counted as a take in Setup, and the writer is told what the real take shows", () => {
    expect(isOriginalTake(take)).toBe(true);
    expect(isOriginalTake(derived)).toBe(false);
    const s = setupStatus({ hasSong: true, songSeconds: 200, analysed: true, bpm: 122, lyricsText: "a", lyricLines: 95, media: [take, derived], syncs: [{ performanceAssetId: "take1", status: "confirmed" }], footageConfirmedAt: AT });
    expect(s.counts.takes).toBe(1);
    const note = footageSummary({ takes: [{ name: take.name, songStart: 0.85, songEnd: 191, shows: take.shows, filmedIn: take.filmedIn }], broll: [] });
    expect(note).toMatch(/in it he wears: a camouflage shirt, dark cap and sunglasses/);
    expect(note).toMatch(/it was filmed in: a walk-in closet, in front of a white door/);
    expect(note).toMatch(/the place it was filmed in is replaced/);
    // the place never reaches the list of things a restaged shot keeps
    expect(restageKeep(take).join(" ")).not.toMatch(/closet|door/);
  });
});

describe("the words the writer is told each shot has to answer", () => {
  const lines = [
    { lineIndex: 0, text: "Never take a cheat day", start: 50.1, end: 51.14, words: [] },
    { lineIndex: 1, text: "Feel free today", start: 51.14, end: 52.02, words: [] },
    { lineIndex: 2, text: "an unsung repeat", start: 60, end: 75, words: [] },
  ] as never;
  it("are the lines sung inside its window, by key; a shot with no words has no entry", () => {
    const grid = [
      { key: "c013", start: 47.06, end: 50.98 },
      { key: "c014", start: 50.98, end: 54.9 },
      { key: "c019", start: 62, end: 66 },
    ];
    const out = clipLyrics(grid, lines);
    expect(out.c013).toBe("Never take a cheat day");
    expect(out.c014).toBe("Never take a cheat day / Feel free today");
    expect(out.c019).toBeUndefined();
    expect(clipLyrics(grid, undefined)).toEqual({});
  });
});

describe("the place drawn for a performance shot", () => {
  it("is the place alone: the frame the director wrote, else the place the writer named, never the sentence about him", () => {
    const b = box(47.06, 50.98);
    const writer = { ...b.spec, environment: { ...b.spec.environment, description: "A backstage fitting room: racks of white and black garments, a wall of bulb mirrors, warm tungsten light." } };
    const fromWriter = placePrompt(writer);
    expect(fromWriter).toMatch(/^An empty set, photographed with nobody in it/);
    expect(fromWriter).toContain("A backstage fitting room: racks of white and black garments");
    expect(fromWriter).not.toContain("backstage of a runway show, racks of white garments under one hard light");
    expect(fromWriter).toMatch(/no person stands there\.$/);
    const directed = placePrompt({ ...writer, openingFrame: "A black runway in near darkness, one line of white light on the floor." });
    expect(directed).toContain("A black runway in near darkness");
    expect(directed).not.toContain("fitting room");
  });

  it("falls back to the scene only when the place is a mere label, and then says to leave him out", () => {
    const b = box(47.06, 50.98);
    const label = placePrompt({ ...b.spec, environment: { ...b.spec.environment, description: "backstage" }, purpose: "The artist stands in the fitting room, racks behind him." });
    expect(label).toContain("backstage. Only the place of this scene, without the performer it mentions: The artist stands in the fitting room, racks behind him.");
    expect(label).toMatch(/^An empty set/);
  });

  it("is what the shot's image request carries, with no motion of a person in it", () => {
    const b = box(47.06, 50.98);
    const shot = boxShot({ ...b, spec: { ...b.spec, openingFrame: "A black runway in near darkness, one line of white light on the floor." } }, []);
    expect(shot.prompt).toContain("An empty set, photographed with nobody in it");
    expect(shot.prompt).toContain("A black runway in near darkness");
    expect(shot.prompt).not.toMatch(/backstage of a runway show/);
    expect(shot.motion).toBe("");
  });
});

describe("the image a clip is made from", () => {
  const image = (id: string, createdAt: string, selected = false): BoxMediaItem => ({
    assignmentId: `a-${id}`,
    asset: asset(id, { assetType: "generated_still", isVideo: false, isImage: true, mime: "image/png", durationSeconds: null, bucket: "project-references", createdAt }),
    role: "generated_image",
    kind: "image",
    sourceIn: null,
    sourceOut: null,
    leadIn: 0,
    selected,
    base: false,
    note: null,
  });
  it("is the first image of the latest batch drawn for the shot — a place drawn again replaces the one before it", () => {
    const first = [image("old1", "2026-10-03T10:39:00Z"), image("old2", "2026-10-03T10:39:02Z")];
    const again = [image("new1", "2026-10-03T11:20:00Z"), image("new2", "2026-10-03T11:20:03Z")];
    expect(imageForClip(first)?.asset.id).toBe("old1");
    expect(imageForClip([...first, ...again])?.asset.id).toBe("new1");
  });
  it("is the one the director chose, whenever he chose one", () => {
    expect(imageForClip([image("old1", "2026-10-03T10:39:00Z", true), image("new1", "2026-10-03T11:20:00Z")])?.asset.id).toBe("old1");
    expect(imageForClip([])).toBeNull();
  });
});
