import { describe, expect, it } from "vitest";
import { continuousPrompt, continuousSeconds, continuousSongStart, FACE_TO_CAMERA, NOBODY_PERFORMS, COLD_HOUR } from "./continuousPrompt";
import { NO_FEET, WAIST_UP } from "./montagePrompt";
import { planContinuous } from "../montage-shot/plan";

const shot = { id: "s1", key: "c033", start: 58.06, end: 59.54, variationId: "v1", events: [] };
const take = { id: "t1", bucket: "project-clips", path: "u/p/t.mp4", seconds: 4, shows: null, sync: { offsetSeconds: 56.9098, driftPpm: 0 } };
const plate = { id: "p1", bucket: "project-references", path: "u/p/worlds/plate_showroom.png", shotLabel: null, sceneTitle: "The showroom" };

describe("one continuous take", () => {
  it("asks for one unbroken shot with one named move, moving from first frame to last, waist-up, face to camera", () => {
    const p = continuousPrompt({ seconds: 10, camera: "a slow push-in", action: "He delivers the line at the island", endMotion: "the camera drifting right", withHim: true });
    expect(p).toMatch(/One continuous take, 10 seconds: a single unbroken shot — no cuts/);
    expect(p).toContain("The camera move, the only one: a slow push-in.");
    expect(p).toMatch(/already moving on the first frame/);
    expect(p).toContain(WAIST_UP);
    expect(p).toContain(NO_FEET);
    expect(p).toContain(FACE_TO_CAMERA);
    expect(p).toContain("On the last frames: the camera drifting right — still moving on the very last frame");
    expect(p).toContain(COLD_HOUR);
    expect(p).not.toMatch(/HARD CUT|montage|in sync with @Video1/);
    expect(p).not.toContain("The environment is still");
  });

  it("a shot without him names the pictures after the place and asks nobody to perform", () => {
    const p = continuousPrompt({ seconds: 8, camera: "a whip pan right", action: "The showroom blurs into the platform", endMotion: "still panning right", withHim: false, images: [{ as: "the Red Line platform it lands on" }] });
    expect(p).toContain("@Image2 is the Red Line platform it lands on.");
    expect(p).toContain(NOBODY_PERFORMS);
    expect(p).not.toContain("@Video1");
    expect(p).not.toContain(FACE_TO_CAMERA);
  });

  it("asks for the longest the brief wants, inside the model's range, and centres the shot on the song", () => {
    expect(continuousSeconds(undefined)).toBe(10);
    expect(continuousSeconds(3)).toBe(5);
    expect(continuousSeconds(40)).toBe(15);
    expect(continuousSongStart(58.06, 59.54, 10)).toBe(53.8);
    expect(continuousSongStart(1, 2, 10)).toBe(0);
  });

  it("plans a take in sync from his dressed take, billed for its input seconds too, and a clip without him", () => {
    const withHim = planContinuous({ projectId: "pr", userId: "u", aspect: "9:16", shot, take, plate, camera: "a slow push-in", action: "He raps at the island", endMotion: "drifting right" });
    expect(withHim.ok).toBe(true);
    if (!withHim.ok) return;
    const s = withHim.plan.payload.settings as Record<string, unknown>;
    expect(withHim.plan.body).toMatchObject({ duration: 10, mode: "reference_to_video", aspectRatio: "9:16" });
    expect(s).toMatchObject({ route: "seedance_ref", kind: "angle", sourceAssetId: "t1", masterStart: 53.8, alternate: true, batchShotId: "c033_continuous" });
    expect((s.variant as { version: string }).version).toMatch(/^continuous-v1/);
    expect(withHim.plan.scenes).toEqual([]);
    const without = planContinuous({ projectId: "pr", userId: "u", aspect: "9:16", shot, take: null, plate, camera: "a macro push-in", action: "Ice catching light", endMotion: "light sweeping left", seconds: 8, images: [{ bucket: "wardrobe-refs", path: "j.jpg", as: "the jacket" }] });
    expect(without.ok).toBe(true);
    if (!without.ok) return;
    const w = without.plan.payload.settings as Record<string, unknown>;
    expect(w.sourceAssetId).toBeUndefined();
    expect(w.kind).toBe("world");
    expect(w.extraImages).toEqual([{ bucket: "wardrobe-refs", path: "j.jpg" }]);
    expect(without.plan.estimateUsd).toBeLessThan(withHim.plan.estimateUsd);
  });

  it("refuses a take without words for its move, action or end", () => {
    const r = planContinuous({ projectId: "pr", userId: "u", aspect: "9:16", shot, take, plate, camera: " ", action: "x", endMotion: "y" });
    expect(r).toMatchObject({ ok: false, error: "missing_camera" });
  });
});
