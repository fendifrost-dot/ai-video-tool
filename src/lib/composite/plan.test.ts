import { describe, expect, it } from "vitest";
import type { BoxMediaItem, MediaAsset } from "@/lib/storyboard/media";
import { compositableTakes, compositesOn, planComposite, platesOfScene } from "./plan";

function asset(over: Partial<MediaAsset> & { id: string }): MediaAsset {
  return {
    assetType: "generated_clip",
    footageRole: "performance",
    bucket: "project-clips",
    path: `${over.id}.mp4`,
    playback: null,
    name: over.id,
    mime: "video/mp4",
    isVideo: true,
    isImage: false,
    durationSeconds: 7.958,
    shotId: null,
    sourceTool: "higgsfield",
    providerJobId: null,
    createdAt: "2026-10-15T23:33:06Z",
    ...over,
  };
}
const dressed = (id: string, over: Partial<MediaAsset> = {}) =>
  asset({
    id,
    derivedFrom: {
      assetId: "take",
      songStart: 99.46,
      sourceWindow: [98.6, 106.56],
      method: "dressed",
    },
    ...over,
  });
const plate = (id: string, sceneTitle: string, over: Partial<MediaAsset> = {}) =>
  asset({
    id,
    assetType: "reference_image",
    footageRole: null,
    bucket: "project-references",
    path: `worlds/plate_x_${id}.png`,
    isVideo: false,
    isImage: true,
    durationSeconds: null,
    plate: { sceneTitle, shotLabel: "plate_x", usable: true },
    ...over,
  });
const item = (a: MediaAsset, over: Partial<BoxMediaItem> = {}): BoxMediaItem => ({
  assignmentId: a.id,
  asset: a,
  role: "performance",
  kind: a.isVideo ? "video" : "image",
  sourceIn: null,
  sourceOut: null,
  leadIn: 0,
  selected: false,
  base: false,
  note: null,
  edit: null,
  ...over,
});

const facts = (over: Partial<Parameters<typeof planComposite>[0]> = {}) => ({
  items: [item(dressed("d1"))],
  assets: [plate("p1", "The cold front")],
  sceneName: "The cold front",
  placeAssetId: null,
  performance: true,
  ...over,
});

describe("planComposite", () => {
  it("picks the shot's dressed take and the scene's newest usable plate, and prices the matte", () => {
    const r = planComposite(
      facts({
        assets: [
          plate("old", "The cold front", { createdAt: "2026-10-15T05:01:08Z" }),
          plate("new", "the cold front ", { createdAt: "2026-10-15T05:04:00Z" }),
          plate("other", "Chicago, the switch"),
          plate("bad", "The cold front", {
            plate: { sceneTitle: "The cold front", shotLabel: null, usable: false },
          }),
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.dressed.id).toBe("d1");
    expect(r.plan.plate.id).toBe("new");
    expect(r.plan.plateFrom).toBe("scene");
    expect(r.plan.otherPlates.map((p) => p.id)).toEqual(["old"]);
    expect(r.plan.frames).toBe(191);
    expect(r.plan.cost.usd).toBeCloseTo(0.1433, 3);
    expect(r.plan.songStart).toBe(99.46);
    expect(r.plan.recipe.version).toBe("plate-composite-v1-2026-10-15");
  });

  it("prefers the selected dressed take, then the newest, and never a rejected one", () => {
    const items = [
      item(dressed("older", { createdAt: "2026-10-15T01:00:00Z" })),
      item(dressed("newer", { createdAt: "2026-10-15T02:00:00Z" })),
      item(dressed("bad", { approvalStatus: "rejected", createdAt: "2026-10-15T03:00:00Z" })),
    ];
    expect(compositableTakes(items).map((a) => a.id)).toEqual(["newer", "older"]);
    expect(
      compositableTakes([
        items[0],
        { ...items[1], selected: false },
        { ...items[0], selected: true },
      ]).map((a) => a.id)[0],
    ).toBe("older");
    const r = planComposite(facts({ items }));
    expect(r.ok && r.plan.dressed.id).toBe("newer");
  });

  it("falls back to the location's approved picture when the scene has no plate", () => {
    const place = plate("place", "elsewhere", { plate: null });
    const r = planComposite(facts({ assets: [place], placeAssetId: "place" }));
    expect(r.ok && r.plan.plate.id).toBe("place");
    expect(r.ok && r.plan.plateFrom).toBe("location");
  });

  it("says why it cannot plan", () => {
    expect(planComposite(facts({ performance: false }))).toMatchObject({
      ok: false,
      why: expect.stringContaining("performance shot"),
    });
    expect(planComposite(facts({ items: [item(asset({ id: "raw" }))] }))).toMatchObject({
      ok: false,
      why: expect.stringContaining("dress it first"),
    });
    expect(planComposite(facts({ assets: [] }))).toMatchObject({
      ok: false,
      why: expect.stringContaining("no plate yet"),
    });
    expect(
      planComposite(facts({ items: [item(dressed("long", { durationSeconds: 61 }))] })),
    ).toMatchObject({ ok: false, why: expect.stringContaining("60 s") });
  });

  it("lists a scene's plates and a shot's composites", () => {
    expect(platesOfScene([plate("a", "X"), plate("b", "Y")], "x").map((p) => p.id)).toEqual(["a"]);
    const c = asset({
      id: "c",
      derivedFrom: {
        assetId: "d1",
        songStart: 99.46,
        sourceWindow: [0, 7.958],
        method: "composite",
      },
    });
    expect(compositesOn([item(dressed("d1")), item(c)]).map((a) => a.id)).toEqual(["c"]);
  });
});
