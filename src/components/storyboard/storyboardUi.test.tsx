/**
 * The storyboard's two presentations of one shot record — the card on the board and the full-screen view — driven
 * by a stand-in controller, so what is tested is what the director can see and press.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { parseShotSpec } from "@/lib/treatment/shotSpec";
import { boxFromRow, boxWrite, type BoxRow, type StoryboardBox } from "@/lib/storyboard/boxes";
import { boxMedia, type Assignment, type MediaAsset, type TakeSync } from "@/lib/storyboard/media";
import { resolveEvents, type EventClock } from "@/lib/storyboard/events";
import { temporalPlan } from "@/lib/storyboard/temporal";
import { NO_CONTINUITY } from "@/lib/continuity/entities";
import { BoxCard } from "./BoxCard";
import { mediaLabel } from "./BoxMediaView";
import { FocusView } from "./FocusView";
import { MediaPicker } from "./MediaPicker";
import { StoryboardProvider, type StoryboardController } from "./useStoryboardController";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@/lib/queries/storyboard", () => ({ useTakeSyncs: () => ({ data: [] }) }));
vi.mock("./signedUrls", async (orig) => ({ ...(await orig<typeof import("./signedUrls")>()), signRefs: vi.fn(async () => ({})) }));

const AT = "2026-10-03T12:00:00.000Z";
const CLOCK: EventClock = {};
function box(id: string, key: string, start: number, end: number, extra: Partial<BoxRow> = {}): StoryboardBox {
  const w = boxWrite({
    key,
    start,
    end,
    section: "verse",
    generated: parseShotSpec({ id: key, purpose: `scene ${key}`, shotType: "b_roll", kind: "broll", timeline: { start, end } }),
    override: null,
    locked: false,
    origin: "treatment",
    history: [{ at: AT, event: "rewrite", purpose: "an earlier scene" }],
  });
  return boxFromRow({ id, project_id: "p1", shot_number: 1, ...w, updated_at: AT, ...extra } as BoxRow)!;
}
function asset(id: string, over: Partial<MediaAsset> = {}): MediaAsset {
  return { id, assetType: "generated_clip", footageRole: null, bucket: "project-clips", path: `u/p/${id}.mp4`, playback: null, name: `${id}.mp4`, mime: "video/mp4", isVideo: true, isImage: false, durationSeconds: 5, shotId: null, sourceTool: "higgsfield", providerJobId: null, createdAt: AT, ...over };
}
const take = asset("take1", { footageRole: "performance", assetType: "reference_video", durationSeconds: 190, name: "take1.mp4", sourceTool: "manual" });
const clip = asset("clip1");
const sync: TakeSync = { id: "s1", projectId: "p1", songAssetId: "song", performanceAssetId: "take1", offsetSeconds: 0.85, driftPpm: 0, method: "manual", status: "confirmed" };

function controller(over: Partial<StoryboardController> = {}): StoryboardController {
  const boxes = [box("r1", "c001", 0, 4), box("r2", "c002", 4, 8), box("r3", "c003", 8, 12, { locked: true, override_json: { direction: "his scene", manual: ["direction"] } })];
  const assets = new Map([take, clip].map((a) => [a.id, a]));
  const assignments: Assignment[] = [
    { id: "a1", projectId: "p1", shotId: "r2", assetId: "clip1", role: "generated_clip", sourceIn: null, sourceOut: null, isPrimary: true, sortOrder: 1, notes: null, createdAt: AT, updatedAt: AT },
  ];
  const fn = () => vi.fn(async () => undefined);
  return {
    projectId: "p1",
    loading: false,
    error: null,
    boxes,
    numberOf: (id) => boxes.findIndex((b) => b.id === id) + 1,
    mediaOf: (id) => boxMedia({ box: boxes.find((b) => b.id === id)!, assignments, assets, syncs: [sync] }),
    urlFor: () => "https://signed/x.mp4",
    lyricsOf: (b) => (b.key === "c001" ? { lines: [{ lineIndex: 0, section: "verse", text: "ice on my wrist", cutIn: false, cutOut: false, start: 1, end: 3, confidence: 1 }], state: "lyrics" } : { lines: [], state: "instrumental" }),
    energyOf: () => "high",
    jobOf: () => null,
    busyOf: () => null,
    estimatesOf: () => ({ image: 0.14, clip: 0.35, clipDrawsImage: false }),
    rewriteBlockedReason: () => null,
    staleOf: () => false,
    wardrobeGapOf: () => null,
    library: [
      { asset: take, role: "performance" },
      { asset: clip, role: "generated_clip" },
    ],
    migrated: null,
    hasTreatment: true,
    aspect: "9:16",
    saveEdit: fn(),
    resetBox: fn(),
    rewrite: fn(),
    restoreVersion: fn(),
    eventsOf: (b) => resolveEvents(b.spec.events, { start: b.start, end: b.end }, CLOCK),
    clock: CLOCK,
    saveEvents: fn(),
    splitAtBeats: fn(),
    clipPlanOf: (b) => temporalPlan({ route: "still_kling", resolved: resolveEvents(b.spec.events, { start: b.start, end: b.end }, CLOCK), shotSeconds: b.end - b.start }),
    requestOf: () => null,
    measureClip: fn(),
    measuringOf: () => false,
    takeOf: () => null,
    checkAgainstTake: fn(),
    checkingOf: () => null,
    analyzeFootage: fn(),
    footageAnalysisOf: () => null,
    analyzingOf: () => null,
    acceptanceOf: () => null,
    judge: fn(),
    entities: [],
    looks: [],
    continuityOf: () => NO_CONTINUITY,
    entityUsage: new Map(),
    picturesOf: () => [],
    entityBusyOf: () => null,
    createEntity: vi.fn(async () => null),
    saveEntity: fn(),
    generateEntityPicture: vi.fn(),
    useShotImageFor: fn(),
    castOf: () => ({ members: [], open: false, none: false, missing: [] }),
    outfits: [],
    scenes: [],
    outfitOf: () => ({ outfit: null, source: "none", mode: "inherit", scene: null, missingKey: null }),
    piecesOf: () => [],
    unmetOf: () => null,
    outfitFlagsOf: () => [],
    outfitOutdatedOf: () => null,
    proposedScenes: [],
    createOutfit: vi.fn(async () => null),
    createScene: fn(),
    saveScene: fn(),
    removeScene: fn(),
    adoptProposedScenes: fn(),
    sceneBusy: false,
    castProblemsOf: () => [],
    saveCast: vi.fn(),
    saveContinuity: fn(),
    wardrobe: [],
    linksOf: () => [],
    routeOf: () => ({ method: "generate", inferred: true, verdict: "storyboard", path: "", where: null, limits: [] }),
    referencesOf: () => ({ sent: [], notSent: [], legend: "", delivered: false, problems: [], cap: 3, baseCap: 3, model: null }),
    stillRequestOf: () => null,
    toggleLock: fn(),
    split: fn(),
    mergeWithNext: vi.fn(),
    assign: fn(),
    select: fn(),
    editFootage: fn(),
    assignmentOf: (id: string) => assignments.find((a) => a.id === id) ?? null,
    syncOf: (assetId: string) => (assetId === sync.performanceAssetId ? sync : null),
    showBaseLayer: fn(),
    takeOff: fn(),
    moveTo: fn(),
    generateImage: vi.fn(),
    generateClip: vi.fn(),
    focusId: null,
    openFocus: vi.fn(),
    pickerFor: null,
    openPicker: vi.fn(),
    confirm: null,
    askConfirm: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  // jsdom has no IntersectionObserver; RangeVideo then loads at once, which is fine for these tests
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
});

describe("a box on the board", () => {
  it("shows its place in the song, the words sung in it, its scene and its three actions with their prices", () => {
    const sb = controller();
    render(
      <StoryboardProvider value={sb}>
        <BoxCard box={sb.boxes[0]} />
      </StoryboardProvider>,
    );
    const card = screen.getByTestId("box-card");
    expect(card.getAttribute("data-box-key")).toBe("c001");
    expect(card.getAttribute("data-box-number")).toBe("1");
    expect(screen.getByTestId("box-lyrics").textContent).toContain("ice on my wrist");
    expect(screen.getByTestId("box-scene").textContent).toBe("scene c001");
    expect(screen.getByTestId("box-rewrite").textContent).toContain("Regenerate scene");
    expect(screen.getByTestId("box-generate-image").textContent).toContain("$0.14");
    expect(screen.getByTestId("box-generate-clip").textContent).toContain("$0.35");
  });

  it("with nothing put on it, plays the synced take underneath — its own range of it", () => {
    const sb = controller();
    render(
      <StoryboardProvider value={sb}>
        <BoxCard box={sb.boxes[0]} />
      </StoryboardProvider>,
    );
    const media = screen.getByTestId("box-media");
    expect(media.getAttribute("data-media-role")).toBe("performance");
    expect(media.getAttribute("data-media-base")).toBe("true");
    expect(media.textContent).toContain("Your take · base layer");
  });

  it("each action acts on this box only", () => {
    const sb = controller();
    render(
      <StoryboardProvider value={sb}>
        <BoxCard box={sb.boxes[1]} />
      </StoryboardProvider>,
    );
    fireEvent.click(screen.getByTestId("box-rewrite"));
    expect(sb.rewrite).toHaveBeenCalledWith(sb.boxes[1]);
    fireEvent.click(screen.getByTestId("box-generate-image"));
    expect(sb.generateImage).toHaveBeenCalledWith(sb.boxes[1]);
    fireEvent.click(screen.getByTestId("box-generate-clip"));
    expect(sb.generateClip).toHaveBeenCalledWith(sb.boxes[1]);
    fireEvent.click(screen.getByTestId("box-open"));
    expect(sb.openFocus).toHaveBeenCalledWith("r2");
    fireEvent.click(screen.getByTestId("box-add-media"));
    expect(sb.openPicker).toHaveBeenCalledWith("r2");
  });

  it("lists the footage on it — the selected clip and the take still underneath — and switches on a click", () => {
    const sb = controller();
    render(
      <StoryboardProvider value={sb}>
        <BoxCard box={sb.boxes[1]} />
      </StoryboardProvider>,
    );
    const chips = screen.getAllByTestId("box-media-chip");
    expect(chips.map((c) => [c.getAttribute("data-role"), c.getAttribute("data-showing")])).toEqual([
      ["generated_clip", "true"],
      ["performance", "false"],
    ]);
    fireEvent.click(chips[1]);
    expect(sb.select).toHaveBeenCalled();
  });

  it("a box the director edited says so, and offers the way back", () => {
    const sb = controller();
    render(
      <StoryboardProvider value={sb}>
        <BoxCard box={sb.boxes[2]} />
      </StoryboardProvider>,
    );
    expect(screen.getByTestId("box-edited-tag")).toBeTruthy();
    expect(screen.getByTestId("box-locked")).toBeTruthy();
    expect(screen.getByTestId("box-scene").textContent).toBe("his scene");
    fireEvent.click(screen.getByTestId("box-menu"));
    fireEvent.click(screen.getByTestId("box-menu-reset"));
    expect(sb.resetBox).toHaveBeenCalledWith(sb.boxes[2]);
  });

  it("split and merge are offered; adding a shot is not", () => {
    const sb = controller();
    const { container } = render(
      <StoryboardProvider value={sb}>
        <BoxCard box={sb.boxes[0]} />
      </StoryboardProvider>,
    );
    fireEvent.click(screen.getByTestId("box-menu"));
    expect(screen.getByTestId("box-menu-split")).toBeTruthy();
    fireEvent.click(screen.getByTestId("box-menu-merge"));
    expect(sb.mergeWithNext).toHaveBeenCalledWith(sb.boxes[0]);
    expect(container.textContent).not.toMatch(/add shot/i);
  });
});

describe("the full-screen shot view", () => {
  it("is closed until a shot is opened", () => {
    render(
      <StoryboardProvider value={controller()}>
        <FocusView />
      </StoryboardProvider>,
    );
    expect(screen.queryByTestId("focus-view")).toBeNull();
  });

  it("shows the same record, its position, and moves to the neighbours; back returns to the board", () => {
    const sb = controller({ focusId: "r2" });
    const { container } = render(
      <StoryboardProvider value={sb}>
        <FocusView />
      </StoryboardProvider>,
    );
    const view = screen.getByTestId("focus-view");
    // drawn on the document body, above the app shell — inside the page it slid under the phone header and its
    // Back button could not be reached
    expect(container.querySelector('[data-testid="focus-view"]')).toBeNull();
    expect(view.parentElement).toBe(document.body);
    expect(view.getAttribute("data-box-key")).toBe("c002");
    expect(screen.getByTestId("focus-position").textContent).toBe("02 / 03");
    expect(screen.getByTestId("focus-scene").textContent).toBe("scene c002");
    fireEvent.click(screen.getByTestId("focus-next"));
    expect(sb.openFocus).toHaveBeenLastCalledWith("r3");
    fireEvent.click(screen.getByTestId("focus-prev"));
    expect(sb.openFocus).toHaveBeenLastCalledWith("r1");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(sb.openFocus).toHaveBeenLastCalledWith("r3");
    fireEvent.click(screen.getByTestId("focus-close"));
    expect(sb.openFocus).toHaveBeenLastCalledWith(null);
  });

  it("fills the screen inside the page where the browser offers no full screen (a phone), and Escape leaves that first", () => {
    const sb = controller({ focusId: "r2" });
    render(
      <StoryboardProvider value={sb}>
        <FocusView />
      </StoryboardProvider>,
    );
    const stage = screen.getByTestId("focus-stage");
    expect(stage.getAttribute("data-fill")).toBe("false");
    fireEvent.click(screen.getByTestId("focus-fullscreen"));
    expect(stage.getAttribute("data-fill")).toBe("true");
    expect(screen.getByTestId("focus-fill-position").textContent).toBe("02 / 03");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(stage.getAttribute("data-fill")).toBe("false");
    expect(sb.openFocus).not.toHaveBeenCalledWith(null);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(sb.openFocus).toHaveBeenLastCalledWith(null);
  });

  it("a sideways swipe on the stage moves to the next or previous shot; a vertical drag does not", () => {
    const sb = controller({ focusId: "r2" });
    render(
      <StoryboardProvider value={sb}>
        <FocusView />
      </StoryboardProvider>,
    );
    const stage = screen.getByTestId("focus-stage");
    const swipe = (x0: number, y0: number, x1: number, y1: number) => {
      fireEvent.touchStart(stage, { touches: [{ clientX: x0, clientY: y0 }] });
      fireEvent.touchEnd(stage, { changedTouches: [{ clientX: x1, clientY: y1 }] });
    };
    swipe(300, 200, 100, 210);
    expect(sb.openFocus).toHaveBeenLastCalledWith("r3");
    swipe(100, 200, 300, 190);
    expect(sb.openFocus).toHaveBeenLastCalledWith("r1");
    (sb.openFocus as ReturnType<typeof vi.fn>).mockClear();
    swipe(200, 100, 210, 400);
    expect(sb.openFocus).not.toHaveBeenCalled();
  });

  it("the ends of the board stop: no previous before the first, no next after the last", () => {
    const sb = controller({ focusId: "r1" });
    render(
      <StoryboardProvider value={sb}>
        <FocusView />
      </StoryboardProvider>,
    );
    expect((screen.getByTestId("focus-prev") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("focus-next") as HTMLButtonElement).disabled).toBe(false);
  });

  it("the media tab shows each item's source range, lets one be shown, moved or taken off", () => {
    const sb = controller({ focusId: "r2" });
    render(
      <StoryboardProvider value={sb}>
        <FocusView />
      </StoryboardProvider>,
    );
    fireEvent.click(screen.getByTestId("focus-tab-media"));
    const items = screen.getAllByTestId("focus-media-item");
    expect(items.map((i) => [i.getAttribute("data-role"), i.getAttribute("data-base"), i.getAttribute("data-showing")])).toEqual([
      ["generated_clip", "false", "true"],
      ["performance", "true", "false"],
    ]);
    // the take's range is the box's song window through the sync: 4–8 s of song → 3.15–7.15 s of take
    expect(within(items[1]).getByTestId("focus-media-range").textContent).toMatch(/source 0:03.*0:07.*in sync with song 0:04.*0:08/);
    fireEvent.click(within(items[1]).getByTestId("focus-media-show"));
    expect(sb.select).toHaveBeenCalled();
    fireEvent.change(within(items[0]).getByTestId("focus-media-move"), { target: { value: "r1" } });
    expect(sb.moveTo).toHaveBeenCalledWith(expect.objectContaining({ assignmentId: "a1" }), "r1");
    fireEvent.click(within(items[0]).getByTestId("focus-media-remove"));
    expect(sb.takeOff).toHaveBeenCalledWith(expect.objectContaining({ assignmentId: "a1" }));
    // the base take has no row to move or remove
    expect(within(items[1]).queryByTestId("focus-media-remove")).toBeNull();
  });

  it("the details tab saves an edit onto this record, and can split it", () => {
    const sb = controller({ focusId: "r1" });
    render(
      <StoryboardProvider value={sb}>
        <FocusView />
      </StoryboardProvider>,
    );
    fireEvent.change(screen.getByTestId("box-editor-direction"), { target: { value: "a new scene" } });
    fireEvent.click(screen.getByTestId("box-editor-save"));
    expect(sb.saveEdit).toHaveBeenCalledWith(sb.boxes[0], expect.objectContaining({ direction: "a new scene" }));
    fireEvent.click(screen.getByTestId("box-split"));
    expect(sb.split).toHaveBeenCalledWith(sb.boxes[0], 2);
  });

  it("the split point steps to the song's beats, so a cut can be put on one", () => {
    const sb = controller({ focusId: "r1", clock: { beats: [0.2, 0.98, 1.47, 1.96, 2.45, 2.94, 3.43, 3.9] } });
    render(
      <StoryboardProvider value={sb}>
        <FocusView />
      </StoryboardProvider>,
    );
    // the slider opens in the middle of the shot (2.00 s): not on a beat
    expect(screen.getByTestId("box-split-time").getAttribute("data-on-beat")).toBe("false");
    fireEvent.click(screen.getByTestId("box-split-next-beat"));
    expect(screen.getByTestId("box-split-time").textContent).toBe("2.45 s · on the beat");
    fireEvent.click(screen.getByTestId("box-split-prev-beat"));
    fireEvent.click(screen.getByTestId("box-split-prev-beat"));
    expect(screen.getByTestId("box-split-time").textContent).toBe("1.47 s · on the beat");
    fireEvent.click(screen.getByTestId("box-split"));
    expect(sb.split).toHaveBeenCalledWith(sb.boxes[0], 1.47);
    // beats too near the ends of the shot to leave a shot on each side are not offered
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByTestId("box-split-prev-beat"));
    expect(screen.getByTestId("box-split-time").textContent).toBe("0.98 s · on the beat");
  });

  it("earlier versions are listed and can be brought back", () => {
    const sb = controller({ focusId: "r1" });
    render(
      <StoryboardProvider value={sb}>
        <FocusView />
      </StoryboardProvider>,
    );
    fireEvent.click(screen.getByTestId("focus-tab-versions"));
    expect(screen.getByTestId("focus-versions").textContent).toContain("an earlier scene");
    fireEvent.click(screen.getByTestId("focus-version-restore"));
    expect(sb.restoreVersion).toHaveBeenCalledWith(sb.boxes[0], expect.objectContaining({ purpose: "an earlier scene" }));
  });
});

describe("putting footage on a shot", () => {
  it("lists the project's footage by kind and assigns without copying", () => {
    const sb = controller({ pickerFor: "r1" });
    render(
      <StoryboardProvider value={sb}>
        <MediaPicker />
      </StoryboardProvider>,
    );
    expect(screen.getByTestId("media-picker").textContent).toContain("Footage for shot 1");
    const rows = screen.getAllByTestId("media-row");
    expect(rows.map((r) => r.getAttribute("data-role"))).toEqual(["performance", "generated_clip"]);
    fireEvent.click(within(rows[1]).getByTestId("media-row-assign"));
    expect(sb.assign).toHaveBeenCalledWith(sb.boxes[0], clip, "generated_clip");
    fireEvent.click(screen.getByTestId("media-tab-performance"));
    expect(screen.getAllByTestId("media-row")).toHaveLength(1);
  });

  it("marks what is already on the shot", () => {
    const sb = controller({ pickerFor: "r2" });
    render(
      <StoryboardProvider value={sb}>
        <MediaPicker />
      </StoryboardProvider>,
    );
    const rows = screen.getAllByTestId("media-row");
    expect(within(rows[1]).getByTestId("media-row-assign").textContent).toContain("On this shot");
    expect((within(rows[1]).getByTestId("media-row-assign") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("the name a piece of media goes by", () => {
  it("tells a take over a new background from a take a model re-shot", () => {
    expect(mediaLabel({ role: "performance", base: true })).toBe("Your take · base layer");
    expect(mediaLabel({ role: "performance", base: false, asset: { derivedFrom: { assetId: "t", songStart: 0 } } })).toBe("Your take · restaged");
    expect(mediaLabel({ role: "performance", base: false, asset: { derivedFrom: { assetId: "t", songStart: 0, method: "restaged" } } })).toBe("Your take · restaged");
    expect(mediaLabel({ role: "performance", base: false, asset: { derivedFrom: { assetId: "t", songStart: 0, method: "composite" } } })).toBe("Your take · new background");
  });
});

describe("a shot the treatment has moved on from", () => {
  it("says so on its card, and only there", () => {
    const sb = controller({ staleOf: (b) => b.key === "c001" });
    render(
      <StoryboardProvider value={sb}>
        <BoxCard box={sb.boxes[0]} />
        <BoxCard box={sb.boxes[1]} />
      </StoryboardProvider>,
    );
    const tags = screen.getAllByTestId("box-stale");
    expect(tags).toHaveLength(1);
    expect(tags[0].textContent).toBe("earlier treatment");
    expect(tags[0].closest('[data-testid="box-card"]')?.getAttribute("data-box-key")).toBe("c001");
  });
});

