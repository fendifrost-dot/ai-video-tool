/**
 * WHAT REVIEW PLAYS = WHAT EXPORT RENDERS.
 *
 * The contract is held, frame by frame, against the player's own functions: for every output frame, what the
 * contract says is on screen (read from the contract alone, as a renderer reads it) is what Review shows at that
 * frame's song time. The same contract is the fixture the renderer's own tests execute (scripts/render/tests).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { parseShotSpec, type ShotEvent } from "@/lib/treatment/shotSpec";
import { boxFromRow, boxWrite, type BoxRow } from "./boxes";
import { buildTimeline, type Assignment, type MediaAsset, type TakeSync } from "./media";
import { contractFrameAt, DEFAULT_RENDER_FPS, renderContract, renderReadiness, reviewFrameAt, type RenderContract } from "./renderContract";

const AT = "2026-10-03T00:00:00Z";
const ev = (over: Partial<ShotEvent> & { at: number }): ShotEvent => ({ id: "", trigger: { kind: "time", ref: "" }, visual: "", camera: "", lighting: "", action: "", lightingState: null, effect: null, ...over });
function asset(id: string, over: Partial<MediaAsset> = {}): MediaAsset {
  return { id, assetType: "generated_clip", footageRole: null, bucket: "project-clips", path: `u/p/${id}.mp4`, playback: null, name: `${id}.mp4`, mime: "video/mp4", isVideo: true, isImage: false, durationSeconds: 5, shotId: null, sourceTool: null, providerJobId: null, createdAt: AT, ...over };
}
function box(id: string, key: string, start: number, end: number, over: { shotType?: "performance" | "b_roll"; events?: ShotEvent[]; transition?: string } = {}) {
  const shotType = over.shotType ?? "b_roll";
  const spec = parseShotSpec({ id: key, purpose: `scene ${key}`, shotType, kind: shotType === "performance" ? "performance" : "broll", timeline: { start, end }, events: over.events ?? [], ...(over.transition ? { transitionIn: { type: "crossfade", preset: over.transition } } : {}) });
  const w = boxWrite({ key, start, end, section: "hook", generated: spec, override: null, locked: false, origin: "treatment", history: [] });
  return boxFromRow({ id, project_id: "p1", shot_number: 1, ...w, updated_at: AT } as BoxRow)!;
}
const assign = (id: string, shotId: string, assetId: string, role: Assignment["role"]): Assignment => ({ id, projectId: "p1", shotId, assetId, role, sourceIn: null, sourceOut: null, isPrimary: true, sortOrder: 1, notes: null, createdAt: AT, updatedAt: AT });

/**
 * A small cut with every case a renderer meets: a take that starts after the song does (its first frame holds), a
 * generated clip with the edit's effects on it, a held image that fades out, a clip shorter than its shot (its last
 * frame holds), and a shot with nothing on it.
 */
const take = asset("take1", { assetType: "reference_video", footageRole: "performance", bucket: "project-references", durationSeconds: 8, path: "u/p/take1.mp4" });
const assets = new Map<string, MediaAsset>([take, asset("clip1"), asset("still1", { isVideo: false, isImage: true, mime: "image/png", durationSeconds: null, bucket: "project-references", path: "u/p/still1.png" }), asset("clip2", { durationSeconds: 1.2 })].map((a) => [a.id, a]));
const boxes = [
  box("r1", "c001", 0, 4, { shotType: "performance" }),
  box("r2", "c002", 4, 8, {
    transition: "crossfade_1",
    events: [
      ev({ id: "e1", at: 1, lighting: "the lights die", effect: { type: "blackout", seconds: null, level: null } }),
      ev({ id: "e2", at: 2.5, camera: "a slow push begins" }),
      ev({ id: "e3", at: 3, effect: { type: "flash", seconds: 0.3, level: null } }),
    ],
  }),
  box("r3", "c003", 8, 10, { events: [ev({ id: "e1", at: 1, effect: { type: "fade_out", seconds: null, level: null } })] }),
  box("r4", "c004", 10, 12),
  box("r5", "c005", 12, 13),
];
const sync: TakeSync = { id: "s1", projectId: "p1", songAssetId: "song", performanceAssetId: "take1", offsetSeconds: 0.8538, driftPpm: 0, method: "manual", status: "confirmed" };
const timeline = buildTimeline({
  boxes,
  assignments: [assign("a2", "r2", "clip1", "generated_clip"), assign("a3", "r3", "still1", "generated_image"), assign("a4", "r4", "clip2", "generated_clip")],
  assets,
  syncs: [sync],
});
const song = { assetId: "song", bucket: "project-audio", path: "u/p/song.wav" };
const FIXTURE = resolve(__dirname, "../../../scripts/render/tests/fixtures/contract_small.json");

