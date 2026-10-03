import { describe, expect, it, vi } from "vitest";

// the plan is pure; the effects reach the browser's Supabase client, which a test has no use for
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/worldBatch/browserDeps", () => ({ browserRunnerDeps: vi.fn() }));

import { parseShotSpec } from "@/lib/treatment/shotSpec";
import { buildMotionRequest, estimateShotUsd, missingInput } from "@/lib/worldBatch";
import { boxFromRow, boxWrite, type BoxRow } from "./boxes";
import { boxMedia, isOriginalTake, type Assignment, type MediaAsset, type TakeSync } from "./media";
import { footageSummary, setupStatus } from "./setup";
import { restageEstimateUsd, restageKeep, restageSeconds, restageShot, restageSource, RESTAGE_MAX_SECONDS } from "./restage";

const AT = "2026-10-03T00:00:00Z";
function asset(id: string, over: Partial<MediaAsset> = {}): MediaAsset {
  return { id, assetType: "generated_clip", footageRole: null, bucket: "project-clips", path: `u/p/${id}.mp4`, playback: null, name: `${id}.mp4`, mime: "video/mp4", isVideo: true, isImage: false, durationSeconds: 5, shotId: null, sourceTool: null, providerJobId: null, createdAt: AT, ...over };
}
const sync = (over: Partial<TakeSync> = {}): TakeSync => ({ id: "s1", projectId: "p1", songAssetId: "song", performanceAssetId: "take1", offsetSeconds: 0.8538, driftPpm: 0, method: "manual", status: "confirmed", ...over });
const take = asset("take1", { footageRole: "performance", assetType: "reference_video", bucket: "project-references", durationSeconds: 190.34, name: "take1.mp4", shows: "a camouflage shirt, dark cap and sunglasses" });
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
    });
    expect(req.seconds).toBe(4);
    // the clip's first frame sits where the cut began: take time through the take's own sync
    expect(req.songStart).toBeCloseTo(47.054, 3);
    expect(req.shot).toMatchObject({ id: "c013", route: "seedance_ref", kind: "angle", aspect: "9:16", seconds: 4, source_seconds: 4, source_asset_id: "take1", masterStart: req.songStart, still_path: "u/p/stills/c013.png", resolution: "720p" });
    expect(req.shot.angle).toMatch(/push/i);
    expect(missingInput(req.shot)).toBe("");
    expect(estimateShotUsd(req.shot)).toBeCloseTo(restageEstimateUsd(4), 4);
    const motion = buildMotionRequest(req.shot, { prompt: "x", stillUrl: "https://s/still", sourceUrl: "https://s/src", userId: "u", projectId: "p" });
    expect(motion.body).toMatchObject({ mode: "reference_to_video", referenceVideoUrls: ["https://s/src"], referenceImageUrls: ["https://s/still"], duration: 4, generate_audio: false });
  });

  it("asks for the project's frame", () => {
    const b = box(47.06, 50.98);
    const base = { box: b, lyricLines: [], source: { take, sync: sync(), takeIn: 46.2, takeOut: 50.12 }, sourcePath: "a.mp4", stillPath: "b.png", cut: { start: 46.2, seconds: 4 } };
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
    const note = footageSummary({ takes: [{ name: take.name, songStart: 0.85, songEnd: 191, shows: take.shows }], broll: [] });
    expect(note).toMatch(/it shows: a camouflage shirt, dark cap and sunglasses/);
    expect(note).toMatch(/restaged/);
  });
});
