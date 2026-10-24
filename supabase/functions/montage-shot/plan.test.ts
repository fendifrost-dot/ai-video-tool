import { describe, expect, it } from "vitest";
import { clipAspect, planBrollMontage, planMontage, picturesAfterPlace, wornPieces, type MontageInput } from "./plan.ts";
import {
  montagePrompt,
  planMontageScenes,
  seedanceAnglePrompt,
  restageKeep,
  montageRecord,
  footwearLine,
  NO_FEET,
  castLine,
  brollMontagePrompt,
  planShotMontageScenes,
  planBeatLockedScenes,
  DEFAULT_LOOK_SUFFIX,
} from "../_shared/montagePrompt.ts";

/** c042 on 16 Oct 2026: the Mastic corner shot (73.8–75.28 s) and its dressed take (first frame at 73.5268 s, 4.004 s long). */
function c042(over: Partial<MontageInput> = {}): MontageInput {
  return {
    projectId: "764a63d2-93cd-44f3-905f-292f14ab2f51",
    userId: "3ca10935-8c3d-4479-9a0c-8bfe8050840c",
    aspect: "9:16",
    shot: {
      id: "928ff526-26d3-44cd-b9c9-299590524b9a",
      key: "c042",
      start: 73.8,
      end: 75.28,
      variationId: "358363e6",
      events: [],
      madeFrom: {
        treatment: "6826:kyok8p",
        sceneWrittenAt: "2026-10-15T03:43:41.979Z",
        shotUpdatedAt: null,
      },
    },
    take: {
      id: "6eea726d-a243-478a-8f4e-09f5b5665b77",
      bucket: "project-clips",
      path: "u/p/c07c8dc6/generated_higgsfield_71ff19f4-094.mp4",
      seconds: 4.003866,
      shows: null,
      sync: { offsetSeconds: 73.5268, driftPpm: 0 },
    },
    plate: {
      id: "0fe81de8-543b-40f7-9414-13a54537dd12",
      bucket: "project-references",
      path: "u/p/worlds/plate_redline_orcas_mvb5otjm_2.png",
      shotLabel: "plate_redline_orcas",
      sceneTitle: "Chicago, the corner",
    },
    ...over,
  };
}

const LINES = [
  "0-1.4 s: the orcas surface outside the window; he is not in it",
  "HARD CUT to him in profile by the window, rapping",
  "HARD CUT to a tight shot of one orca's eye",
  "3.2-4.0 s: HARD CUT to a low angle from the seats",
].join("\n");

