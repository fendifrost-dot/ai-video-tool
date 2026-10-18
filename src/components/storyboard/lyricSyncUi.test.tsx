/**
 * The Lyric sync panel on a 10 s continuous take (E1, filed on c033 with its own sync: its first frame at 53.8 s).
 * What a director does with it: scrub to where he starts a line, press the line; nudge by a frame; read back the
 * in-point the Premiere export carries; and see at once whether the shot holds its lines.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { boxMedia, type Assignment, type MediaAsset, type TakeSync } from "@/lib/storyboard/media";
import type { StoryboardBox } from "@/lib/storyboard/boxes";
import type { FootageEditAction } from "@/lib/storyboard/footageEdit";
import { LyricSyncPanel } from "./LyricSync";
import { StoryboardProvider, type StoryboardController } from "./useStoryboardController";

const AT = "2026-10-17T00:00:00Z";
const E1 = {
  id: "e1",
  assetType: "generated_clip",
  footageRole: "performance",
  bucket: "project-clips",
  path: "u/p/E1.mp4",
  playback: null,
  name: "E1.mp4",
  mime: "video/mp4",
  isVideo: true,
  isImage: false,
  durationSeconds: 10.04,
  shotId: null,
  sourceTool: "higgsfield",
  providerJobId: null,
  createdAt: AT,
  derivedFrom: { assetId: "take", songStart: 53.8, method: "dressed" },
} as unknown as MediaAsset;
const SYNC = {
  id: "s1",
  projectId: "p1",
  songAssetId: null,
  performanceAssetId: E1.id,
  offsetSeconds: 53.8,
  driftPpm: 0,
  method: "restage",
  status: "confirmed",
} as unknown as TakeSync;
const BOX = { id: "b33", key: "c033", start: 58.06, end: 59.54 } as unknown as StoryboardBox;
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
const row = (over: Partial<Assignment> = {}): Assignment => ({
  id: "a1",
  projectId: "p1",
  shotId: BOX.id,
  assetId: E1.id,
  role: "performance",
  sourceIn: null,
  sourceOut: null,
  trimHead: 0,
  trimTail: 0,
  excluded: false,
  slip: 0,
  isPrimary: true,
  sortOrder: 0,
  notes: null,
  createdAt: AT,
  updatedAt: AT,
  ...over,
});

function show(assignments: Assignment[]) {
  const editFootage = vi.fn<(b: StoryboardBox, id: string, a: FootageEditAction) => Promise<void>>(
    async () => undefined,
  );
  const media = boxMedia({ box: BOX, assignments, assets: new Map([[E1.id, E1]]), syncs: [SYNC] });
  const item = media.items.find((i) => i.asset.id === E1.id)!;
  const c = {
    projectId: "p1",
    editFootage,
    assignmentOf: (id: string) => assignments.find((a) => a.id === id) ?? null,
    syncOf: (id: string) => (id === E1.id ? SYNC : null),
    urlFor: () => "blob:e1",
    songLines: LINES,
    song: null,
  } as unknown as StoryboardController;
  render(
    <StoryboardProvider value={c}>
      <LyricSyncPanel item={item} box={BOX} />
    </StoryboardProvider>,
  );
  return { editFootage };
}

describe("Lyric sync on a performance clip", () => {
  it("lists the lines the shot carries, and holds them when the cut is not through a word", () => {
    show([row()]);
    expect(screen.getAllByTestId("lyric-sync-line").map((b) => b.textContent)).toEqual([
      "58.02 Laugh cause we did it",
      "58.80 what im whippin cost a home",
    ]);
    expect(screen.getByTestId("lyric-sync").dataset.fit).toBe("ok");
    expect(screen.getByTestId("lyric-sync-fit").textContent).toMatch(/holds its lines/);
  });

  it("puts the frame he starts a line on onto that line", () => {
    const { editFootage } = show([row()]);
    // he starts "what im whippin…" at 5.1 s of the clip, which the sync plays at 58.9 s: 0.1 s late
    fireEvent.change(screen.getByTestId("lyric-sync-scrub"), { target: { value: "5.1" } });
    fireEvent.click(screen.getAllByTestId("lyric-sync-line")[1]);
    expect(editFootage).toHaveBeenCalledWith(BOX, E1.id, { do: "slip", seconds: -0.1 });
  });

  it("nudges by a frame from the slip it has, and reads back what the export carries", () => {
    const { editFootage } = show([row({ slip: -0.1 })]);
    fireEvent.click(screen.getAllByTestId("lyric-sync-nudge")[3]);
    expect(editFootage).toHaveBeenCalledWith(BOX, E1.id, {
      do: "slip",
      seconds: expect.closeTo(-0.1 + 1 / 24, 4),
    });
    // in-point: 58.06 − (53.8 − 0.1) = 4.36 s into the clip; on the song at the shot's start
    expect(screen.getByTestId("lyric-sync-readout").textContent).toBe(
      "clip in 4.360 s · on the song at 58.060 s · slip −0.100 s",
    );
    fireEvent.click(screen.getByTestId("lyric-sync-reset"));
    expect(editFootage).toHaveBeenLastCalledWith(BOX, E1.id, { do: "slip", seconds: 0 });
  });

  it("does not offer a slip for a montage, whose mouth is the model's", () => {
    const montage = {
      ...E1,
      id: "m1",
      derivedFrom: { assetId: "take", songStart: 53.8, method: "montage" },
    } as unknown as MediaAsset;
    const sync = { ...SYNC, performanceAssetId: montage.id } as unknown as TakeSync;
    const media = boxMedia({
      box: BOX,
      assignments: [{ ...row(), assetId: montage.id }],
      assets: new Map([[montage.id, montage]]),
      syncs: [sync],
    });
    const item = media.items.find((i) => i.asset.id === montage.id)!;
    const c = {
      projectId: "p1",
      editFootage: vi.fn(),
      assignmentOf: () => row(),
      syncOf: () => sync,
      urlFor: () => "blob:m",
      songLines: LINES,
      song: null,
    } as unknown as StoryboardController;
    render(
      <StoryboardProvider value={c}>
        <LyricSyncPanel item={item} box={BOX} />
      </StoryboardProvider>,
    );
    expect(screen.getByTestId("lyric-sync-model").textContent).toMatch(/mouth is the model/);
    expect(screen.queryByTestId("lyric-sync-line")).toBeNull();
  });
});
