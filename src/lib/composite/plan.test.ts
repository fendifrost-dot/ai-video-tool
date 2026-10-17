import { describe, expect, it } from "vitest";
import type { BoxMediaItem, MediaAsset } from "@/lib/storyboard/media";
import { compositableTakes, compositesOn, planComposite, plateOffsetSeconds, platesOfScene, stillsOfScene } from "./plan";

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
    plate: { kind: "still", sceneTitle, shotLabel: "plate_x", usable: true },
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
            plate: { kind: "still", sceneTitle: "The cold front", shotLabel: null, usable: false },
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
    expect(r.plan.recipe.version).toBe("plate-composite-v3-2026-10-16");
    expect(r.plan.recipe.plate.startsAtShotIn).toBe(true);
  });

  it("goes over the newest usable moving plate of the chosen still when one exists, else the still, and carries the camera", () => {
    const sceneTitle = "The cold front";
    const d = dressed("d1");
    const p1 = plate("50fa1ce3-0000-4000-8000-000000000000", sceneTitle, { createdAt: "2026-10-15T10:00:00Z" });
    const video = (id: string, over: Partial<MediaAsset> = {}) =>
      asset({
        id,
        assetType: "generated_clip",
        footageRole: null,
        bucket: "project-clips",
        path: `u/p/${id}/generated_higgsfield_x.mp4`,
        isVideo: true,
        isImage: false,
        durationSeconds: 5.04,
        derivedFrom: null,
        plate: { kind: "video", sceneTitle, shotLabel: "plate_x", usable: true, stillAssetId: p1.id },
        ...over,
      });
    const older = video("v-old", { createdAt: "2026-10-16T01:00:00Z" });
    const newer = video("v-new", { createdAt: "2026-10-16T02:00:00Z" });
    const rejected = video("v-rej", { createdAt: "2026-10-16T03:00:00Z", approvalStatus: "rejected" });
    const otherStill = video("v-other", { createdAt: "2026-10-16T04:00:00Z", plate: { kind: "video", sceneTitle, shotLabel: "plate_x", usable: true, stillAssetId: "another" } });
    const r = planComposite({ items: [item(d)], assets: [d, p1, older, newer, rejected, otherStill], sceneName: sceneTitle, placeAssetId: null, performance: true });
    expect(r.ok && r.plan.plate.id).toBe(p1.id);
    expect(r.ok && r.plan.plateVideo?.id).toBe("v-new");
    expect(r.ok && r.plan.camera.version).toBe("handheld-v1-2026-10-16");
    // a moving plate is never mistaken for a still plate of the scene
    expect(platesOfScene([p1, newer], sceneTitle).map((a) => a.id)).toEqual([p1.id]);
    const none = planComposite({ items: [item(d)], assets: [d, p1], sceneName: sceneTitle, placeAssetId: null, performance: true });
    expect(none.ok && none.plan.plateVideo).toBeNull();
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
    expect(
      planComposite(
        facts({
          items: [
            item(
              dressed("nosync", {
                derivedFrom: { assetId: "take", songStart: null, method: "dressed" },
              }),
            ),
          ],
        }),
      ),
    ).toMatchObject({ ok: false, why: expect.stringContaining("no place on the song") });
    expect(planComposite(facts({ assets: [] }))).toMatchObject({
      ok: false,
      why: expect.stringContaining("no plate yet"),
    });
    expect(
      planComposite(facts({ items: [item(dressed("long", { durationSeconds: 61 }))] })),
    ).toMatchObject({ ok: false, why: expect.stringContaining("60 s") });
  });

  it("a scene still with its own people is animated, never a background to put him over", () => {
    const empty = plate("empty", "Oak Street", { createdAt: "2026-10-17T03:28:00Z" });
    const cast = plate("cast", "Oak Street", {
      path: "worlds/scene_oak_street_cast.png",
      createdAt: "2026-10-17T03:40:00Z",
      plate: { kind: "still", sceneTitle: "Oak Street", shotLabel: "scene_oak_street", usable: true, cast: true },
    });
    expect(platesOfScene([empty, cast], "Oak Street").map((p) => p.id)).toEqual(["empty"]);
    expect(stillsOfScene([empty, cast], "Oak Street").map((p) => p.id)).toEqual(["cast", "empty"]);
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

describe("where the moving plate starts (v3)", () => {
  const withDress = (dress: Record<string, unknown>) =>
    dressed("d", { derivedFrom: { assetId: "take", songStart: 99.46, sourceWindow: [98.6, 102.6], method: "dressed", dress: dress as never } });

  it("is the dressed cut's head handle: the shot's first frame, not the cut's", () => {
    expect(plateOffsetSeconds(withDress({ handles: { head: 1.156, tail: 1.374 } }))).toBe(1.156);
  });

  it("falls back to the shot window against the cut window, and to 0 when the record says nothing", () => {
    expect(plateOffsetSeconds(withDress({ window: [70.32, 74.32], shotWindow: [71.4762, 72.9462] }))).toBeCloseTo(1.1562, 4);
    expect(plateOffsetSeconds(withDress({ handles: { head: 0, tail: 0 }, window: [70, 74], shotWindow: [70, 72] }))).toBe(0);
    expect(plateOffsetSeconds(withDress({}))).toBe(0);
    expect(plateOffsetSeconds(dressed("d"))).toBe(0);
    expect(plateOffsetSeconds(withDress({ handles: { head: Number.NaN, tail: 1 } }))).toBe(0);
  });

  it("is on the plan", () => {
    const r = planComposite({ items: [item(withDress({ handles: { head: 0.5, tail: 0.75 } }))], assets: [plate("p", "Scene")], sceneName: "Scene", placeAssetId: null, performance: true });
    expect(r.ok && r.plan.plateOffsetSeconds).toBe(0.5);
  });
});
