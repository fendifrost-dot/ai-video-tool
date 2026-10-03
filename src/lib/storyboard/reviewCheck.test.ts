import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseShotSpec } from "@/lib/treatment/shotSpec";
import { boxFromRow, boxWrite, type BoxRow, type StoryboardBox } from "./boxes";
import { buildTimeline, segmentAt, videoStateAt, type Assignment, type MediaAsset, type TakeSync } from "./media";
import { runReviewCheck, spread, type MediaRefLike, type PlayerHandle, type ReviewCheckInput } from "./reviewCheck";

/**
 * The whole check, on real files: a 3 s take and a 2 s clip (the fixtures of lib/media) cut against a 1.5 s song,
 * fetched by byte range through a stand-in for the storage host.
 */
const AT = "2026-10-03T12:00:00.000Z";
const FIXTURES = resolve(__dirname, "../media/__fixtures__");
const HOST = "https://files.test/storage/v1/object/sign";
const FILES: Record<string, string> = {
  "project-assets/u/p/take.mp4": "tiny_h264_faststart.mp4",
  "project-clips/u/p/clip.mp4": "tiny_h264_moov_last.mp4",
  "project-audio/u/p/song.wav": "tiny.wav",
};

const box = (id: string, key: string, start: number, end: number): StoryboardBox => {
  const spec = parseShotSpec({ id: key, purpose: `scene ${key}`, shotType: "b_roll", kind: "broll", timeline: { start, end } });
  const w = boxWrite({ key, start, end, section: "verse", generated: spec, override: null, locked: false, origin: "treatment", history: [] });
  return boxFromRow({ id, project_id: "p1", shot_number: 1, ...w, updated_at: AT } as BoxRow)!;
};
const asset = (id: string, over: Partial<MediaAsset> = {}): MediaAsset => ({
  id, assetType: "generated_clip", footageRole: null, bucket: "project-clips", path: `u/p/${id}.mp4`, playback: null, name: `${id}.mp4`, mime: "video/mp4", isVideo: true, isImage: false,
  durationSeconds: 2, shotId: null, sourceTool: null, providerJobId: null, createdAt: AT, ...over,
});
const boxes = [box("r1", "c001", 0, 0.5), box("r2", "c002", 0.5, 1), box("r3", "c003", 1, 1.5)];
const assets = new Map<string, MediaAsset>([
  ["take", asset("take", { footageRole: "performance", assetType: "reference_video", bucket: "project-assets", durationSeconds: 3 })],
  ["clip", asset("clip")],
]);
const assignments: Assignment[] = [{ id: "a1", projectId: "p1", shotId: "r2", assetId: "clip", role: "generated_clip", sourceIn: 0, sourceOut: null, isPrimary: true, sortOrder: 1, notes: null, createdAt: AT, updatedAt: AT }];
const sync = { id: "s1", projectId: "p1", songAssetId: "song", performanceAssetId: "take", offsetSeconds: -0.4, driftPpm: 0, status: "manual", method: "manual", confidence: {}, notes: null } as unknown as TakeSync;
const timeline = buildTimeline({ boxes, assignments, assets, syncs: [sync] });
const songRef: MediaRefLike = { bucket: "project-audio", path: "u/p/song.wav" };
const refKey = (r: MediaRefLike) => `${r.bucket}:${r.path}`;
const urlOf = (r: MediaRefLike) => `${HOST}/${r.bucket}/${r.path}?token=t`;

const input = (over: Partial<ReviewCheckInput> = {}): ReviewCheckInput => ({
  timeline,
  boxes,
  assignments,
  assets,
  syncs: [sync],
  song: { ref: songRef, name: "song.wav", analysisSeconds: 1.5 },
  playbackRef: (a) => a.playback ?? { bucket: a.bucket, path: a.path },
  refKey,
  sign: async (refs) => Object.fromEntries(refs.map((r) => [refKey(r), urlOf(r)])),
  player: null,
  ...over,
});

let missing = new Set<string>();
const decoded: { codec: string; bytes: number }[] = [];

