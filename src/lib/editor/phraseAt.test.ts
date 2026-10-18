import { describe, expect, it } from "vitest";
import { emptySequence, type EditClip, type EditMarker } from "../../../supabase/functions/edit-render/model";
import { loopWindowForPhrase, phraseAtPlayhead } from "./phraseAt";

function marker(over: Partial<EditMarker> & Pick<EditMarker, "id" | "name" | "timeIn">): EditMarker {
  return {
    clipId: null,
    kind: "lyric",
    comment: "",
    timeOut: over.timeIn + 2,
    ...over,
  };
}

function clip(over: Partial<EditClip> & Pick<EditClip, "id" | "name">): EditClip {
  return {
    track: "V1",
    order: 0,
    shotId: null,
    shotKey: null,
    assetId: null,
    fileName: null,
    sourceIn: 0,
    sourceOut: 2,
    timelineIn: 10,
    timelineOut: 12,
    speed: 1,
    transition: "cut",
    transitionSeconds: 0,
    labelColor: null,
    placeholder: false,
    comment: "",
    enabled: true,
    mediaDuration: 5,
    mouth: null,
    ...over,
  };
}

describe("phraseAtPlayhead", () => {
  it("prefers the phrase covering the playhead over the first lyric", () => {
    const seq = emptySequence({ projectId: "p", name: "t" });
    seq.markers = [
      marker({ id: "m1", name: "first", timeIn: 0, timeOut: 2 }),
      marker({ id: "m2", name: "at-head", timeIn: 8, timeOut: 11 }),
      marker({ id: "m3", name: "later", timeIn: 20, timeOut: 22 }),
    ];
    expect(phraseAtPlayhead({ sequence: seq, playhead: 9 })?.id).toBe("m2");
  });

  it("falls back to a phrase overlapping the selected clip", () => {
    const seq = emptySequence({ projectId: "p", name: "t" });
    seq.markers = [
      marker({ id: "m1", name: "first", timeIn: 0, timeOut: 2 }),
      marker({ id: "m2", name: "clip-phrase", timeIn: 10.2, timeOut: 11.5 }),
    ];
    const selected = clip({ id: "c1", name: "shot", timelineIn: 10, timelineOut: 12 });
    // Playhead outside every phrase
    expect(phraseAtPlayhead({ sequence: seq, playhead: 15, selectedClip: selected })?.id).toBe("m2");
  });

  it("builds a loop with pre-roll on the timeline clock (no songOffset subtract)", () => {
    const m = marker({ id: "m", name: "line", timeIn: 10, timeOut: 12 });
    const win = loopWindowForPhrase(m, 60, 0.35);
    expect(win.start).toBeCloseTo(9.65, 5);
    expect(win.end).toBeCloseTo(12, 5);
  });
});
