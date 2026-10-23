import { describe, expect, it } from "vitest";
import { continuousPrompt, continuousSeconds, continuousSongStart, lyricsInTake, FACE_TO_CAMERA, NOBODY_PERFORMS, COLD_HOUR } from "./continuousPrompt";
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
    expect((s.variant as { version: string }).version).toMatch(/^continuous-v2/);
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

  it("takes the lyric lines that fall in the take, timed from its first frame", () => {
    const lines = [
      { start_seconds: 53.08, end_seconds: 54.2, text: "Drive like a getaway driver" },
      { start_seconds: 52, end_seconds: 53, text: "before the take" },
      { start_seconds: 56.82, end_seconds: 58, text: "Listen   what they rap bout" },
      { start_seconds: 54.26, end_seconds: 54.8, text: "On the highway" },
      { start_seconds: 63.8, end_seconds: 64.5, text: "after the take" },
    ];
    expect(lyricsInTake(lines, 53.8, 10)).toEqual([
      { at: 0, text: "Drive like a getaway driver" },
      { at: 0.5, text: "On the highway" },
      { at: 3, text: "Listen what they rap bout" },
    ]);
  });

  it("with him he raps the exact words over @Audio1 — nothing says his mouth is fixed afterwards", () => {
    const p = continuousPrompt({ seconds: 10, camera: "a slow push-in", action: "He raps at the island", endMotion: "drifting right", withHim: true, audio: true, lyrics: [{ at: 0.5, text: "On the highway" }, { at: 3, text: 'Listen "what" they rap bout' }] });
    expect(p).toContain("@Audio1 is the song's vocals under this take: he raps along to it, in time with it");
    expect(p).toContain(`these are the exact words, from the first frame: at 0.5 s "On the highway", at 3.0 s "Listen 'what' they rap bout".`);
    expect(p).not.toMatch(/afterwards/);
    const silent = continuousPrompt({ seconds: 10, camera: "a slow push-in", action: "x", endMotion: "y", withHim: true });
    expect(silent).not.toContain("@Audio1");
    expect(silent).toContain("actually rapping on camera");
    const place = continuousPrompt({ seconds: 8, camera: "a whip pan", action: "x", endMotion: "y", withHim: false, audio: true, lyrics: [{ at: 1, text: "On the highway" }] });
    expect(place).not.toMatch(/@Audio1|rapping/);
  });

  it("mouth still: he is in it and never moves his mouth — no words, no @Audio1, nothing about rapping", () => {
    const p = continuousPrompt({ seconds: 5, camera: "a slow push-in", action: "He watches the dice", endMotion: "settling on him", withHim: true, mouth: "still", audio: true, lyrics: [{ at: 0.5, text: "On the highway" }] });
    expect(p).toContain("His mouth stays closed for the whole take");
    expect(p).not.toMatch(/@Audio1|actually rapping|raps along|raps at|exact words|On the highway/);
    expect(p).toContain("@Video1 is the performer");
    const r = planContinuous({ projectId: "pr", userId: "u", aspect: "9:16", shot, take, plate, camera: "a slow push-in", action: "x", endMotion: "y", mouth: "still", lyrics: [{ at: 0.5, text: "On the highway" }], audio: true });
    if (!r.ok) throw new Error("refused");
    expect(r.plan.prompt).not.toMatch(/@Audio1|actually rapping|exact words/);
    expect((r.plan.payload.settings as { variant: Record<string, unknown> }).variant).toMatchObject({ withHim: true, mouth: "still" });
    expect((r.plan.payload.settings as { variant: Record<string, unknown> }).variant.lyrics).toBeUndefined();
  });

  it("a planned take with him records its lyrics and the vocals reference; one without him carries neither", () => {
    const lyrics = [{ at: 0.5, text: "On the highway" }];
    const r = planContinuous({ projectId: "pr", userId: "u", aspect: "9:16", shot, take, plate, camera: "a slow push-in", action: "He raps", endMotion: "right", lyrics, audio: true });
    if (!r.ok) throw new Error("refused");
    expect(r.plan.prompt).toContain('at 0.5 s "On the highway"');
    expect((r.plan.payload.settings as { variant: Record<string, unknown> }).variant).toMatchObject({ lyrics, audio: true });
    const b = planContinuous({ projectId: "pr", userId: "u", aspect: "9:16", shot, take: null, plate, camera: "a whip pan", action: "x", endMotion: "y", lyrics, audio: true });
    if (!b.ok) throw new Error("refused");
    expect(b.plan.prompt).not.toContain("On the highway");
    expect((b.plan.payload.settings as { variant: Record<string, unknown> }).variant.lyrics).toBeUndefined();
  });

  it("keeps his hands low and away from his face — never 'below his chin', which read as hands at the collar", () => {
    expect(FACE_TO_CAMERA).not.toMatch(/below his chin/);
    expect(FACE_TO_CAMERA).toMatch(/hands low and relaxed, away from his face and collar/);
  });

  it("never cuts a long direction: one past the limit is refused, one under it goes in whole", () => {
    const long = `He stands relaxed at the island ${"and keeps rapping ".repeat(40)}and the penguin stands still by the wall`;
    expect(long.length).toBeGreaterThan(600);
    const ok = planContinuous({ projectId: "pr", userId: "u", aspect: "9:16", shot, take, plate, camera: "a slow push-in", action: long, endMotion: "right" });
    if (!ok.ok) throw new Error(ok.detail);
    expect(ok.plan.prompt).toContain("and the penguin stands still by the wall.");
    const tooLong = planContinuous({ projectId: "pr", userId: "u", aspect: "9:16", shot, take, plate, camera: "a slow push-in", action: "x".repeat(1201), endMotion: "right" });
    expect(tooLong).toMatchObject({ ok: false, error: "line_too_long" });
  });
});