describe("the montage request from the database's facts", () => {
  it("is the browser's request: the whole dressed take as the source, the scene's plate as the place, filed as an alternate on the shot", () => {
    const r = planMontage(c042({ lines: LINES }));
    if (!r.ok) throw new Error(r.detail);
    const p = r.plan;
    expect(p.seconds).toBe(4);
    expect(p.songStart).toBe(73.527);
    expect(p.lead).toBe(0.273);
    expect(p.estimateUsd).toBe(2.219);
    expect(p.thing).toBeNull();
    const scenes = planMontageScenes(LINES, 4);
    if (!scenes.ok) throw new Error(scenes.why);
    expect(p.scenes).toEqual(scenes.scenes);
    expect(p.prompt).toBe(
      seedanceAnglePrompt(montagePrompt(scenes.scenes), restageKeep({ shows: null })),
    );
    expect(p.body).toEqual({
      promptText: p.prompt,
      mode: "reference_to_video",
      modelVariant: "seedance-2.5-reference",
      duration: 4,
      resolution: "720p",
      aspectRatio: "9:16",
      generate_audio: false,
      avt_user_id: "3ca10935-8c3d-4479-9a0c-8bfe8050840c",
      avt_project_id: "764a63d2-93cd-44f3-905f-292f14ab2f51",
    });
    expect(p.body).not.toHaveProperty("referenceVideoUrls");
    const s = p.payload.settings as Record<string, unknown>;
    expect(p.payload.shotId).toBe("928ff526-26d3-44cd-b9c9-299590524b9a");
    expect(p.payload.referenceImagePath).toBe("u/p/worlds/plate_redline_orcas_mvb5otjm_2.png");
    expect(s.batchRun).toBe("storyboard");
    expect(s.batchShotId).toBe("c042_montage");
    expect(s.route).toBe("seedance_ref");
    expect(s.kind).toBe("angle");
    expect(s.alternate).toBe(true);
    expect(s.sourceAssetId).toBe("6eea726d-a243-478a-8f4e-09f5b5665b77");
    expect(s.sourcePath).toBe("u/p/c07c8dc6/generated_higgsfield_71ff19f4-094.mp4");
    expect(s.sourceWindow).toEqual([0, 4]);
    expect(s.sourceSeconds).toBe(4);
    expect(s.masterStart).toBe(73.527);
    expect(s.lookPreset).toBe("film_bar_v1");
    expect(s.variant).toEqual(montageRecord(scenes.scenes, null));
    expect(s.madeFrom).toEqual({
      treatment: "6826:kyok8p",
      sceneWrittenAt: "2026-10-15T03:43:41.979Z",
      shotUpdatedAt: null,
    });
  });

  it("the dialog's prefill when no lines are given, naming the thing in the plate", () => {
    const r = planMontage(
      c042({ plate: { ...c042().plate, shotLabel: "plate_79th_lafayette_bear_edge" } }),
    );
    if (!r.ok) throw new Error(r.detail);
    expect(r.plan.thing).toBe("the polar bear");
    expect(r.plan.scenes).toHaveLength(4);
    expect(r.plan.scenes[0].text).toMatch(/^the place: a wide shot with the polar bear in it/);
    expect(r.plan.scenes[3].text).toMatch(/the polar bear behind his shoulder/);
    expect(r.plan.prompt).toMatch(/HARD CUT to him in profile/);
    expect(r.plan.prompt).not.toMatch(/rapping straight to camera/);
  });

  it("the light goes in when the shot points at one", () => {
    const r = planMontage(c042({ lines: LINES, light: "sodium streetlight, cold and orange" }));
    if (!r.ok) throw new Error(r.detail);
    expect(r.plan.prompt).toContain("The light: sodium streetlight, cold and orange");
  });

  it("his shoes go after the place: named in the prompt before the light, recorded, and their picture listed for the I/O half", () => {
    const shoes = {
      id: "5a78f069-ca44-4e51-9320-9dedfeabc6dc",
      bucket: "wardrobe-refs",
      path: "u/a/prada_cream.jpg",
      label: "Prada America's Cup Sneakers - Cream (Raw White)",
      words: "cream soft rubber and silver-grey bike mesh",
    };
    const r = planMontage(c042({ lines: LINES, light: "sodium streetlight", footwear: shoes }));
    if (!r.ok) throw new Error(r.detail);
    const scenes = planMontageScenes(LINES, 4);
    if (!scenes.ok) throw new Error(scenes.why);
    expect(r.plan.prompt).toBe(
      seedanceAnglePrompt(
        [montagePrompt(scenes.scenes), footwearLine(shoes), "The light: sodium streetlight"].join(
          " ",
        ),
        restageKeep({ shows: null }),
      ),
    );
    expect(r.plan.footwear).toEqual(shoes);
    const s = r.plan.payload.settings as Record<string, unknown>;
    expect(s.extraImages).toEqual([{ bucket: "wardrobe-refs", path: "u/a/prada_cream.jpg" }]);
    expect(s.variant).toEqual(montageRecord(scenes.scenes, null, shoes));
    expect(r.plan.body).not.toHaveProperty("referenceImageUrls");
    const none = planMontage(c042({ lines: LINES }));
    if (!none.ok) throw new Error(none.detail);
    expect(none.plan.footwear).toBeNull();
    expect(none.plan.prompt).not.toContain("@Image2");
    expect(none.plan.payload.settings as Record<string, unknown>).not.toHaveProperty("extraImages");
  });

  it("the pieces he wears: the shot's own, else by its outfit mode", () => {
    expect(wornPieces({ wardrobe: { garments: ["a", "b"] } }, "YSL_JACKET")).toEqual({
      ids: ["a", "b"],
    });
    expect(wornPieces({ wardrobe: { garments: [] } }, "YSL_JACKET")).toEqual({
      outfitKey: "YSL_JACKET",
    });
    expect(wornPieces({}, "YSL_JACKET")).toEqual({ outfitKey: "YSL_JACKET" });
    expect(wornPieces({ wardrobe: { outfitMode: "none" } }, "YSL_JACKET")).toEqual({ none: true });
    expect(
      wornPieces(
        { wardrobe: { outfitMode: "exception", outfitKey: "YSL_BUBBLE_BUCKET" } },
        "YSL_JACKET",
      ),
    ).toEqual({ outfitKey: "YSL_BUBBLE_BUCKET" });
    expect(wornPieces({ wardrobe: { outfitMode: "exception" } }, "YSL_JACKET")).toEqual({
      none: true,
    });
    expect(wornPieces({}, null)).toEqual({ none: true });
  });

  it("refuses what the browser refuses, before any money moves", () => {
    const events = planMontage(c042({ shot: { ...c042().shot, events: [{ id: "e1" }] } }));
    expect(events.ok).toBe(false);
    if (!events.ok) expect(events.error).toBe("shot_has_timed_events");
    const partial = planMontage(
      c042({ take: { ...c042().take, sync: { offsetSeconds: 74.2, driftPpm: 0 } } }),
    );
    expect(partial.ok).toBe(false);
    if (!partial.ok) expect(partial.error).toBe("take_starts_after_shot");
    const short = planMontage(c042({ take: { ...c042().take, seconds: 1.2 } }));
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.error).toBe("take_ends_before_shot");
    const late = planMontage(
      c042({ take: { ...c042().take, sync: { offsetSeconds: 70, driftPpm: 0 }, seconds: 4.0 } }),
    );
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error).toBe("take_ends_before_shot");
    const bad = planMontage(c042({ lines: "0-9 s: a window past the end" }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe("scenes_refused");
    const many = planMontage(
      c042({ lines: Array.from({ length: 9 }, (_, i) => `scene ${i}`).join("\n") }),
    );
    expect(many.ok).toBe(false);
  });

  it("the frame is the project's, 4:5 going to the nearest the model has", () => {
    expect(clipAspect("9:16")).toBe("9:16");
    expect(clipAspect("16:9")).toBe("16:9");
    expect(clipAspect("1:1")).toBe("1:1");
    expect(clipAspect("4:5")).toBe("3:4");
    expect(clipAspect(null)).toBe("9:16");
  });
});

