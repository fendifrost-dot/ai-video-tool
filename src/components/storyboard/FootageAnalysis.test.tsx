/**
 * The take's reading as the director sees it: the recommendation first, what the background must be under it, and —
 * folded away — every finding with how firmly it is held.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { analyzeFootage, type AnalysisInput } from "@/lib/storyboard/footage";
import { compatibilityOf } from "@/lib/storyboard/compatibility";
import type { StoredFootageAnalysis, Staleness } from "@/lib/storyboard/footageRecord";
import type { BoxMediaItem, MediaAsset } from "@/lib/storyboard/media";
import { FootageAnalysisPanel } from "./FootageAnalysis";
import { StoryboardProvider, type StoryboardController } from "./useStoryboardController";
import S06 from "@/lib/storyboard/__fixtures__/take_S06.json";

vi.mock("./FrameThumb", () => ({
  FrameThumb: ({ seconds }: { seconds: number }) => (
    <i data-testid="thumb" data-seconds={seconds} />
  ),
}));

const AT = "2026-10-04T00:00:00.000Z";
const analysis = analyzeFootage(S06 as unknown as AnalysisInput, AT);

function stored(over: Partial<StoredFootageAnalysis> = {}): StoredFootageAnalysis {
  return {
    id: "r1",
    fingerprint: {
      bucket: "project-clips",
      path: "u/p/S06.mp4",
      bytes: 1,
      seconds: 6.97,
      width: 1080,
      height: 1920,
    },
    settings: { detailTiles: 8, lightGrid: 12, sampledBy: "browser", scaler: "canvas drawImage" },
    analysis,
    compatibility: compatibilityOf(analysis),
    evidence: [{ t: 0.5, why: "furthest to frame left he gets" }],
    ...over,
  };
}

function asset(over: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "take1",
    assetType: "reference_video",
    footageRole: "performance",
    bucket: "project-clips",
    path: "u/p/S06.mp4",
    playback: null,
    name: "S06.mp4",
    mime: "video/mp4",
    isVideo: true,
    isImage: false,
    durationSeconds: 6.97,
    shotId: null,
    sourceTool: "manual",
    providerJobId: null,
    createdAt: AT,
    ...over,
  } as MediaAsset;
}
const item = (a: MediaAsset): BoxMediaItem =>
  ({
    asset: a,
    kind: "video",
    role: "performance",
    selected: true,
    base: true,
    assignmentId: "a1",
    sourceIn: 0,
    sourceOut: 6.97,
    leadIn: 0,
    note: null,
  }) as unknown as BoxMediaItem;

function sb(over: Partial<StoryboardController> = {}): StoryboardController {
  return {
    urlFor: () => "https://signed/S06.mp4",
    analyzeFootage: vi.fn(async () => undefined),
    analyzingOf: () => null,
    footageAnalysisOf: () => null,
    ...over,
  } as unknown as StoryboardController;
}

const show = (c: StoryboardController, a = asset()) =>
  render(
    <StoryboardProvider value={c}>
      <FootageAnalysisPanel item={item(a)} />
    </StoryboardProvider>,
  );

describe("before it has been read", () => {
  it("offers to read the take, and promises nothing is generated", () => {
    show(sb());
    const panel = screen.getByTestId("footage-analysis");
    expect(panel.getAttribute("data-state")).toBe("unread");
    expect(panel.textContent).toContain("Nothing is generated and nothing is changed");
    expect(within(panel).getByTestId("footage-run").textContent).toContain("Read the footage");
  });

  it("runs only when pressed", async () => {
    const c = sb();
    show(c);
    expect(c.analyzeFootage).not.toHaveBeenCalled();
    screen.getByTestId("footage-run").click();
    expect(c.analyzeFootage).toHaveBeenCalledTimes(1);
  });

  it("says what it is doing while it reads", () => {
    show(sb({ analyzingOf: () => "finding him on every frame…" }));
    expect(screen.getByTestId("footage-stage").textContent).toContain("finding him on every frame");
  });
});

describe("after a real take has been read", () => {
  const c = sb({
    footageAnalysisOf: () => ({ analysis: stored(), staleness: { state: "fresh" } as Staleness }),
  });

  it("leads with the recommendation and its reasons", () => {
    show(c);
    const panel = screen.getByTestId("footage-analysis");
    expect(panel.getAttribute("data-route")).toBe("composite");
    expect(within(panel).getByTestId("footage-route").textContent).toContain(
      "Put this performance over a background",
    );
    expect(panel.textContent).toContain("performance, timing and lip movement survive a composite");
  });

  it("separates what the background MUST be from what it should be", () => {
    show(c);
    const hard = screen.getAllByTestId("footage-required").map((n) => n.textContent ?? "");
    const pref = screen.getAllByTestId("footage-guidance").map((n) => n.textContent ?? "");
    expect(hard.join(" ")).toContain("1080 × 1920");
    expect(hard.join(" ")).toContain("locked off");
    expect(pref.join(" ")).toContain("thigh up");
    expect(hard.length).toBeGreaterThan(0);
    expect(pref.length).toBeGreaterThan(0);
  });

  it("says in the panel what AVT cannot do to deliver what it recommended", () => {
    show(c);
    expect(
      screen
        .getAllByTestId("footage-gap")
        .map((n) => n.textContent)
        .join(" "),
    ).toContain("matting exists but only as a local script");
  });

  it("shows the frames to look at to judge the reading", () => {
    show(c);
    expect(
      within(screen.getByTestId("footage-evidence"))
        .getAllByTestId("thumb")[0]
        .getAttribute("data-seconds"),
    ).toBe("0.5");
  });

  it("marks every finding with how firmly it is held", () => {
    show(c);
    const findings = screen.getAllByTestId("footage-finding");
    const statuses = new Set(findings.map((n) => n.getAttribute("data-status")));
    expect(statuses).toContain("measured");
    expect(statuses).toContain("estimated");
    expect(statuses).toContain("unknown");
    const coverage = findings.find((n) => n.getAttribute("data-finding") === "coverage")!;
    expect(coverage.getAttribute("data-status")).toBe("estimated");
    expect(coverage.textContent).toContain("cannot say:");
  });

  it("shows the capture notes this take earned, and not a generic list", () => {
    show(c);
    const notes = screen
      .getAllByTestId("footage-capture")
      .map((n) => n.textContent ?? "")
      .join(" ");
    expect(notes).toContain("Record audio"); // S06 genuinely has no audio track
    expect(notes).not.toContain("frame-edge band"); // …and he never goes near an edge
  });
});

describe("a reading that may no longer be believed", () => {
  it("warns before the director acts on it", () => {
    const c = sb({
      footageAnalysisOf: () => ({
        analysis: stored(),
        staleness: {
          state: "stale",
          why: "it was read over 0–2 s, and this shot uses 2–6 s",
        } as Staleness,
      }),
    });
    show(c);
    expect(screen.getByTestId("footage-stale").textContent).toContain("this shot uses 2–6 s");
  });
});

describe("where it does not belong", () => {
  it("renders nothing for an image", () => {
    const { container } = render(
      <StoryboardProvider value={sb()}>
        <FootageAnalysisPanel item={{ ...item(asset()), kind: "image" } as BoxMediaItem} />
      </StoryboardProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
