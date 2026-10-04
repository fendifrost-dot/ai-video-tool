/**
 * A generated clip held against what it was asked for, as the director sees it in the full-screen shot view.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { BeatCheck } from "@/lib/storyboard/beatCheck";
import type { BoxMediaItem, MediaAsset } from "@/lib/storyboard/media";
import { BeatCheckPanel, framesForBeat } from "./BeatCheck";
import { StoryboardProvider, type ClipRequest, type StoryboardController } from "./useStoryboardController";

vi.mock("./FrameThumb", () => ({ FrameThumb: ({ seconds, testId }: { seconds: number; testId?: string }) => <i data-testid={testId} data-seconds={seconds} /> }));

const AT = "2026-10-03T19:00:00Z";
const ASKED = [{ id: "e1", offset: 1.9, kinds: ["lighting"], says: "light: the room goes dark" }];
const change = (begins: number, arrived = begins) => ({ begins, half: begins, arrived, size: 0.12, strength: 14, kind: "light" as const, lumaBefore: 0.3, lumaAfter: 0.08 });
const check = (over: Partial<BeatCheck> = {}): BeatCheck => ({
  version: 4,
  measuredAt: AT,
  frames: 96,
  fps: 24,
  clipSeconds: 4,
  noise: 0.02,
  beats: [{ ...ASKED[0], change: change(2.75, 3.1), error: 0.85, verdict: "displaced" }],
  unasked: [],
  verdict: "displaced",
  series: [],
  ...over,
});
function asset(over: Partial<MediaAsset> = {}): MediaAsset {
  return { id: "clip1", assetType: "generated_clip", footageRole: "performance", bucket: "project-clips", path: "u/p/clip1.mp4", playback: null, name: "clip1.mp4", mime: "video/mp4", isVideo: true, isImage: false, durationSeconds: 4, shotId: null, sourceTool: "higgsfield", providerJobId: null, createdAt: AT, ...over };
}
const item = (a: MediaAsset): BoxMediaItem => ({ asset: a, kind: "video", role: "performance", selected: true, base: false, assignmentId: "a1", sourceIn: 0, sourceOut: 3.92, leadIn: 0, note: null }) as unknown as BoxMediaItem;
const REQUEST: ClipRequest = { mode: "timed_script", asked: ASKED, prompt: "a medium shot… from 1.9 s: light: the room goes dark.", route: "seedance_ref", submittedAt: AT };

function sb(over: Partial<StoryboardController>): StoryboardController {
  return { aspect: "9:16", urlFor: () => "https://signed/clip1.mp4", requestOf: () => REQUEST, measureClip: vi.fn(async () => undefined), measuringOf: () => false, ...over } as unknown as StoryboardController;
}

describe("a clip asked for with timed changes", () => {
  it("says where the change was asked, where it began, by how much it is off — and shows the frames", () => {
    const a = asset({ beatCheck: check() });
    const c = sb({});
    render(
      <StoryboardProvider value={c}>
        <BeatCheckPanel item={item(a)} />
      </StoryboardProvider>,
    );
    const panel = screen.getByTestId("beat-check");
    expect(panel.getAttribute("data-verdict")).toBe("displaced");
    const beat = within(panel).getByTestId("beat-check-beat");
    expect([beat.getAttribute("data-asked"), beat.getAttribute("data-begins"), beat.getAttribute("data-error"), beat.getAttribute("data-verdict")]).toEqual(["1.9", "2.75", "0.85", "displaced"]);
    // "a change": detected and timed, not identified as the change that was asked for
    expect(beat.textContent).toContain("a change, not on time");
    expect(beat.textContent).toContain("asked at 1.90 s — a change of light begins at 2.75 s (+0.85 s), arrived by 3.10 s");
    // frames: before it was asked, where it was asked, where it began, and after it arrived
    expect(within(beat).getAllByTestId("beat-check-frame").map((f) => Number(f.getAttribute("data-seconds")))).toEqual([1.6, 1.95, 2.8, 3.5]);
    // already measured for this script: it is not measured again by itself
    expect(c.measureClip).not.toHaveBeenCalled();
    expect(screen.getByTestId("beat-check-note").textContent).toContain("whether it is the change that was asked for is what the frames are for");
    expect(screen.getByTestId("beat-check-note").textContent).toContain("the light of the whole picture");
  });

  it("is measured the first time it is seen, once", () => {
    const c = sb({});
    const a = asset();
    const { rerender } = render(
      <StoryboardProvider value={c}>
        <BeatCheckPanel item={item(a)} />
      </StoryboardProvider>,
    );
    expect(c.measureClip).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("beat-check").getAttribute("data-verdict")).toBe("unmeasured");
    rerender(
      <StoryboardProvider value={c}>
        <BeatCheckPanel item={item(a)} />
      </StoryboardProvider>,
    );
    expect(c.measureClip).toHaveBeenCalledTimes(1);
  });

  it("a measurement made for another script is not shown as this one's", () => {
    const stale = check({ beats: [{ ...ASKED[0], offset: 1.2, change: change(1.25), error: 0.05, verdict: "on_time" }], verdict: "kept" });
    const c = sb({});
    render(
      <StoryboardProvider value={c}>
        <BeatCheckPanel item={item(asset({ beatCheck: stale }))} />
      </StoryboardProvider>,
    );
    expect(screen.queryByTestId("beat-check-beat")).toBeNull();
    expect(c.measureClip).toHaveBeenCalledTimes(1);
  });

  it("not seen is said as not seen", () => {
    const none = check({ beats: [{ ...ASKED[0], change: null, error: null, verdict: "not_seen" }], verdict: "not_kept" });
    render(
      <StoryboardProvider value={sb({})}>
        <BeatCheckPanel item={item(asset({ beatCheck: none }))} />
      </StoryboardProvider>,
    );
    expect(screen.getByTestId("beat-check-beat").textContent).toContain("no change of the light was found near it");
    expect(screen.getByTestId("beat-check").getAttribute("data-verdict")).toBe("not_kept");
  });
});

describe("a clip whose light changes more times than it was asked to", () => {
  it("is given no timing: it says it cannot tell which change was asked for, and shows every change it could be", () => {
    const opening = { ...change(0.5, 0.625), lumaBefore: 0.03, lumaAfter: 0.12 };
    const ball = { ...change(0.958, 1.125), lumaBefore: 0.12, lumaAfter: 0.17 };
    const unsure = check({ beats: [{ ...ASKED[0], change: null, error: null, verdict: "undetermined", candidates: [opening, ball], askedNear: 1 }], verdict: "undetermined" });
    render(
      <StoryboardProvider value={sb({})}>
        <BeatCheckPanel item={item(asset({ beatCheck: unsure }))} />
      </StoryboardProvider>,
    );
    expect(screen.getByTestId("beat-check").getAttribute("data-verdict")).toBe("undetermined");
    const beat = screen.getByTestId("beat-check-beat");
    expect([beat.getAttribute("data-verdict"), beat.getAttribute("data-error"), beat.getAttribute("data-begins"), beat.getAttribute("data-candidates")]).toEqual(["undetermined", "", "", "0.5,0.958"]);
    expect(beat.textContent).toContain("cannot tell which");
    expect(beat.textContent).toContain("the light changes twice near it (0.50 s to 0.63 s, brighter; 0.96 s to 1.13 s, brighter) and one change was asked for. Which of them is the one asked for cannot be told from the light, so no timing is given");
    // no number that could be read as a timing
    expect(beat.textContent).not.toMatch(/[+−]\d\.\d\d s/);
    expect(within(beat).getAllByTestId("beat-check-frame").map((f) => Number(f.getAttribute("data-seconds")))).toEqual([0.2, 0.725, 1.225, 1.95]);
    expect(screen.getByTestId("beat-check-note").textContent).toContain("Where the light changes more times than it was asked to, no timing is given");
  });
});

describe("a clip asked for as one state", () => {
  const single: ClipRequest = { ...REQUEST, mode: "single", asked: [] };
  it("says nothing when nothing was found", () => {
    const { container } = render(
      <StoryboardProvider value={sb({ requestOf: () => single })}>
        <BeatCheckPanel item={item(asset({ beatCheck: check({ beats: [], verdict: "kept" }) }))} />
      </StoryboardProvider>,
    );
    expect(container.querySelector('[data-testid="beat-check"]')).toBeNull();
  });
  it("says so when the picture jumps and nobody asked it to", () => {
    const c2 = render(
      <StoryboardProvider value={sb({ requestOf: () => single })}>
        <BeatCheckPanel item={item(asset({ beatCheck: check({ beats: [], verdict: "kept", unasked: [change(2.1)] }) }))} />
      </StoryboardProvider>,
    );
    expect(screen.getByTestId("beat-check-unasked").textContent).toBe("the light changes at 2.10 s — nothing in the request asked for a change there");
    expect(c2).toBeDefined();
  });
  it("footage the app did not generate is not measured", () => {
    const c = sb({ requestOf: () => null });
    const { container } = render(
      <StoryboardProvider value={c}>
        <BeatCheckPanel item={item(asset())} />
      </StoryboardProvider>,
    );
    expect(container.innerHTML).toBe("");
    expect(c.measureClip).not.toHaveBeenCalled();
  });
});

describe("the frames worth looking at for a beat", () => {
  it("are before, at, and after — and where it changed when that is somewhere else", () => {
    expect(framesForBeat({ ...ASKED[0], change: change(1.95), error: 0.05, verdict: "on_time" }, 4).map((f) => [f.label, f.t])).toEqual([
      ["before", 1.6],
      ["asked", 1.95],
      ["after", 2.35],
    ]);
    // a change that came EARLY: "before" is before the change, not before the asking (by then it had happened)
    expect(framesForBeat({ ...ASKED[0], offset: 4.69, change: change(3.667, 3.708), error: -1.023, verdict: "displaced" }, 6.04).map((f) => [f.label, f.t])).toEqual([
      ["before", 3.367],
      ["changes", 3.717],
      ["asked", 4.74],
      ["after", 5.09],
    ]);
    // a beat near the end stays inside the clip
    expect(framesForBeat({ ...ASKED[0], offset: 3.8, change: null, error: null, verdict: "not_seen" }, 4).every((f) => f.t <= 3.95)).toBe(true);
  });
});
