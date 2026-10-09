import { describe, expect, it } from "vitest";
import type { MediaAsset } from "./media";
import type { ShotOutfit } from "@/lib/wardrobe/outfits";
import { displayedOutfitOutdated, type ProvenanceJob } from "./outfitProvenance";

const resolved: ShotOutfit = {
  outfit: null,
  source: "none",
  mode: "inherit",
  scene: null,
  missingKey: null,
};
const clip = {
  id: "clip",
  path: "p/clip",
  isVideo: true,
  footageRole: null,
} as MediaAsset;
const still = {
  id: "still",
  path: "p/still",
  isVideo: false,
  isImage: true,
  footageRole: null,
} as MediaAsset;
const job = (id: string, settings: Record<string, unknown>): ProvenanceJob => ({
  result_asset_id: id,
  request_payload_json: { settings },
});
const check = (showing = clip, jobs: ProvenanceJob[] = [], pieces = ["jacket"]) =>
  displayedOutfitOutdated({
    showing,
    resolved,
    pieces,
    jobs,
    assets: [clip, still],
  });

describe("piece-only wardrobe provenance", () => {
  it("warns for a clip with no job even without a named outfit", () => {
    expect(check()).toMatch(/pieces.*not recorded/);
  });
  it("warns for a displayed still with no job", () => {
    expect(check(still)).toMatch(/pieces.*not recorded/);
  });
  it("warns when a known job has no wardrobe record", () => {
    expect(check(clip, [job(clip.id, {})])).toMatch(/pieces.*not recorded/);
  });
  it("does not certify an existing source still with missing provenance", () => {
    expect(check(clip, [job(clip.id, { stillPath: still.path })])).toMatch(/pieces.*not recorded/);
    expect(check(clip, [job(clip.id, { stillPath: still.path }), job(still.id, {})])).toMatch(
      /pieces.*not recorded/,
    );
  });
  it("does not require wardrobe provenance when no outfit or pieces are requested", () => {
    expect(check(clip, [], [])).toBeNull();
    expect(check(clip, [job(clip.id, { stillPath: still.path })], [])).toBeNull();
  });
  it("keeps the original-take exception", () => {
    expect(check({ ...clip, footageRole: "performance" })).toBeNull();
  });
});