beforeEach(() => {
  missing = new Set();
  decoded.length = 0;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const key = decodeURIComponent(new URL(url).pathname).replace("/storage/v1/object/sign/", "");
    const name = FILES[key];
    if (!name || missing.has(key)) return new Response("no", { status: 404 });
    const file = readFileSync(resolve(FIXTURES, name));
    if (init?.method === "HEAD") return new Response(null, { status: 200, headers: { "content-length": String(file.byteLength) } });
    const range = /bytes=(\d+)-(\d+)/.exec(new Headers(init?.headers).get("range") ?? "");
    if (!range) return new Response(file, { status: 200, headers: { "content-length": String(file.byteLength) } });
    const from = Number(range[1]);
    const to = Math.min(Number(range[2]), file.byteLength - 1);
    // like a storage host that does not let the page read Content-Range: the length has to be asked for by itself
    return new Response(file.subarray(from, to + 1), { status: 206, headers: { "content-type": name.endsWith(".wav") ? "audio/wav" : "video/mp4" } });
  });
  class FakeDecoder {
    static isConfigSupported = async () => ({ supported: true });
    private config: VideoDecoderConfig | null = null;
    constructor(private init: VideoDecoderInit) {}
    configure(c: VideoDecoderConfig) {
      this.config = c;
    }
    decode(chunk: { byteLength: number }) {
      decoded.push({ codec: this.config!.codec, bytes: chunk.byteLength });
      this.init.output({ displayWidth: this.config!.codedWidth, displayHeight: this.config!.codedHeight, close: () => undefined } as unknown as VideoFrame);
    }
    async flush() {}
    close() {}
  }
  vi.stubGlobal("VideoDecoder", FakeDecoder);
  vi.stubGlobal("EncodedVideoChunk", class { byteLength: number; constructor(i: { data: Uint8Array }) { this.byteLength = i.data.byteLength; } });
});
afterEach(() => vi.unstubAllGlobals());