const SHOES = {
  id: "prada",
  bucket: "wardrobe-refs",
  path: "u/a/prada.jpg",
  label: "Prada America's Cup Sneakers - Cream (Raw White)",
  words: null,
};
const CAST = { id: "17ac4e3a", bucket: "project-references", path: "u/p/worlds/scene_oak_street_boosters_2.png" };

describe("a montage with his mouth still (b-roll with him; Fendi, 23 Oct 2026; 24 Oct: the same performance minus the lips)", () => {
  it("keeps the scenes, the place and the performance copy, drops only the lip sync, and records mouth: still", () => {
    const r = planMontage(c042({ lines: LINES, mouth: "still" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const same = planMontage(c042({ lines: LINES }));
    if (!same.ok) throw new Error(same.detail);
    expect(r.plan.scenes).toEqual(same.plan.scenes);
    expect(r.plan.prompt).toContain("No lip sync and no lip movement: his lips stay closed and he never mouths the words");
    expect(r.plan.prompt).toContain("Re-shoot the exact same performance from a second camera");
    expect(r.plan.prompt).not.toContain("not a timeline to copy");
    expect(r.plan.prompt).not.toMatch(/mouth movements|rapping to camera|word for word/);
    expect(r.plan.prompt).toContain("in sync with @Video1");   // the performance is copied, only the lips are not
    expect(r.plan.prompt).toContain("never frozen, stiff or blank");
    expect(r.plan.prompt).toContain("Place him inside the environment of @Image1");
    expect(((r.plan.payload.settings as Record<string, unknown>).variant as Record<string, unknown>).mouth).toBe("still");
    expect("mouth" in ((same.plan.payload.settings as Record<string, unknown>).variant as Record<string, unknown>)).toBe(false);
    expect(same.plan.prompt).toContain("mouth movements are exactly @Video1's");
  });
});

describe("the people of the scene, and no shots of his feet (17 Oct 2026)", () => {
  it("every montage asks for no shot of his shoes or feet", () => {
    const r = planMontage(c042({ lines: LINES }));
    if (!r.ok) throw new Error(r.detail);
    expect(r.plan.prompt).toContain(NO_FEET);
  });

  it("the cast still goes after the place and the shoes, named by its number, and is recorded", () => {
    const r = planMontage(c042({ lines: LINES, footwear: SHOES, cast: CAST }));
    if (!r.ok) throw new Error(r.detail);
    expect(r.plan.prompt).toContain(castLine(3));
    expect(r.plan.prompt.indexOf(footwearLine(SHOES))).toBeLessThan(r.plan.prompt.indexOf(castLine(3)));
    const settings = r.plan.payload.settings as Record<string, unknown>;
    expect(settings.extraImages).toEqual([
      { bucket: "wardrobe-refs", path: "u/a/prada.jpg" },
      { bucket: "project-references", path: CAST.path },
    ]);
    expect((settings.variant as Record<string, unknown>).cast).toEqual({ id: CAST.id });
  });

  it("a cast still that is the place is not sent twice: its people are @Image1's", () => {
    expect(picturesAfterPlace({ id: CAST.id }, null, CAST)).toEqual({ extra: [], castImage: 1 });
    expect(picturesAfterPlace({ id: "plate" }, null, CAST)).toEqual({
      extra: [{ bucket: "project-references", path: CAST.path }],
      castImage: 2,
    });
  });
});

describe("a montage of a shot he is not in (b-roll)", () => {
  const c002 = () => {
    const base = c042();
    return {
      projectId: base.projectId,
      userId: base.userId,
      aspect: "9:16",
      shot: { ...base.shot, key: "c002", start: 1.5, end: 2.98 },
      plate: {
        id: CAST.id,
        bucket: "project-references",
        path: CAST.path,
        shotLabel: "scene_oak_street_boosters",
        sceneTitle: "Oak Street, the chase",
      },
      cast: CAST,
    };
  };
  const BOOSTERS = "the doors burst open\nHARD CUT to a guard slipping\nHARD CUT to a hanger in the gutter";

  it("sends no take: the place and its people only, 4 s rendered, the lines in the shot's own seconds", () => {
    const r = planBrollMontage({ ...c002(), lines: BOOSTERS });
    if (!r.ok) throw new Error(r.detail);
    const p = r.plan;
    expect(p.seconds).toBe(4);
    expect(p.songStart).toBe(1.5);
    expect(p.lead).toBe(0);
    const scenes = planBeatLockedScenes(BOOSTERS, { renderSeconds: 4, shotIn: 0, shotOut: 1.48, beats: [] });
    if (!scenes || !scenes.ok) throw new Error("not planned");
    expect(p.scenes).toEqual(scenes.scenes);
    expect(p.prompt).toBe(`${brollMontagePrompt(scenes.scenes, 1)} ${DEFAULT_LOOK_SUFFIX}`);
    expect(p.prompt).not.toMatch(/@Video1/);
    expect(p.estimateUsd).toBe(1.849);
    expect(p.body).not.toHaveProperty("referenceVideoUrls");
    const settings = p.payload.settings as Record<string, unknown>;
    // never a take in sync: filed as a clip of the shot, unselected, at the shot's start
    expect(settings).not.toHaveProperty("sourceAssetId");
    expect(settings.alternate).toBe(true);
    expect(settings.masterStart).toBe(1.5);
    expect(settings).not.toHaveProperty("extraImages");
    expect(settings.variant).toEqual(
      montageRecord(scenes.scenes, null, null, { cast: CAST, broll: true, cutOn: { beats: 0, cuts: 2 } }),
    );
  });

  it("refuses with no lines (there is no prefill for a place without him) and refuses timed events", () => {
    const none = planBrollMontage({ ...c002(), lines: " " });
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error).toBe("lines_required");
    const timed = planBrollMontage({ ...c002(), lines: BOOSTERS, shot: { ...c002().shot, events: [{}] } });
    expect(!timed.ok && timed.error).toBe("shot_has_timed_events");
  });
});

describe("cut to the song: the montage's lines are cut on the song's beats", () => {
  it("a performance montage: the beats move onto the dressed take's clock and the cuts fall inside the shot", () => {
    // c042 plays 0.273–1.753 s of its dressed take (first frame at song 73.5268); 122 BPM beats on the song clock
    const beats = Array.from({ length: 12 }, (_, k) => 73.0 + k * 0.4918);
    const r = planMontage(c042({ lines: "the orcas\nhim in profile\nthe orca's eye", beats }));
    if (!r.ok) throw new Error(r.detail);
    const s = r.plan.scenes;
    expect(s[0].from).toBe(0);
    expect(s[2].to).toBe(4);
    expect(s[1].from).toBeGreaterThan(0.273);
    expect(s[2].from).toBeLessThan(1.753);
    const settings = r.plan.payload.settings as Record<string, unknown>;
    const cutOn = (settings.variant as Record<string, unknown>).cutOn as { beats: number; cuts: number };
    expect(cutOn.cuts).toBe(2);
    expect(cutOn.beats).toBeGreaterThanOrEqual(1);
  });

  it("lines with their own seconds are kept as written", () => {
    const r = planMontage(c042({ lines: LINES, beats: [73.6, 74.1] }));
    if (!r.ok) throw new Error(r.detail);
    const scenes = planMontageScenes(LINES, 4);
    if (!scenes.ok) throw new Error(scenes.why);
    expect(r.plan.scenes).toEqual(scenes.scenes);
  });
});

