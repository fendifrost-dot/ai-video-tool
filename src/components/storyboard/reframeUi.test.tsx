/**
 * The shot's Frame: set on the shot (the full-screen view's Frame control), and shown where the cut plays with its
 * sound (the sequence player) exactly as the render contract will crop it.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { parseShotSpec } from "@/lib/treatment/shotSpec";
import { boxFromRow, boxWrite, type BoxRow, type StoryboardBox } from "@/lib/storyboard/boxes";
import { boxMedia, type Assignment, type MediaAsset, type TimelineSegment } from "@/lib/storyboard/media";
import { ReframePanel } from "./Reframe";
import { SequencePlayer } from "./SequencePlayer";
import { StoryboardProvider, type StoryboardController } from "./useStoryboardController";

vi.mock("./signedUrls", async (orig) => ({
  ...(await orig<typeof import("./signedUrls")>()),
  useSignedRefs: (refs: { bucket: string; path: string }[]) => Object.fromEntries(refs.map((r) => [`${r.bucket}:${r.path}`, `https://signed/${r.path}`])),
}));

const AT = "2026-10-17T00:00:00Z";
function box(override: Record<string, unknown> | null = null): StoryboardBox {
  const w = boxWrite({ key: "c007", start: 10, end: 14, section: "hook", generated: parseShotSpec({ id: "c007", purpose: "he walks", shotType: "b_roll", kind: "broll", timeline: { start: 10, end: 14 } }), override: null, locked: false, origin: "treatment", history: [] });
  return boxFromRow({ id: "r7", project_id: "p1", shot_number: 7, ...w, override_json: override, updated_at: AT } as BoxRow)!;
}
const clip: MediaAsset = { id: "clip7", assetType: "generated_clip", footageRole: null, bucket: "project-clips", path: "u/p/clip7.mp4", playback: null, name: "clip7.mp4", mime: "video/mp4", isVideo: true, isImage: false, durationSeconds: 4, shotId: null, sourceTool: "higgsfield", providerJobId: null, createdAt: AT };
const still: MediaAsset = { ...clip, id: "still7", path: "u/p/still7.png", name: "still7.png", mime: "image/png", isVideo: false, isImage: true, durationSeconds: null };
const assign: Assignment = { id: "a7", projectId: "p1", shotId: "r7", assetId: "clip7", role: "generated_clip", sourceIn: null, sourceOut: null, isPrimary: true, sortOrder: 1, notes: null, createdAt: AT, updatedAt: AT };

function panel(b: StoryboardBox) {
  const item = boxMedia({ box: b, assignments: [assign], assets: new Map([[clip.id, clip]]), syncs: [] }).showing!;
  const saveReframe = vi.fn(async () => undefined);
  const sb = { aspect: "9:16", urlFor: () => "https://signed/clip7.mp4", saveReframe } as unknown as StoryboardController;
  render(
    <StoryboardProvider value={sb}>
      <ReframePanel box={b} item={item} />
    </StoryboardProvider>,
  );
  return { saveReframe };
}

describe("the shot's Frame control", () => {
  it("starts as filmed; the centre can be moved only once the picture is pushed in; Save stores the punch-in on the shot", () => {
    const b = box();
    const { saveReframe } = panel(b);
    expect(screen.getByTestId("reframe-zoom-value").textContent).toBe("1.00×");
    expect(screen.queryByTestId("reframe-save")).toBeNull();
    expect(screen.queryByTestId("reframe-reset")).toBeNull();
    expect((screen.getByTestId("reframe-y") as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("reframe-zoom"), { target: { value: "1.5" } });
    expect((screen.getByTestId("reframe-y") as HTMLInputElement).disabled).toBe(false);
    // up, to take the pants out of the bottom of the frame
    fireEvent.change(screen.getByTestId("reframe-y"), { target: { value: "0.3" } });
    fireEvent.click(screen.getByTestId("reframe-save"));
    expect(saveReframe).toHaveBeenCalledWith(b, { scale: 1.5, x: 0.5, y: 0.3 });
  });

  it("shows the saved frame on the picture, and Reset puts the shot back as filmed", () => {
    const b = box({ reframe: { scale: 2, x: 0.5, y: 0.25 } });
    const { saveReframe } = panel(b);
    expect(screen.getByTestId("reframe").getAttribute("data-scale")).toBe("2");
    const video = screen.getByTestId("reframe-picture") as HTMLVideoElement;
    Object.defineProperty(video, "videoWidth", { value: 1080 });
    Object.defineProperty(video, "videoHeight", { value: 1920 });
    fireEvent.loadedMetadata(video);
    // 2× about (0.5, 0.25) of frame-shaped footage: the top half, filling the frame
    expect(video.style.left).toBe("-50%");
    expect(video.style.top).toBe("0%");
    expect(video.style.width).toBe("200%");
    fireEvent.click(screen.getByTestId("reframe-reset"));
    expect(saveReframe).toHaveBeenCalledWith(b, null);
    expect(video.style.width).toBe("");
  });
});

describe("the cut, played with its sound", () => {
  const seg = (over: Partial<TimelineSegment>): TimelineSegment => ({ shotId: "r7", key: "c007", index: 1, start: 0, end: 4, section: null, media: { kind: "image", assetId: "still7", role: "generated_image", base: false }, scene: "he walks", note: null, events: [], ...over });

  it("shows a shot's reframe as a render crops it, and a shot nobody reframed as it always was", () => {
    const { rerender } = render(<SequencePlayer timeline={[seg({})]} assets={new Map([[still.id, still]])} song={null} />);
    const img = () => screen.getByTestId("sequence-image") as HTMLImageElement;
    Object.defineProperty(img(), "naturalWidth", { value: 1080 });
    Object.defineProperty(img(), "naturalHeight", { value: 1920 });
    fireEvent.load(img());
    expect(img().getAttribute("style")).toBeNull();
    expect(img().dataset.reframed).toBeUndefined();
    rerender(<SequencePlayer timeline={[seg({ reframe: { scale: 2, x: 0, y: 1 } })]} assets={new Map([[still.id, still]])} song={null} />);
    // clamped inside the picture: its bottom-left quarter, filling the frame
    expect(img().dataset.reframed).toBe("true");
    expect(img().style.left).toBe("0%");
    expect(img().style.top).toBe("-100%");
    expect(img().style.width).toBe("200%");
    expect(img().style.height).toBe("200%");
  });

  it("puts the reframe on the video of the shot that is playing", () => {
    const timeline = [seg({ media: { kind: "video", assetId: "clip7", role: "generated_clip", sourceIn: 0, sourceOut: null, leadIn: 0, base: false }, reframe: { scale: 1.5, x: 0.5, y: 0.5 } })];
    render(<SequencePlayer timeline={timeline} assets={new Map([[clip.id, clip]])} song={null} />);
    const video = document.querySelector('video[data-asset-id="clip7"]') as HTMLVideoElement;
    Object.defineProperty(video, "videoWidth", { value: 540 });
    Object.defineProperty(video, "videoHeight", { value: 960 });
    fireEvent.loadedMetadata(video);
    expect(video.dataset.reframed).toBe("true");
    expect(video.style.width).toBe("150%");
    expect(video.style.left).toBe("-25%");
  });
});