describe("spread", () => {
  it("keeps the first and the last and spreads between", () => {
    expect(spread([1, 2, 3], 6)).toEqual([1, 2, 3]);
    expect(spread([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3)).toEqual([0, 5, 10]);
  });
});

describe("checking a cut on its real files", () => {
  it("opens every file, reads its real length, decodes it where the cut enters it, and runs the cut", async () => {
    const said: string[] = [];
    const r = await runReviewCheck(input({ onProgress: (t) => said.push(t) }));
    expect(r.song).toMatchObject({ resolves: true, format: "wav", ok: true });
    expect(r.song!.seconds).toBeCloseTo(1.5, 2);
    expect(r.files.map((f) => [f.name, f.use, f.shots, f.width, f.height, f.seconds, f.ok])).toEqual([
      ["take.mp4", "take", 2, 96, 54, 3, true],
      ["clip.mp4", "ai clip", 1, 54, 96, 2, true],
    ]);
    // the take is entered twice (shots 1 and 3), the clip once: three frames decoded, each with the file's own codec
    expect(r.files[0].decoded.map((d) => d.requested)).toEqual([0.4, 1.4]);
    expect(r.files[1].decoded.map((d) => d.requested)).toEqual([0]);
    expect(decoded).toHaveLength(3);
    expect(decoded.every((d) => d.codec.startsWith("avc1.") && d.bytes > 0)).toBe(true);
    expect(r.files[1].hasAudio).toBe(true);
    expect(r.cut.ok).toBe(true);
    expect(r.cut.cuts.map((c) => c.shows)).toEqual(["take", "ai clip", "take"]);
    expect(r.player.detail).toBe("no player on this page");
    expect(r.live.ran).toBe(false);
    expect(r.ok).toBe(true);
    expect(said[0]).toBe("Opening the files…");
    expect(r.notChecked.join(" ")).toContain("how the picture looks");
  });

  it("fails on a file whose link does not open", async () => {
    missing.add("project-clips/u/p/clip.mp4");
    const r = await runReviewCheck(input());
    expect(r.files[1]).toMatchObject({ resolves: false, status: 404, ok: false, note: "the link answered 404" });
    expect(r.ok).toBe(false);
  });

  it("fails when a record's length is not the file's", async () => {
    const wrong = new Map(assets).set("take", { ...assets.get("take")!, durationSeconds: 21.4 });
    const r = await runReviewCheck(input({ assets: wrong, timeline: buildTimeline({ boxes, assignments, assets: wrong, syncs: [sync] }) }));
    expect(r.cut.checks.find((c) => c.id === "lengths")!.failures).toEqual(["take.mp4: its record says 21.40 s, the file is 3.00 s"]);
    expect(r.ok).toBe(false);
  });

  it("fails when the song is not the length the cut was built on", async () => {
    const r = await runReviewCheck(input({ song: { ref: songRef, name: "song.wav", analysisSeconds: 28 } }));
    expect(r.song!.ok).toBe(false);
    expect(r.song!.note).toBe("the file is 1.50 s; the analysis says 28.00 s");
  });

  describe("with the player on the page", () => {
    const fakePlayer = (srcOf: (id: string) => string, follows = true): PlayerHandle => {
      const videos = new Map<string, HTMLVideoElement>();
      for (const id of ["take", "clip"]) videos.set(id, { currentSrc: srcOf(id), src: srcOf(id), currentTime: 0, seeking: false, readyState: 4 } as unknown as HTMLVideoElement);
      let now = 0;
      const audio = {
        currentSrc: urlOf(songRef),
        src: urlOf(songRef),
        paused: true,
        pause: () => undefined,
        get currentTime() {
          return now;
        },
        // the real player follows the song clock on a seek; this one does the same thing with the same rule
        set currentTime(t: number) {
          now = t;
          const seg = segmentAt(timeline, t);
          if (!follows || !seg || seg.media.kind !== "video") return;
          const state = videoStateAt(seg, t, seg.media.assetId === "take" ? 3 : 2);
          const el = videos.get(seg.media.assetId) as { currentTime: number } | undefined;
          if (state && el) el.currentTime = state.at;
        },
      } as unknown as HTMLAudioElement;
      return { audio, videos };
    };
    const good = (id: string) => urlOf({ bucket: assets.get(id)!.bucket, path: assets.get(id)!.path });

    it("compares the links the player holds, and reads each shot's video back from it", async () => {
      const r = await runReviewCheck(input({ player: fakePlayer(good) }));
      expect(r.player).toMatchObject({ ok: true, detail: "2 video links and the song compared" });
      expect(r.live.ran).toBe(true);
      expect(r.live.samples.length).toBe(6);
      expect(r.live.samples.every((s) => s.ok)).toBe(true);
      expect(r.ok).toBe(true);
    });

    it("says so when the player holds another file's link for a shot", async () => {
      const r = await runReviewCheck(input({ player: fakePlayer((id) => (id === "clip" ? good("take") : good(id))) }));
      expect(r.player.ok).toBe(false);
      expect(r.player.failures).toEqual(["clip.mp4: the player's link points at take.mp4, not at clip.mp4"]);
      expect(r.ok).toBe(false);
    });

    it("asks a player that is showing a section only for that section's files — the cut is still checked whole", async () => {
      // the page's player holds the take's video only (the section it shows has no AI clip in it)
      const sectionPlayer = fakePlayer(good);
      sectionPlayer.videos.delete("clip");
      const section = timeline.filter((s) => s.media.kind === "video" && s.media.assetId === "take");
      expect(section.length).toBeGreaterThan(0);
      const whole = await runReviewCheck(input({ player: sectionPlayer }));
      expect(whole.player.failures).toEqual(["clip.mp4: the player has no video for it"]);
      const scoped = await runReviewCheck(input({ player: sectionPlayer, playerTimeline: section }));
      expect(scoped.player).toMatchObject({ ok: true, detail: "1 video link and the song compared" });
      expect(scoped.player.label).toMatch(/the section it is showing/);
      // every shot of the cut is still in the cut check
      expect(scoped.cut.cuts.length).toBe(timeline.length);
      expect(scoped.live.samples.every((x) => section.some((seg) => seg.key === x.key))).toBe(true);
    });

    it("does not touch the player when the window is not on screen, and says why", async () => {
      const spy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      const r = await runReviewCheck(input({ player: fakePlayer(good) }));
      spy.mockRestore();
      expect(r.window).toBe("not on screen");
      expect(r.live).toMatchObject({ ran: false, ok: true });
      expect(r.notChecked[0]).toMatch(/^frames on the real player: this browser window is not on screen/);
      expect(r.player.ok).toBe(true);
      expect(r.ok).toBe(true);
    });
  });
});
