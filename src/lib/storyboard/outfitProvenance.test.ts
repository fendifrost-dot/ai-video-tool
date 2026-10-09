import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/worldBatch/browserDeps", () => ({ browserRunnerDeps: vi.fn() }));

import { parseShotSpec } from "@/lib/treatment/shotSpec";
import type { Outfit, OutfitRecord, ShotOutfit } from "@/lib/wardrobe/outfits";
import { boxFromRow, boxWrite, type BoxRow } from "./boxes";
import { runContext } from "./generate";
import { showsOriginalTake, type MediaAsset } from "./media";
import { displayedOutfitOutdated, type ProvenanceJob } from "./outfitProvenance";
import { productionRoute, unmetRequirement } from "./route";
import type { ShotSpec } from "@/lib/treatment/shotSpec";

const outfit = (version: number, pieces: string[] = ["jacket"], key = "leather"): Outfit =>
  ({ key, name: key === "leather" ? "Leather coat" : "Mastic jacket", description: "", constraints: "", outfit: { version, garmentFeatureIds: pieces } }) as unknown as Outfit;
const wears = (o: Outfit | null): ShotOutfit => ({ outfit: o, source: o ? "scene" : "none", mode: "inherit", scene: null, missingKey: null });
const rec = (version: number, pieces: string[] = ["jacket"], key = "leather"): OutfitRecord => ({ key, name: key, version, pieces, words: "", source: "scene" });

const asset = (id: string, over: Partial<MediaAsset> = {}): MediaAsset => ({
  id, assetType: "generated_clip", footageRole: null, bucket: "project-clips", path: `p/${id}`, playback: null, name: id, mime: null,
  isVideo: true, isImage: false, durationSeconds: 4, shotId: "b1", sourceTool: null, providerJobId: null, createdAt: "2026-10-09T00:00:00Z", ...over,
});
const stillAsset = (id: string) => asset(id, { assetType: "generated_image", bucket: "project-references", isVideo: false, isImage: true });
const stillJob = (id: string, o: OutfitRecord | null): ProvenanceJob => ({ result_asset_id: id, request_payload_json: { mode: "still_only", settings: { batchRun: "storyboard", batchShotId: "c1", ...(o ? { outfit: o } : {}) } } });
const clipJob = (id: string, stillPath: string | null, o: OutfitRecord | null, extra: Record<string, unknown> = {}): ProvenanceJob => ({ result_asset_id: id, request_payload_json: { settings: { batchRun: "storyboard", batchShotId: "c1", stillPath, ...(o ? { outfit: o } : {}), ...extra } } });

const now = wears(outfit(2));
const check = (showing: MediaAsset | null, jobs: ProvenanceJob[], assets: MediaAsset[], resolved = now, pieces = ["jacket"]) =>
  displayedOutfitOutdated({ showing, resolved, pieces, jobs, assets });

describe("Bug 2 — what the box SHOWS is judged, not the selected still", () => {
  it("an old displayed clip is outdated even when a newer, current still exists on the box", () => {
    const oldStill = stillAsset("s1"), newStill = stillAsset("s2"), clip = asset("c1");
    const jobs = [stillJob("s1", rec(1)), stillJob("s2", rec(2)), clipJob("c1", oldStill.path, rec(1))];
    expect(check(clip, jobs, [oldStill, newStill, clip])).toMatch(/v1; it is now v2/);
    // the new still alone is current
    expect(check(newStill, jobs, [oldStill, newStill, clip])).toBeNull();
  });

  it("a clip-only box (no still on it) is still checked, by the clip's own record", () => {
    const clip = asset("c1");
    expect(check(clip, [clipJob("c1", null, rec(1))], [clip])).toMatch(/v1; it is now v2/);
    expect(check(clip, [clipJob("c1", null, rec(2))], [clip])).toBeNull();
  });

  it("a changed outfit, version or pieces each make it outdated", () => {
    const clip = asset("c1");
    expect(check(clip, [clipJob("c1", null, rec(2, ["jacket"], "mastic"))], [clip])).toMatch(/now wears “Leather coat”/);
    expect(check(clip, [clipJob("c1", null, rec(1))], [clip])).toMatch(/v1/);
    expect(check(clip, [clipJob("c1", null, rec(2, ["shirt"]))], [clip])).toMatch(/other pieces/);
  });

  it("unknown provenance warns when the shot wears an outfit, and is silent when it wears none", () => {
    const clip = asset("c1");
    expect(check(clip, [], [clip])).toMatch(/made before the shot wore/);
    expect(check(clip, [], [clip], wears(null), [])).toBeNull();
    // the clip's job is known, the picture it was animated from has no record
    const s = stillAsset("s1");
    expect(check(clip, [clipJob("c1", s.path, rec(2))], [s, clip])).toMatch(/picture whose outfit is not recorded/);
  });

  it("a clip made from an old still after the outfit changed is outdated, whatever the clip's own job claims", () => {
    const s = stillAsset("s1"), clip = asset("c1");
    // the clip job (pre-fix) recorded the CURRENT outfit; the still it animated was drawn in v1
    const jobs = [stillJob("s1", rec(1)), clipJob("c1", s.path, rec(2))];
    expect(check(clip, jobs, [s, clip])).toMatch(/made from a picture made with “Leather coat” v1/);
  });

  it("a clip that drew its own picture in the same job is judged by that job", () => {
    const clip = asset("c1");
    expect(check(clip, [clipJob("c1", "p/fresh", rec(2), { stillCandidates: ["p/fresh"] })], [clip])).toBeNull();
  });

  it("the original take is not this check's business (the unmet check owns it)", () => {
    expect(check(asset("t", { footageRole: "performance", assetType: "reference_video" }), [], [])).toBeNull();
  });
});

