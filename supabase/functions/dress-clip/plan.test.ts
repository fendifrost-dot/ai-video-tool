import { describe, expect, it } from "vitest";
import { pieceOf, planDressClip, wearerOf, type DressClipInput } from "./plan.ts";
import { buildDressPrompt, dressReferences } from "../_shared/dressWords.ts";

const SHOES = pieceOf({
  id: "a4eaa2da-5e2a-4d31-b625-90a0aef0091f",
  label: "Prada America's Cup Sneakers - Black Patent Leather",
  feature_type: "wardrobe_footwear",
  storage_path: "u/a/prada_SLD.jpg",
  dimensions_description: "Black patent leather and black technical mesh low-top lace-up sneaker",
  reference_images: [
    { storage_path: "u/a/prada_SLD.jpg", angle: "front" },
    { storage_path: "u/a/prada_SLQ.jpg", angle: "back three-quarter" },
  ],
});

/** c041's orca-way montage (16 Oct, 19:57 UTC): 4.0417 s on the song at 71.174 s. */
function c041(over: Partial<DressClipInput> = {}): DressClipInput {
  return {
    projectId: "764a63d2-93cd-44f3-905f-292f14ab2f51",
    clip: {
      id: "8b58017d-8ff4-4a05-9dbf-dedb480378a0",
      bucket: "project-clips",
      path: "u/p/3b41dd27/generated_higgsfield_b0322850-7c8.mp4",
      seconds: 4.041667,
      method: "montage",
      sync: { id: "sync1", offsetSeconds: 71.1741, driftPpm: 0 },
    },
    shot: { id: "3e33cc6e-01a1-4edc-ba15-b5f80458333c", key: "c041", variationId: "358363e6" },
    pieces: [SHOES],
    ...over,
  };
}

