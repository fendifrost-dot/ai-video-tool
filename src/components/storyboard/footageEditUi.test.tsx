/**
 * The footage controls a director actually sees on an INHERITED take — the case the defect was reported in: a
 * variation that has never had a footage row of its own, where the take is offered by the project's sync.
 *
 * The point of these tests is the distinction the UI must never blur: a take that is inherited and uncut, a take
 * this variation has trimmed, and a take this variation deliberately left out.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { boxMedia, type Assignment, type MediaAsset, type TakeSync } from "@/lib/storyboard/media";
import type { StoryboardBox } from "@/lib/storyboard/boxes";
import type { FootageEditAction } from "@/lib/storyboard/footageEdit";
import { FootageEditPanel } from "./FootageEdit";
import { StoryboardProvider, type StoryboardController } from "./useStoryboardController";

const AT = "2026-10-08T00:00:00Z";

/** The real YSL take: one upload, 190.34 s, matched to the song by hand at +0.8538 s. */
const HERO = {
  id: "take-hero",
  assetType: "reference_video",
  footageRole: "performance",
  bucket: "project-references",
  path: "hero_clip_hd_1080.mp4",
  playback: null,
  name: "hero_clip_hd_1080.mp4",
  mime: "video/mp4",
  isVideo: true,
  isImage: false,
  durationSeconds: 190.34015,
  shotId: null,
  sourceTool: "manual",
  providerJobId: null,
  createdAt: AT,
  derivedFrom: null,
  shows: null,
  filmedIn: null,
  beatCheck: null,
  takeCheck: null,
  footageAnalyses: [],
  acceptance: null,
} as unknown as MediaAsset;

const RESTAGED = {
  ...HERO,
  id: "clip-restaged",
  name: "restaged.mp4",
  derivedFrom: {
    assetId: HERO.id,
    songStart: 62.7,
    sourceWindow: [61.9, 65.8] as [number, number],
    method: "restaged" as const,
  },
};

const SYNC = {
  id: "s1",
  projectId: "p1",
  songAssetId: null,
  performanceAssetId: HERO.id,
  offsetSeconds: 0.8538,
  driftPpm: 0,
  method: "manual",
  status: "manual",
} as unknown as TakeSync;

const BOX = { id: "ib-c005", start: 15.68, end: 19.6 } as unknown as StoryboardBox;

const row = (over: Partial<Assignment> = {}): Assignment => ({
  id: "a1",
  projectId: "p1",
  shotId: BOX.id,
  assetId: HERO.id,
  role: "performance",
  sourceIn: null,
  sourceOut: null,
  trimHead: 0,
  trimTail: 0,
  excluded: false,
  isPrimary: true,
  sortOrder: 0,
  notes: null,
  createdAt: AT,
  updatedAt: AT,
  ...over,
});

const assets = new Map([HERO, RESTAGED].map((a) => [a.id, a]));

function show(
  assignments: Assignment[],
  editFootage = vi.fn<(b: StoryboardBox, id: string, a: FootageEditAction) => Promise<void>>(
    async () => undefined,
  ),
  asset = HERO,
) {
  const media = boxMedia({ box: BOX, assignments, assets, syncs: [SYNC] });
  const item = media.items.find((i) => i.asset.id === asset.id)!;
  const c = {
    projectId: "p1",
    editFootage,
    assignmentOf: (id: string) => assignments.find((a) => a.id === id) ?? null,
    syncOf: (id: string) => (id === HERO.id ? SYNC : null),
    urlFor: () => null,
  } as unknown as StoryboardController;
  render(
    <StoryboardProvider value={c}>
      <FootageEditPanel item={item} box={BOX} />
    </StoryboardProvider>,
  );
  return { editFootage, item };
}

