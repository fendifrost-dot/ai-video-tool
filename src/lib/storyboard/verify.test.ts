import { describe, expect, it } from "vitest";
import { parseShotSpec } from "@/lib/treatment/shotSpec";
import { boxFromRow, boxWrite, type BoxRow, type StoryboardBox } from "./boxes";
import { buildTimeline, type Assignment, type MediaAsset, type TakeSync, type TimelineSegment } from "./media";
import { verifyCut } from "./verify";

/**
 * A YSL-shaped cut: the take starts 0.8538 s after the song and ends before the song does, one shot carries an AI
 * clip, one an AI image, the last has nothing. The check has to pass on it as built — and fail, on the right line,
 * for each way a cut can be wrong.
 */
const AT = "2026-10-03T12:00:00.000Z";
const OFFSET = 0.8538;
const TAKE_SECONDS = 21.4;

const box = (id: string, key: string, start: number, end: number): StoryboardBox => {
  const spec = parseShotSpec({ id: key, purpose: `scene ${key}`, shotType: "b_roll", kind: "broll", timeline: { start, end } });
  const w = boxWrite({ key, start, end, section: "verse", generated: spec, override: null, locked: false, origin: "treatment", history: [] });
  return boxFromRow({ id, project_id: "p1", shot_number: 1, ...w, updated_at: AT } as BoxRow)!;
};
const asset = (id: string, over: Partial<MediaAsset> = {}): MediaAsset => ({
  id, assetType: "generated_clip", footageRole: null, bucket: "project-clips", path: `u/p/${id}.mp4`, playback: null, name: `${id}.mp4`, mime: "video/mp4", isVideo: true, isImage: false,
  durationSeconds: 5, shotId: null, sourceTool: null, providerJobId: null, createdAt: AT, ...over,
});
const assign = (id: string, shotId: string, assetId: string, role: Assignment["role"], over: Partial<Assignment> = {}): Assignment => ({
  id, projectId: "p1", shotId, assetId, role, sourceIn: role === "performance" ? null : 0, sourceOut: null, isPrimary: true, sortOrder: 1, notes: null, createdAt: AT, updatedAt: AT, ...over,
});
const sync: TakeSync = { id: "s1", projectId: "p1", songAssetId: "song", performanceAssetId: "take", offsetSeconds: OFFSET, driftPpm: 0, status: "manual", method: "manual", confidence: {}, notes: null } as unknown as TakeSync;

const boxes = [box("r1", "c001", 0, 4), box("r2", "c002", 4, 8), box("r3", "c003", 8, 12), box("r4", "c004", 12, 16), box("r5", "c005", 16, 20), box("r6", "c006", 20, 24), box("r7", "c007", 24, 28)];
const assets = new Map<string, MediaAsset>([
  ["take", asset("take", { footageRole: "performance", assetType: "reference_video", durationSeconds: TAKE_SECONDS })],
  ["clip", asset("clip", { durationSeconds: 5 })],
  ["still", asset("still", { assetType: "generated_still", isVideo: false, isImage: true, mime: "image/png", durationSeconds: null })],
]);
const assignments = [assign("a1", "r3", "clip", "generated_clip"), assign("a2", "r4", "still", "generated_image")];
const fileSeconds = new Map([["take", TAKE_SECONDS], ["clip", 5]]);
const build = () => buildTimeline({ boxes, assignments, assets, syncs: [sync] });
const run = (timeline: TimelineSegment[], over: Partial<Parameters<typeof verifyCut>[0]> = {}) => verifyCut({ timeline, boxes, assignments, assets, syncs: [sync], fileSeconds, songSeconds: 28, ...over });
const check = (r: ReturnType<typeof verifyCut>, id: string) => r.checks.find((c) => c.id === id)!;
const video = (s: TimelineSegment) => s.media as Extract<TimelineSegment["media"], { kind: "video" }>;

