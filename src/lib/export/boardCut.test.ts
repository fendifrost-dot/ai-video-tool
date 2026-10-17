import { describe, expect, it } from "vitest";
import type { MediaAsset, TimelineSegment } from "@/lib/storyboard/media";
import { boardCutCsv, boardCutEdl, boardCutRows } from "./boardCut";

const asset = (id: string, path: string, durationSeconds: number) =>
  ({
    id,
    path,
    name: path.split("/").pop(),
    durationSeconds,
    isVideo: true,
  }) as unknown as MediaAsset;
const assets = new Map(
  [asset("e1", "u/p/clips/E1_continuous.mp4", 10.04), asset("img", "u/p/still.png", 0)].map((a) => [
    a.id,
    a,
  ]),
);
const seg = (over: Partial<TimelineSegment>): TimelineSegment =>
  ({
    shotId: "s",
    key: "c033",
    index: 33,
    start: 58.06,
    end: 59.54,
    section: null,
    media: { kind: "none" },
    scene: "",
    note: null,
    events: [],
    ...over,
  }) as TimelineSegment;
const LINES = [
  {
    lineIndex: 40,
    section: "v",
    text: "Laugh cause we did it",
    start: 58.02,
    end: 58.8,
    confidence: 1,
    words: [],
  },
  {
    lineIndex: 41,
    section: "v",
    text: "what im whippin cost a home",
    start: 58.8,
    end: 59.68,
    confidence: 1,
    words: [],
  },
];

describe("the board's cut for Premiere", () => {
  const timeline = [
    seg({
      media: {
        kind: "video",
        assetId: "e1",
        role: "performance",
        sourceIn: 4.135,
        sourceOut: 5.615,
        leadIn: 0,
        base: false,
        slip: -0.125,
      },
    }),
    seg({
      key: "c034",
      index: 34,
      start: 59.54,
      end: 61.01,
      media: { kind: "image", assetId: "img", role: "generated_image", base: false },
    }),
  ];
  const rows = boardCutRows({ timeline, assets, lines: LINES });

  it("carries each shot's in-point inside its clip, its place on the song, the slip and the lyric flag", () => {
    expect(rows[0]).toMatchObject({
      key: "c033",
      clip: { assetId: "e1", file: "E1_continuous.mp4" },
      sourceIn: 4.135,
      sourceOut: 5.615,
      recordIn: 58.06,
      recordOut: 59.54,
      slip: -0.125,
      fit: "extend_shot",
      lyricWindow: { start: 58.02, end: 59.68 },
    });
    expect(rows[1]).toMatchObject({ key: "c034", clip: null, note: "a still, not in the EDL" });
  });

  it("writes a CMX3600 event per clip, record timecode on the song clock, source and record the same length", () => {
    const edl = boardCutEdl(rows, { title: "YSL\nIce On" });
    const lines = edl.split("\n");
    expect(lines[0]).toBe("TITLE: YSL Ice On");
    expect(lines[1]).toBe("FCM: NON-DROP FRAME");
    // 4.135 s → frame 99, 58.06 s → 1393, 59.54 s → 1429 at 24 fps: 36 frames each side
    expect(edl).toContain(
      "001  AX       V     C        00:00:04:03 00:00:05:15 00:00:58:01 00:00:59:13",
    );
    expect(edl).toContain("* FROM CLIP NAME: E1_continuous.mp4");
    expect(edl).toMatch(
      /\* SHOT c033 \(33\) SONG 00:00:58:01-00:00:59:13 SLIP -0\.125S LYRIC EXTEND_SHOT/,
    );
    expect(edl).not.toContain("still.png");
  });

  it("writes the same rows as a CSV, quoting what needs it", () => {
    const csv = boardCutCsv(rows).split("\n");
    expect(csv[0]).toBe(
      "shot,number,song_in,song_out,clip_file,source_in_s,source_out_s,source_in_tc,source_out_tc,record_in_tc,record_out_tc,slip_s,lyric_window,lyric_fit,note",
    );
    expect(csv[1]).toMatch(
      /^c033,33,58\.06,59\.54,E1_continuous\.mp4,4\.135,5\.615,00:00:04:03,00:00:05:15,00:00:58:01,00:00:59:13,-0\.125,58\.02-59\.68,extend_shot,/,
    );
    expect(csv[2]).toMatch(/^c034,34,59\.54,61\.01,,,,,,,,0,/);
  });
});
