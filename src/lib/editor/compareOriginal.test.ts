import { describe, expect, it } from "vitest";
import { emptySequence, type EditClip } from "../../../supabase/functions/edit-render/model";
import { resolveCompareOriginal, resolveOriginalAssetId } from "./compareOriginal";
import type { TakeSync } from "@/lib/storyboard/media";

function clip(over: Partial<EditClip> & Pick<EditClip, "id" | "name" | "assetId">): EditClip {
  return {
    track: "V1",
    order: 0,
    shotId: null,
    shotKey: "c033",
    fileName: null,
    sourceIn: 0,
    sourceOut: 4,
    timelineIn: 0,
    timelineOut: 4,
    speed: 1,
    transition: "cut",
    transitionSeconds: 0,
    labelColor: null,
    placeholder: false,
    comment: "",
    enabled: true,
    mediaDuration: 10,
    mouth: "model",
    ...over,
  };
}

const sync = (assetId: string, offset = 0.8538): TakeSync =>
  ({
    id: "s1",
    projectId: "p",
    songAssetId: "song",
    performanceAssetId: assetId,
    offsetSeconds: offset,
    driftPpm: 0,
    method: "manual",
    status: "manual",
    updatedAt: "2026-10-18T00:00:00Z",
  }) as TakeSync;

const original = {
  id: "orig",
  footage_role: "performance",
  metadata_json: {},
};
const dressed = {
  id: "dress",
  footage_role: "performance",
  metadata_json: { derived_from: { asset_id: "orig", method: "dressed" } },
};
const montage = {
  id: "mont",
  footage_role: null,
  metadata_json: { derived_from: { asset_id: "dress", method: "montage" } },
};

describe("resolveOriginalAssetId", () => {
  it("walks derived_from to the camera original", () => {
    const byId = new Map([original, dressed, montage].map((a) => [a.id, a] as const));
    expect(resolveOriginalAssetId("mont", byId)?.originalId).toBe("orig");
    expect(resolveOriginalAssetId("mont", byId)?.chain).toEqual(["mont", "dress", "orig"]);
    expect(resolveOriginalAssetId("orig", byId)?.originalId).toBe("orig");
  });
});

describe("resolveCompareOriginal", () => {
  it("maps song time through the original’s sync, not song==source", () => {
    const seq = emptySequence({ projectId: "p", name: "t" });
    seq.songOffset = 13.791667;
    seq.clips = [clip({ id: "1", name: "c033", assetId: "mont", timelineIn: 0, timelineOut: 4 })];
    const r = resolveCompareOriginal({
      sequence: seq,
      clip: seq.clips[0]!,
      playhead: 1.0,
      assets: [original, dressed, montage],
      syncs: [sync("orig", 0.8538)],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.originalAssetId).toBe("orig");
    expect(r.songTime).toBeCloseTo(14.791667, 5);
    expect(r.sourceTime).toBeCloseTo(14.791667 - 0.8538, 5);
    expect(r.sourceTime).not.toBeCloseTo(r.songTime, 2);
  });

  it("explains when sync is missing instead of guessing", () => {
    const seq = emptySequence({ projectId: "p", name: "t" });
    seq.clips = [clip({ id: "1", name: "c", assetId: "mont" })];
    const r = resolveCompareOriginal({
      sequence: seq,
      clip: seq.clips[0]!,
      playhead: 0,
      assets: [original, dressed, montage],
      syncs: [],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/sync/i);
  });
});
