/**
 * A restaged clip held against its take, as the director sees it in the full-screen shot view.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { TakeCheck } from "@/lib/storyboard/takeCheck";
import type { BoxMediaItem, MediaAsset } from "@/lib/storyboard/media";
import { TakeCheckPanel } from "./TakeCheck";
import { StoryboardProvider, type StoryboardController } from "./useStoryboardController";

vi.mock("./FrameThumb", () => ({ FrameThumb: ({ seconds, testId, fileKey }: { seconds: number; testId?: string; fileKey: string }) => <i data-testid={testId} data-seconds={seconds} data-file={fileKey} /> }));

const check = (over: Partial<TakeCheck> = {}): TakeCheck => ({
  version: 1,
  measuredAt: "2026-10-04T00:00:00Z",
  frames: 97,
  faceFrames: 60,
  faceFrom: 0,
  faceTo: 2.46,
  takeFrames: 96,
  takeFaceFrames: 96,
  lip: { verdict: "in_sync", best: { corr: 0.71, retime: 1, offset: 0.021, n: 58 }, onClock: 0.69, worstLag: 0.021, compared: 2.4 },
  framing: { verdict: "wider", takeReach: 6.1, openingReach: 13.8, widestReach: 14.2, widestAt: 0.08, ratio: 2.33, openingSeen: true },
  series: { take: [], clip: [] },
  ...over,
});
function asset(over: Partial<MediaAsset> = {}): MediaAsset {
  return { id: "clip1", assetType: "generated_clip", footageRole: "performance", bucket: "project-clips", path: "u/p/clip1.mp4", playback: null, name: "clip1.mp4", mime: "video/mp4", isVideo: true, isImage: false, durationSeconds: 4.04, shotId: null, sourceTool: "higgsfield", providerJobId: null, createdAt: "2026-10-03T20:43:04Z", ...over };
}
const TAKE = asset({ id: "take1", assetType: "raw_footage", path: "u/p/take.mp4", name: "take.mp4", durationSeconds: 190 });
const item = (a: MediaAsset): BoxMediaItem => ({ asset: a, kind: "video", role: "performance", selected: true, base: false, assignmentId: "a1", sourceIn: 0, sourceOut: 3.92, leadIn: 0, note: null }) as unknown as BoxMediaItem;

function sb(over: Partial<StoryboardController>): StoryboardController {
  return { aspect: "9:16", urlFor: (a: MediaAsset) => `https://signed/${a.id}.mp4`, takeOf: () => ({ take: TAKE, window: [155.99, 159.99] }), checkAgainstTake: vi.fn(async () => undefined), checkingOf: () => null, ...over } as unknown as StoryboardController;
}
const show = (c: StoryboardController, a: MediaAsset) =>
  render(
    <StoryboardProvider value={c}>
      <TakeCheckPanel item={item(a)} />
    </StoryboardProvider>,
  );

describe("a restaged clip held against its take", () => {
  it("says both things a restaging is asked to keep, with the numbers, and shows the take beside the clip", () => {
    const c = sb({});
    show(c, asset({ takeCheck: check() }));
    const panel = screen.getByTestId("take-check");
    expect([panel.getAttribute("data-state"), panel.getAttribute("data-lip"), panel.getAttribute("data-framing")]).toEqual(["checked", "in_sync", "wider"]);
    const lip = screen.getByTestId("take-check-lip");
    expect(lip.textContent).toContain("lips in sync");
    expect(lip.textContent).toContain("His mouth moves with the take's — +0.02 s (1 frame late) at its worst (agreement 0.71 over 2.4 s).");
    expect(lip.textContent).toContain("His face is found in 60 of 97 frames (to 2.46 s) — nothing is said about the rest.");
    expect([lip.getAttribute("data-lag"), lip.getAttribute("data-corr"), lip.getAttribute("data-on-clock")]).toEqual(["0.021", "0.71", "0.69"]);
    const framing = screen.getByTestId("take-check-framing");
    expect(framing.textContent).toContain("shows more of him");
    expect(framing.textContent).toContain("the take's frame reaches 6.1 eye-widths below his eyes; this clip reaches 14.2 at its widest (0.08 s), 13.8 at its opening: 2.33× as far.");
    // the take at the start of the stretch, the clip where his face is first found
    expect(screen.getAllByTestId("take-check-frame").map((f) => [f.getAttribute("data-file"), Number(f.getAttribute("data-seconds"))])).toEqual([
      ["project-clips:u/p/take.mp4", 156.04],
      ["project-clips:u/p/clip1.mp4", 0.05],
    ]);
    expect(screen.getByTestId("take-check-note").textContent).toContain("WHEN his mouth moves, not its shape");
    // it is not run again by itself
    expect(c.checkAgainstTake).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("take-check-run"));
    expect(c.checkAgainstTake).toHaveBeenCalledTimes(1);
  });

  it("shows the widest moment as a third frame when it is not the opening", () => {
    show(sb({}), asset({ takeCheck: check({ framing: { verdict: "wider", takeReach: 6.1, openingReach: 6.3, widestReach: 9.4, widestAt: 2.2, ratio: 1.54, openingSeen: true } }) }));
    expect(screen.getAllByTestId("take-check-frame").map((f) => Number(f.getAttribute("data-seconds")))).toEqual([156.04, 0.05, 2.2]);
  });

  it("before it is checked, says what it measures and waits to be pressed", () => {
    const c = sb({});
    show(c, asset());
    expect(screen.getByTestId("take-check").getAttribute("data-state")).toBe("unchecked");
    expect(screen.getByTestId("take-check").textContent).toContain("Not checked yet");
    expect(c.checkAgainstTake).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("take-check-run"));
    expect(c.checkAgainstTake).toHaveBeenCalledTimes(1);
  });

  it("says what it is doing while it runs, and cannot be pressed twice", () => {
    show(sb({ checkingOf: () => "reading his face in the take…" }), asset());
    expect(screen.getByTestId("take-check-stage").textContent).toContain("reading his face in the take…");
    expect(screen.queryByTestId("take-check-run")).toBeNull();
  });

  it("is not shown for a clip that was not made from a take", () => {
    const { container } = show(sb({ takeOf: () => null }), asset({ takeCheck: check() }));
    expect(container.querySelector('[data-testid="take-check"]')).toBeNull();
  });
});