describe("swapping pieces on a clip already on the board", () => {
  it("the whole clip is the source, only the shoes are named, and it is filed as the montage it was", () => {
    const r = planDressClip(c041());
    if (!r.ok) throw new Error(r.detail);
    const p = r.plan;
    expect(p.references.map((x) => x.path)).toEqual(["u/a/prada_SLD.jpg", "u/a/prada_SLQ.jpg"]);
    expect(p.prompt).toBe(buildDressPrompt([SHOES], dressReferences([SHOES]).sent));
    expect(p.prompt).toMatch(/^Replace ONLY the man's shoes/);
    expect(p.billedSeconds).toBe(5);
    expect(p.estimateUsd).toBeCloseTo(3.405, 6);
    expect(p.body).toEqual({
      mode: "video_to_video",
      modelVariant: "genjutsu-object-swap",
      resolution: "720p",
      promptText: p.prompt,
      duration: 5,
      avt_project_id: "764a63d2-93cd-44f3-905f-292f14ab2f51",
    });
    const s = p.payload.settings as Record<string, unknown>;
    expect(s.route).toBe("genjutsu_swap");
    expect(s.sourceAssetId).toBe("8b58017d-8ff4-4a05-9dbf-dedb480378a0");
    expect(s.batchShotId).toBe("c041_swap");
    expect(p.payload.shotId).toBe("3e33cc6e-01a1-4edc-ba15-b5f80458333c");
    expect(p.record).toMatchObject({
      sourceAssetId: "8b58017d-8ff4-4a05-9dbf-dedb480378a0",
      window: [0, 4.0417],
      sourceSeconds: 4.0417,
      songStart: 71.1741,
      shotId: "3e33cc6e-01a1-4edc-ba15-b5f80458333c",
      sourceMethod: "montage",
      swapped: ["a4eaa2da-5e2a-4d31-b625-90a0aef0091f"],
    });
  });

  it("refuses before any money moves", () => {
    const none = planDressClip(c041({ pieces: [] }));
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error).toBe("no_pieces");
    const nopic = planDressClip(c041({ pieces: [{ ...SHOES, storagePath: null, images: [] }] }));
    expect(nopic.ok).toBe(false);
    if (!nopic.ok) expect(nopic.error).toBe("no_pictures");
    const short = planDressClip(c041({ clip: { ...c041().clip, seconds: 3.2 } }));
    expect(short.ok).toBe(false);
    const long = planDressClip(c041({ clip: { ...c041().clip, seconds: 31 } }));
    expect(long.ok).toBe(false);
  });

  it("a wardrobe row as a piece: its pictures with their angles, else its one photo as the front", () => {
    expect(SHOES.images).toEqual([
      { storagePath: "u/a/prada_SLD.jpg", angle: "front" },
      { storagePath: "u/a/prada_SLQ.jpg", angle: "back three-quarter" },
    ]);
    const bare = pieceOf({
      id: "x",
      label: " Lewis ",
      feature_type: "wardrobe_footwear",
      storage_path: "u/a/l.jpg",
    });
    expect(bare).toEqual({
      id: "x",
      label: "Lewis",
      featureType: "wardrobe_footwear",
      storagePath: "u/a/l.jpg",
      images: [{ storagePath: "u/a/l.jpg", angle: "front" }],
      construction: null,
    });
  });

  it("names him by the coat he keeps on, so a bystander's shoes are not the ones changed", () => {
    const coat = pieceOf({
      id: "coat",
      label: "Coat in Bubbled Lambskin - Noir",
      feature_type: "wardrobe_outerwear",
      storage_path: "u/a/coat.jpg",
    });
    const hat = pieceOf({
      id: "hat",
      label: "YSL nylon bucket hat",
      feature_type: "wardrobe_accessory",
      storage_path: "u/a/hat.jpg",
    });
    expect(wearerOf([hat, coat, SHOES], [SHOES])).toBe("Coat in Bubbled Lambskin - Noir");
    expect(wearerOf([hat, SHOES], [SHOES])).toBe("YSL nylon bucket hat");
    expect(wearerOf([SHOES], [SHOES])).toBeNull();
    const r = planDressClip(c041({ worn: [coat, hat, SHOES] }));
    if (!r.ok) throw new Error(r.detail);
    expect(r.plan.prompt).toMatch(
      /^Replace ONLY the shoes of the man wearing the Coat in Bubbled Lambskin - Noir/,
    );
    expect(r.plan.prompt).toContain("Only he changes");
    expect(r.plan.record.wearer).toBe("Coat in Bubbled Lambskin - Noir");
  });

  it("a region only: the browser's enlarged crop is the source, the box and the window are recorded", () => {
    const crop = {
      path: "u/p/swap-crops/c044_crop.mp4",
      seconds: 4.0417,
      rect: { x: 0.3, y: 0.45, w: 0.4, h: 0.4 },
      window: [3.3, 4.04] as [number, number],
    };
    const r = planDressClip(c041({ crop }));
    if (!r.ok) throw new Error(r.detail);
    const s = r.plan.payload.settings as Record<string, unknown>;
    expect(s.sourcePath).toBe("u/p/swap-crops/c044_crop.mp4");
    expect(s.batchShotId).toBe("c041_swap_crop");
    expect(r.plan.record).toMatchObject({
      sourceAssetId: "8b58017d-8ff4-4a05-9dbf-dedb480378a0",
      sourcePath: "u/p/swap-crops/c044_crop.mp4",
      crop: {
        path: crop.path,
        rect: crop.rect,
        window: [3.3, 4.04],
        clipPath: "u/p/3b41dd27/generated_higgsfield_b0322850-7c8.mp4",
      },
    });
    const short = planDressClip(c041({ crop: { ...crop, seconds: 3.5 } }));
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.error).toBe("crop_length_differs");
    const out = planDressClip(c041({ crop: { ...crop, rect: { x: 0.8, y: 0, w: 0.4, h: 0.5 } } }));
    expect(out.ok).toBe(false);
  });
});
