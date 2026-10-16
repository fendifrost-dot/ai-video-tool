import { describe, expect, it } from "vitest";
import type { BoxMediaItem, MediaAsset } from "./media";
import { neighbourVersion, versionKind, versionName, versionsOf, whenMade } from "./versions";

function asset(id: string, createdAt: string, over: Partial<MediaAsset> = {}): MediaAsset {
  return { id, assetType: "generated_clip", footageRole: "performance", bucket: "project-clips", path: `u/p/${id}.mp4`, playback: null, name: `generated_higgsfield_${id}.mp4`, mime: "video/mp4", isVideo: true, isImage: false, durationSeconds: 4, shotId: "s1", sourceTool: "higgsfield", providerJobId: null, createdAt, ...over };
}
function item(a: MediaAsset, over: Partial<BoxMediaItem> = {}): BoxMediaItem {
  return { assignmentId: `asg-${a.id}`, asset: a, role: "performance", kind: "video", sourceIn: 0, sourceOut: 1.5, leadIn: 0, selected: false, base: false, note: null, edit: null, ...over };
}

const take = item(asset("take", "2026-10-15T01:00:00Z", { assetType: "reference_video", footageRole: "performance", durationSeconds: 190, name: "take.mp4", sourceTool: "manual" }), { assignmentId: null, base: true });
const dressed = item(asset("dressed", "2026-10-15T04:48:00Z", { derivedFrom: { assetId: "take", songStart: 73.5, method: "dressed" } }));
const comp1 = item(asset("comp1", "2026-10-16T16:35:00Z", { derivedFrom: { assetId: "dressed", songStart: 73.5, method: "composite" } }));
const mont1 = item(asset("mont1", "2026-10-16T07:07:00Z", { derivedFrom: { assetId: "dressed", songStart: 73.8, method: "montage" } }));
const mont2 = item(asset("mont2", "2026-10-16T17:27:00Z", { derivedFrom: { assetId: "dressed", songStart: 73.8, method: "montage" } }), { selected: true });
const old = item(asset("old", "2026-10-14T00:00:00Z", { derivedFrom: { assetId: "take", songStart: 73.8 } }));

describe("the versions of a shot", () => {
  it("names each clip by what it is", () => {
    expect(versionKind(take)).toBe("Your take");
    expect(versionKind(dressed)).toBe("Dressed");
    expect(versionKind(comp1)).toBe("New background");
    expect(versionKind(mont1)).toBe("Montage");
    expect(versionKind(old)).toBe("Restaged");
    expect(versionKind(item(asset("x", "2026-10-16T00:00:00Z"), { role: "generated_clip" }))).toBe("AI clip");
  });

  it("numbers the ones of a kind by when they were made, and leaves a lone one unnumbered", () => {
    // the board lists the one showing first; the numbering does not follow that order
    const items = [mont2, take, dressed, comp1, mont1, old];
    const names = versionsOf(items).map((v) => v.name);
    expect(names).toEqual(["Montage 2", "Your take", "Dressed", "New background", "Montage 1", "Restaged"]);
    expect(versionName(mont1, items)).toBe("Montage 1");
    expect(versionsOf(items)[0].title).toBe("Montage 2 · 16 Oct 17:27 · 4.0 s");
    expect(versionsOf([take]).map((v) => v.title)).toEqual(["Your take · 15 Oct 01:00 · 190.0 s"]);
  });

  it("flips to the next and previous version, wrapping round, and stays put when alone", () => {
    const items = [mont2, take, dressed];
    expect(neighbourVersion(mont2, items, 1)).toBe(take);
    expect(neighbourVersion(mont2, items, -1)).toBe(dressed);
    expect(neighbourVersion(dressed, items, 1)).toBe(mont2);
    expect(neighbourVersion(take, [take], 1)).toBeNull();
  });

  it("writes the time it was made in UTC, short", () => {
    expect(whenMade("2026-10-16T17:27:03.953658+00:00")).toBe("16 Oct 17:27");
    expect(whenMade("not a date")).toBe("");
  });
});