describe("an inherited take, in a variation with no footage rows of its own", () => {
  it("is editable, not merely visible — the controls are there with no row to hang them on", () => {
    show([]);
    expect(screen.getByTestId("footage-trim-head")).toBeInTheDocument();
    expect(screen.getByTestId("footage-edit-exclude")).toBeInTheDocument();
  });

  it("says it is inherited and that this variation has decided nothing", () => {
    show([]);
    expect(screen.getByTestId("footage-edit-layer").textContent).toMatch(
      /inherited · this variation has made no cut/,
    );
    expect(screen.getByTestId("footage-edit-state").textContent).toMatch(
      /synced · covers the shot/,
    );
  });

  it("shows the file seconds the sync maps this shot onto, for checking against the take", () => {
    show([]);
    // song 15.68–19.60 s through a +0.8538 s offset
    expect(screen.getByTestId("footage-edit-derived").textContent).toContain("14.83–18.75 s");
  });

  it("a first trim is one action, and is written in seconds of the SHOT", () => {
    const { editFootage } = show([]);
    fireEvent.blur(screen.getByTestId("footage-trim-head"), { target: { value: "0.5" } });
    expect(editFootage).toHaveBeenCalledTimes(1);
    expect(editFootage.mock.calls[0][2]).toEqual({ do: "trim", head: 0.5, tail: 0 });
    expect(editFootage.mock.calls[0][1]).toBe(HERO.id);
  });

  it("offers no reset before anything has been cut", () => {
    show([]);
    expect(screen.queryByTestId("footage-edit-reset")).toBeNull();
  });
});

describe("a take this variation has cut", () => {
  it("reads back the trim it carries and says the cut is this variation's alone", () => {
    show([row({ trimHead: 0.5, trimTail: 0.4 })]);
    expect((screen.getByTestId("footage-trim-head") as HTMLInputElement).value).toBe("0.5");
    expect((screen.getByTestId("footage-trim-tail") as HTMLInputElement).value).toBe("0.4");
    expect(screen.getByTestId("footage-edit-layer").textContent).toBe("this variation only");
    expect(screen.getByTestId("footage-edit")).toHaveAttribute("data-edit-from", "trimmed");
  });

  it("shows the derived file range narrowing, and how much of the shot is left over", () => {
    show([row({ trimHead: 0.5, trimTail: 0.4 })]);
    const t = screen.getByTestId("footage-edit-derived").textContent!;
    expect(t).toContain("15.33–18.35 s");
    expect(t).toMatch(/0\.50 s of the shot before it starts/);
    expect(t).toMatch(/0\.40 s after it ends/);
  });

  it("can be put back to the whole synced coverage", () => {
    const { editFootage } = show([row({ trimHead: 0.5 })]);
    fireEvent.click(screen.getByTestId("footage-edit-reset"));
    expect(editFootage.mock.calls[0][2]).toEqual({ do: "reset" });
  });
});

describe("a take this variation left out", () => {
  const excluded = [row({ excluded: true, isPrimary: false })];

  it("is shown as a decision, with the way back — not hidden", () => {
    show(excluded);
    expect(screen.getByTestId("footage-edit-state").textContent).toBe("left out of this variation");
    expect(screen.getByTestId("footage-edit-restore")).toBeInTheDocument();
    expect(screen.getByTestId("footage-edit-excluded-note").textContent).toMatch(
      /still in the project and still synced/,
    );
  });

  it("offers no trim controls while it is out, and no derived range", () => {
    show(excluded);
    expect(screen.queryByTestId("footage-trim-head")).toBeNull();
    expect(screen.queryByTestId("footage-edit-derived")).toBeNull();
  });

  it("can be put back", () => {
    const { editFootage } = show(excluded);
    fireEvent.click(screen.getByTestId("footage-edit-restore"));
    expect(editFootage.mock.calls[0][2]).toEqual({ do: "restore" });
  });
});

describe("what these controls are NOT for", () => {
  it("a restaged clip is one shot's picture, not coverage, so it is not cut this way", () => {
    const restagedSync = {
      ...SYNC,
      id: "s2",
      performanceAssetId: RESTAGED.id,
      offsetSeconds: 15.68,
      status: "confirmed",
    } as TakeSync;
    const media = boxMedia({
      box: BOX,
      assignments: [row({ id: "a2", assetId: RESTAGED.id })],
      assets,
      syncs: [SYNC, restagedSync],
    });
    const item = media.items.find((i) => i.asset.id === RESTAGED.id)!;
    const c = {
      projectId: "p1",
      editFootage: vi.fn(),
      assignmentOf: () => null,
      syncOf: () => null,
      urlFor: () => null,
    } as unknown as StoryboardController;
    const { container } = render(
      <StoryboardProvider value={c}>
        <FootageEditPanel item={item} box={BOX} />
      </StoryboardProvider>,
    );
    expect(container.querySelector('[data-testid="footage-edit"]')).toBeNull();
  });
});
