import { describe, expect, it } from "vitest";
import {
  emptySequence,
  type EditClip,
} from "../../../supabase/functions/edit-render/model";
import { clipAtTime, songTimeAt, sourceTimeAt, stepFrame } from "./playback";

function clip(partial: Partial<EditClip> & Pick<EditClip, "id" | "name">): EditClip {
  return {
    track: "V1",
    order: 0,
    shotId: null,
    shotKey: null,
    assetId: null,
    fileName: null,
    sourceIn: 0.5,
    sourceOut: 2.5,
    timelineIn: 1,
    timelineOut: 3,
    speed: 1,
    transition: "cut",
    transitionSeconds: 0,
    labelColor: null,
    placeholder: false,
    comment: "",
    enabled: true,
    mediaDuration: 5,
    mouth: "camera",
    ...partial,
  };
}

describe("playback timing", () => {
  it("maps timeline to source and applies song offset once", () => {
    const seq = emptySequence({ projectId: "p", name: "t" });
    seq.songOffset = 13.791667;
    seq.clips = [clip({ id: "1", name: "a" })];
    expect(clipAtTime(seq, 0.5)).toBeNull();
    expect(clipAtTime(seq, 1.5)?.id).toBe("1");
    expect(sourceTimeAt(seq.clips[0]!, 1.5)).toBeCloseTo(1.0, 5);
    expect(songTimeAt(seq, 1.5)).toBeCloseTo(15.291667, 5);
  });

  it("steps one frame", () => {
    expect(stepFrame(1, 24, 1)).toBeCloseTo(1 + 1 / 24, 5);
    expect(stepFrame(1, 24, -1)).toBeCloseTo(1 - 1 / 24, 5);
  });
});