describe("the render contract is what Review plays", () => {
  const contract = renderContract({ timeline, assets, song, fps: 10 });

  it("covers the cut in whole frames, gapless, each shot naming its record", () => {
    expect(contract).toMatchObject({ version: 2, clock: "song", fps: 10, range: { song_in: 0, song_out: 13 }, frames: 130, duration_seconds: 13 });
    expect(contract.segments.map((s) => [s.key, s.shot_id, s.frame_in, s.frame_out, s.media.kind])).toEqual([
      ["c001", "r1", 0, 40, "video"],
      ["c002", "r2", 40, 80, "video"],
      ["c003", "r3", 80, 100, "image"],
      ["c004", "r4", 100, 120, "video"],
      ["c005", "r5", 120, 130, "none"], // nothing was put on it and the take does not reach it
    ]);
    expect(contract.audio).toEqual({ asset_id: "song", bucket: "project-audio", path: "u/p/song.wav", song_in: 0 });
  });

  it("says, in frames, what the player does: hold the first picture, play, hold the last", () => {
    // the take starts 0.8538 s after the song: 9 frames (0.0–0.8) hold its first picture, then it runs
    expect(contract.segments[0].media).toMatchObject({ lead_in: 0.8538, source_in: 0, frames: { lead: 9, play: 31, tail: 0, source_first: 0.0462 } });
    expect(contract.segments[1].media).toMatchObject({ source_in: 0, source_out: 4, frames: { lead: 0, play: 40, tail: 0, source_first: 0 } });
    // a 1.2 s clip in a 2 s shot: its last picture holds for the rest
    const short = contract.segments[3].media;
    expect(short.kind === "video" && short.frames.lead).toBe(0);
    expect(short.kind === "video" && short.frames.play + short.frames.tail).toBe(20);
    expect(short.kind === "video" && short.frames.tail).toBeGreaterThanOrEqual(7);
  });

  it("carries the edit's effects as keys AND as the evaluated picture of every frame", () => {
    const fx = contract.segments[1];
    expect(fx.effects.map((e) => [e.type, e.song_time, e.seconds])).toEqual([
      ["blackout", 5, 0.25],
      ["flash", 7, 0.3],
    ]);
    // frames 40–49 are as filmed (no run); the blackout lands over frames 50–52 and holds; the flash is laid over it
    expect(fx.picture_runs[0]).toEqual({ frame_in: 51, frame_out: 52, brightness: 0.64, contrast: 1.24, flash: 0 });
    expect(fx.picture_runs.find((r) => r.frame_in <= 60 && r.frame_out > 60)).toMatchObject({ brightness: 0.1, contrast: 1.6, flash: 0 });
    expect(fx.picture_runs.find((r) => r.frame_in === 70)).toMatchObject({ brightness: 0.1, contrast: 1.6, flash: 1 });
    expect(fx.picture_runs[fx.picture_runs.length - 1].frame_out).toBe(80);
    // the held image fades to black and stays black
    const fade = contract.segments[2].picture_runs;
    expect(fade[fade.length - 1]).toMatchObject({ frame_out: 100, brightness: 0, flash: 0 });
    // a shot with no effect has no runs at all
    expect(contract.segments[0].picture_runs).toEqual([]);
  });

  it("keeps apart what a render does and what it does not", () => {
    // direction that has to be in the footage is carried, never drawn
    // (the blackout's own words name the effect; that change is the edit's, in picture_runs — not direction)
    expect(contract.segments[1].direction.map((d) => [d.song_time, d.lighting || d.camera])).toEqual([[6.5, "a slow push begins"]]);
    // a declared transition is carried as declared — and plays as the cut Review plays
    expect(contract.segments[1].transition_in).toEqual({ declared: "crossfade_1", realized: "cut" });
    expect(contract.segments[0].transition_in.realized).toBe("cut");
  });

  it("EVERY frame: what the contract says is what Review shows", () => {
    let checked = 0;
    for (const c of [contract, renderContract({ timeline, assets, song, fps: 24 }), renderContract({ timeline, assets, song })]) {
      for (let n = 0; n < c.frames; n++) {
        const t = c.range.song_in + n / c.fps;
        const review = reviewFrameAt(timeline, assets, t);
        const said = contractFrameAt(c, n);
        const where = `frame ${n} (${t.toFixed(3)} s) at ${c.fps} fps`;
        expect(said.shot_id, where).toBe(review.shot_id);
        expect(said.kind, where).toBe(review.kind);
        expect(said.asset_id, where).toBe(review.asset_id);
        expect(said.picture, where).toEqual(review.picture);
        expect(said.hold === "lead_in", where).toBe(review.hold === "lead_in");
        if (review.source_time == null) expect(said.source_time, where).toBeNull();
        // the same picture of the file, to a tenth of a millisecond
        else expect(Math.abs(said.source_time! - review.source_time), where).toBeLessThan(2e-4);
        checked++;
      }
    }
    expect(checked).toBe(130 + 312 + 13 * DEFAULT_RENDER_FPS);
  });

  it("a section of the cut is the same contract over a stretch of the song", () => {
    const part = renderContract({ timeline, assets, song, fps: 10, range: { songIn: 4, songOut: 10 } });
    expect(part).toMatchObject({ range: { song_in: 4, song_out: 10 }, frames: 60, audio: { song_in: 4 } });
    expect(part.segments.map((s) => [s.key, s.frame_in, s.frame_out])).toEqual([
      ["c002", 0, 40],
      ["c003", 40, 60],
    ]);
    for (let n = 0; n < part.frames; n++) expect(contractFrameAt(part, n).picture).toEqual(reviewFrameAt(timeline, assets, 4 + n / 10).picture);
  });

  it("a shot is on screen until the next one starts — a gap in the board is not a hole in the render", () => {
    const gappy = buildTimeline({ boxes: [box("r1", "c001", 0, 2), box("r2", "c002", 3, 5)], assignments: [assign("a1", "r1", "clip1", "generated_clip"), assign("a2", "r2", "clip1", "generated_clip")], assets, syncs: [] });
    const c = renderContract({ timeline: gappy, assets, song, fps: 10 });
    expect(c.segments.map((s) => [s.song_in, s.song_out, s.frame_in, s.frame_out])).toEqual([
      [0, 3, 0, 30],
      [3, 5, 30, 50],
    ]);
    for (let n = 0; n < c.frames; n++) expect(contractFrameAt(c, n).shot_id).toBe(reviewFrameAt(gappy, assets, n / 10).shot_id);
  });

  it("says whether it is a finished video, and what it will and will not contain", () => {
    const r = renderReadiness(contract);
    // one shot has nothing on it: that is said, and it is the only thing in the way
    expect(r.ready).toBe(false);
    expect(r.blockers).toEqual(["shot 5 has nothing on it — a render would show black there"]);
    expect(renderReadiness(renderContract({ timeline, assets, song, fps: 10, range: { songIn: 0, songOut: 12 } })).ready).toBe(true);
    expect(r.notes).toEqual([
      "shot 3 is a held image",
      "shots 1, 4 hold a frame where their footage does not cover the whole shot",
      "the edit's effects are applied on shots 2, 3",
      "1 shot declares a transition; every one plays — and renders — as a cut",
      "shot 2 has timed direction that must already be in the footage — a render adds nothing for it",
    ]);
    // no song, and a shot with nothing at all on it
    const bare = buildTimeline({ boxes: [box("r1", "c001", 0, 2), box("r2", "c002", 2, 4)], assignments: [assign("a1", "r1", "clip1", "generated_clip")], assets, syncs: [] });
    const blocked = renderReadiness(renderContract({ timeline: bare, assets, song: null, fps: 10 }));
    expect(blocked.ready).toBe(false);
    expect(blocked.blockers).toEqual(["the project has no song to render the picture against", "shot 2 has nothing on it — a render would show black there"]);
  });

  it("is the fixture the renderer's own tests execute", () => {
    const text = `${JSON.stringify(contract, null, 1)}\n`;
    if (process.env.UPDATE_RENDER_FIXTURE || !existsSync(FIXTURE)) writeFileSync(FIXTURE, text);
    expect(JSON.parse(readFileSync(FIXTURE, "utf8")) as RenderContract).toEqual(contract);
  });
});