describe("generate.ts runContext: a clip from an existing picture records the picture's outfit", () => {
  const box = (() => {
    const spec = parseShotSpec({ id: "c001", purpose: "a coat on a rail", shotType: "b_roll", kind: "broll", timeline: { start: 0, end: 4 } });
    const w = boxWrite({ key: "c001", start: 0, end: 4, section: "hook", generated: spec, override: null, locked: false, origin: "treatment", history: [] });
    return boxFromRow({ id: "r1", project_id: "p1", shot_number: 1, ...w, updated_at: "2026-10-09T00:00:00Z" } as BoxRow)!;
  })();
  it("the old picture's record, not the outfit asked for now", () => {
    expect(runContext("p1", box, undefined, null, now, { outfit: rec(1) }).outfits).toEqual({ c001: rec(1) });
  });
  it("no record at all when the picture's outfit is unknown — so it is never certified", () => {
    expect(runContext("p1", box, undefined, null, now, { outfit: null }).outfits).toBeUndefined();
  });
  it("the current outfit when nothing else is known about the picture (it is being drawn now)", () => {
    expect(runContext("p1", box, undefined, null, now).outfits?.c001).toMatchObject({ key: "leather", version: 2, pieces: ["jacket"] });
  });
});

describe("Bug 1 — an assigned original take does not hide the unmet requirement", () => {
  const take = asset("take", { footageRole: "performance", assetType: "reference_video" });
  const replacement = asset("re", { footageRole: "performance", derivedFrom: { assetId: "take", songStart: 0, sourceWindow: [0, 4], method: "restaged" } });
  const redressed = { shotType: "performance", production: { method: "restage" }, wardrobe: { source: "treatment", description: "his leather coat", garments: [] }, timeline: { start: 0, end: 4 } } as unknown as Pick<ShotSpec, "production" | "shotType" | "wardrobe" | "timeline">;
  const asFilmed = { shotType: "performance", production: { method: "footage" }, wardrobe: { source: "none", description: "", garments: [] }, timeline: { start: 0, end: 4 } } as unknown as Pick<ShotSpec, "production" | "shotType" | "wardrobe" | "timeline">;
  const FACTS = { hasTake: true, maxRestageSeconds: 10 } as Parameters<typeof productionRoute>[1];
  const unmet = (spec: typeof redressed, showing: { base: boolean; asset: MediaAsset }) => unmetRequirement(productionRoute(spec, FACTS), { onBaseTake: showsOriginalTake(showing), empty: false });

  it("the inherited original take is the original", () => {
    expect(showsOriginalTake({ base: true, asset: take })).toBe(true);
    expect(unmet(redressed, { base: true, asset: take })?.kind).toBe("fallback");
  });
  it("the same take assigned as primary (base:false) still reports the wardrobe swap as not done", () => {
    expect(showsOriginalTake({ base: false, asset: take })).toBe(true);
    expect(unmet(redressed, { base: false, asset: take })?.text).toMatch(/not finished/);
  });
  it("a shot meant to play the take as filmed stays finished", () => {
    expect(unmet(asFilmed, { base: false, asset: take })).toBeNull();
  });
  it("a genuine replacement made from the take is not mistaken for the original", () => {
    expect(showsOriginalTake({ base: false, asset: replacement })).toBe(false);
    expect(unmet(redressed, { base: false, asset: replacement })).toBeNull();
    expect(showsOriginalTake(null)).toBe(false);
  });
});
