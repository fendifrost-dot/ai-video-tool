import { describe, expect, it } from "vitest";
import { clipAspect, planMontage, type MontageInput } from "./plan.ts";
import {
  montagePrompt,
  planMontageScenes,
  seedanceAnglePrompt,
  restageKeep,
  montageRecord,
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
