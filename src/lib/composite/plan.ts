/**
 * Step 6 of the workflow, planned: which take is cut out, which plate he goes over, what it costs. Pure — it is
 * handed what the storyboard already holds and decides; nothing is fetched or spent here.
 *
 * The take is a DRESSED take on the shot (dress.ts): the composite is of the shot's window with the scene's outfit on
 * him, not of the whole recording. The plate is a realism still of the scene's place (world-still-proxy, filed
 * under worlds/plate_*) — the newest usable one of that scene — or, failing that, the location's approved picture.
 */
import type { BoxMediaItem, MediaAsset } from "@/lib/storyboard/media";
import { matteEstimateUsd, matteFrames, matteSourceCheck } from "./matteRequest";
import { RECIPE } from "./pixels";

export type CompositePlan = {
  /** The dressed take to cut out. */
  dressed: MediaAsset;
  /** The picture he goes over. */
  plate: MediaAsset;
  /** The other plates of the scene this could have used (newest first), for the record. */
  otherPlates: MediaAsset[];
  /** How the plate was chosen. */
  plateFrom: "scene" | "location";
  seconds: number;
  frames: number;
  /** The paid part: the matte. The composite itself is made in the browser for nothing. */
  cost: { usd: number; upper: number; text: string };
  /** The song time of the dressed take's first frame — the composite's own, since it keeps every frame. */
  songStart: number;
  recipe: typeof RECIPE;
};

export type CompositeFacts = {
  items: readonly BoxMediaItem[];
  assets: readonly MediaAsset[];
  /** The scene the shot is in, by name (the plates carry the scene's title). */
  sceneName: string | null;
  /** The shot's location's approved picture, when it has one. */
  placeAssetId: string | null;
  performance: boolean;
};

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
const newestFirst = (a: MediaAsset, b: MediaAsset) =>
  (b.createdAt ?? "").localeCompare(a.createdAt ?? "");

/** The dressed takes on a shot that could be composited: not rejected, the selected one first, then the newest. */
export function compositableTakes(items: readonly BoxMediaItem[]): MediaAsset[] {
  return items
    .filter(
      (i) =>
        i.role === "performance" &&
        i.kind === "video" &&
        i.asset.derivedFrom?.method === "dressed" &&
        i.asset.approvalStatus !== "rejected",
    )
    .sort((a, b) =>
      a.selected === b.selected ? newestFirst(a.asset, b.asset) : a.selected ? -1 : 1,
    )
    .map((i) => i.asset);
}

/** The plates of a scene, newest first — the realism stills filed for it under worlds/, usable ones only. */
export function platesOfScene(
  assets: readonly MediaAsset[],
  sceneName: string | null,
): MediaAsset[] {
  return assets
    .filter((a) => a.isImage && a.plate && a.plate.usable && same(a.plate.sceneTitle, sceneName))
    .sort(newestFirst);
}

export function planComposite(
  f: CompositeFacts,
): { ok: true; plan: CompositePlan } | { ok: false; why: string } {
  if (!f.performance)
    return {
      ok: false,
      why: "only a performance shot is composited: it is his real take over the place",
    };
  const takes = compositableTakes(f.items);
  const dressed = takes[0];
  if (!dressed)
    return { ok: false, why: "this shot has no dressed take to cut out — dress it first (step 5)" };
  const check = matteSourceCheck({ seconds: dressed.durationSeconds, isVideo: dressed.isVideo });
  if (!check.ok) return { ok: false, why: check.why };
  const seconds = dressed.durationSeconds!;
  const songStart = dressed.derivedFrom?.songStart ?? null;
  if (songStart == null)
    return {
      ok: false,
      why: "the dressed take has no place on the song (no song start on its record) — it cannot be filed in sync",
    };
  const plates = platesOfScene(f.assets, f.sceneName);
  let plate = plates[0] ?? null;
  let plateFrom: CompositePlan["plateFrom"] = "scene";
  if (!plate && f.placeAssetId) {
    const place = f.assets.find((a) => a.id === f.placeAssetId && a.isImage) ?? null;
    if (place) {
      plate = place;
      plateFrom = "location";
    }
  }
  if (!plate)
    return {
      ok: false,
      why: f.sceneName
        ? `“${f.sceneName}” has no plate yet — generate the place first (a realism plate under worlds/, or the location's approved picture)`
        : "this shot's scene has no plate to put him in",
    };
  const frames = matteFrames(seconds, null);
  return {
    ok: true,
    plan: {
      dressed,
      plate,
      otherPlates: plates.slice(1),
      plateFrom,
      seconds,
      frames,
      cost: matteEstimateUsd(frames),
      songStart,
      recipe: RECIPE,
    },
  };
}

/** The composites already on a shot, newest first. */
export function compositesOn(items: readonly BoxMediaItem[]): MediaAsset[] {
  return items
    .filter((i) => i.role === "performance" && i.asset.derivedFrom?.method === "composite")
    .map((i) => i.asset)
    .sort(newestFirst);
}