describe("checking a cut without playing it", () => {
  it("passes the cut as the app builds it, and says what it looked at", () => {
    const r = run(build());
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.samples).toBe(280);
    expect(check(r, "selected").detail).toBe("2 with footage selected, 4 on the synced take, 1 empty");
    expect(check(r, "resume").detail).toBe("1 return to the take checked"); // after the AI clip and the AI image
    expect(check(r, "hold").detail).toBe("first frame held in 1 shot, last frame held in 1");
    expect(check(r, "sync").detail).toMatch(/moments on a take, furthest 0(\.\d)? ms from the song clock/);
  });

  it("lists every cut: the shot, what it shows, and the part of the file it plays", () => {
    const r = run(build());
    expect(r.cuts.map((c) => [c.key, c.shows, c.assetName])).toEqual([
      ["c001", "take", "take.mp4"],
      ["c002", "take", "take.mp4"],
      ["c003", "ai clip", "clip.mp4"],
      ["c004", "ai image", "still.mp4"],
      ["c005", "take", "take.mp4"],
      ["c006", "take", "take.mp4"],
      ["c007", "nothing", null],
    ]);
    expect(r.cuts[1].sourceIn).toBeCloseTo(4 - OFFSET, 3);
    expect(r.cuts[4].sourceIn).toBeCloseTo(16 - OFFSET, 3);
    // the take starts 0.85 s into shot 1 and ends 1.75 s before shot 6 does
    expect(r.cuts[0].holdsFirstFrame).toBeCloseTo(0.9, 1);
    expect(r.cuts[5].holdsLastFrame).toBeGreaterThan(1.5);
    expect(r.cuts[5].holdsLastFrame).toBeLessThan(2);
  });

  it("catches a take that has been slid: every moment of that shot is off the song clock", () => {
    const t = build();
    t[4] = { ...t[4], media: { ...video(t[4]), sourceIn: video(t[4]).sourceIn + 0.5 } };
    const r = run(t);
    expect(check(r, "sync").ok).toBe(false);
    expect(check(r, "sync").failures[0]).toMatch(/^c005 at 0:16\.00: the take should be at 15\.146 s; the player has it at 15\.646 s/);
    expect(check(r, "resume").ok).toBe(false);
    expect(check(r, "cuts").ok).toBe(true);
  });

  it("catches a take started at the top of its shot instead of holding until the recording begins", () => {
    const t = build();
    t[0] = { ...t[0], media: { ...video(t[0]), leadIn: 0 } };
    const r = run(t);
    expect(check(r, "hold").ok).toBe(false);
    expect(check(r, "hold").failures[0]).toMatch(/c001 at 0:00\.00: the take has not started yet \(it starts 0\.85 s later\) and should hold its first frame/);
  });

  it("catches a shot playing something other than what its record selects", () => {
    const t = build();
    t[2] = { ...t[2], media: { ...t[1].media } };
    const r = run(t);
    expect(check(r, "selected").ok).toBe(false);
    expect(check(r, "selected").failures[0]).toBe("c003: its record selects clip.mp4, the player has take.mp4");
  });

  it("catches generated footage on a shot it is not assigned to", () => {
    const t = build();
    t[1] = { ...t[1], media: { ...t[2].media } };
    const r = run(t);
    expect(check(r, "slots").failures).toEqual(["c002 shows clip.mp4, which is not assigned to it"]);
    expect(check(r, "selected").ok).toBe(false);
  });

  it("catches a cut that lands off its shot's window", () => {
    const t = build();
    t[3] = { ...t[3], start: 12.6 };
    const r = run(t);
    expect(check(r, "cuts").ok).toBe(false);
    expect(check(r, "cuts").failures[0]).toMatch(/at 0:12\.00 the player is on c003; the shot whose window holds that moment is c004/);
  });

  it("catches shots that leave a gap or overlap on the song", () => {
    const gappy = [...boxes.slice(0, 2), box("r3", "c003", 8.5, 12), ...boxes.slice(3)];
    const r = verifyCut({ timeline: buildTimeline({ boxes: gappy, assignments, assets, syncs: [sync] }), boxes: gappy, assignments, assets, syncs: [sync], fileSeconds, songSeconds: 28 });
    expect(check(r, "tiles").failures).toEqual(["0.50 s with no shot between c002 and c003"]);
  });

  it("holds a clip that is shorter than its shot rather than asking the file for more than it has", () => {
    const shortAssets = new Map(assets).set("clip", asset("clip", { durationSeconds: 2.5 }));
    const timeline = buildTimeline({ boxes, assignments, assets: shortAssets, syncs: [sync] });
    const r = verifyCut({ timeline, boxes, assignments, assets: shortAssets, syncs: [sync], fileSeconds: new Map(fileSeconds).set("clip", 2.5), songSeconds: 28 });
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.cuts[2].holdsLastFrame).toBeGreaterThan(1.3);
  });

  it("uses the files' real lengths, and says so when a file is shorter than its record", () => {
    const shorter = new Map(fileSeconds).set("take", 18);
    const r = run(build(), { fileSeconds: shorter });
    expect(check(r, "lengths").failures).toEqual(["take.mp4: its record says 21.40 s, the file is 18.00 s"]);
    // the player still does the right thing with the file it really has: it holds, it never restarts
    expect(check(r, "hold").ok).toBe(true);
    expect(check(r, "order").ok).toBe(true);
    // 18 s of take ends at song 18.85: shot 5 (16–20) holds its last frame for the rest of the shot
    expect(r.cuts[4].holdsLastFrame).toBeGreaterThan(1);
  });

  it("a take without a confirmed sync is not something the cut can play in time", () => {
    const measured: TakeSync = { ...sync, status: "auto" };
    const explicit = [assign("a9", "r1", "take", "performance")];
    const timeline = buildTimeline({ boxes, assignments: explicit, assets, syncs: [measured] });
    const r = verifyCut({ timeline, boxes, assignments: explicit, assets, syncs: [measured], fileSeconds, songSeconds: 28 });
    // nothing plays out of sync: the unsynced take is not given a range at all
    expect(r.cuts[0].sourceIn === null || r.cuts[0].sourceIn === 0).toBe(true);
    expect(check(r, "cuts").ok).toBe(true);
  });
});
