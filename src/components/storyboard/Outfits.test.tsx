/**
 * The wardrobe surfaces — the video's outfits and scenes, and one shot's outfit — driven by a stand-in controller
 * whose resolution is the real one (src/lib/wardrobe/outfits.ts), so what is tested is what the director sees
 * and presses: define an outfit once, give it to a scene, watch the shots inherit it, make an exception.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { parseShotSpec } from "@/lib/treatment/shotSpec";
import { boxFromRow, boxWrite, type BoxRow, type StoryboardBox } from "@/lib/storyboard/boxes";
import { indexEntities, type ContinuityEntity } from "@/lib/continuity/entities";
import {
  effectiveGarments,
  outfitFlags,
  resolveOutfit,
  scenesFromWriter,
  type Outfit,
  type Scene,
} from "@/lib/wardrobe/outfits";
import { ShotOutfitEditor, WardrobePanel } from "./Outfits";
import { StoryboardProvider, type StoryboardController } from "./useStoryboardController";

const AT = "2026-10-08T12:00:00.000Z";
const WARDROBE = [
  { id: "jacket", label: "Trucker Jacket — French Black Denim", featureType: "garment" },
  { id: "jeans", label: "Mick Long Jeans — Westwood Black", featureType: "garment" },
  { id: "track", label: "Track Jacket — Mastic Navy Stripe", featureType: "garment" },
];
const outfit = (
  key: string,
  name: string,
  pieces: string[],
  version = 1,
  description = "",
): Outfit =>
  ({
    id: `id-${key}`,
    projectId: "p1",
    variationId: "v1",
    kind: "outfit",
    key,
    name,
    description,
    constraints: "",
    approvedAssetId: null,
    referenceAssetIds: [],
    cast: null,
    outfit: { garmentFeatureIds: pieces, version },
    archived: false,
    createdAt: AT,
    updatedAt: AT,
  }) as Outfit;
const DENIM = outfit(
  "YSL_DENIM_LOOK",
  "YSL denim look",
  ["jacket", "jeans"],
  2,
  "black denim over black denim",
);
const COAT = outfit("YSL_LEATHER_COAT", "YSL leather coat", []);
const scene = (
  id: string,
  name: string,
  start: number,
  end: number,
  outfitKey: string | null,
): Scene => ({
  id,
  projectId: "p1",
  variationId: "v1",
  name,
  start,
  end,
  outfitKey,
  notes: "",
  createdAt: AT,
  updatedAt: AT,
});

function box(
  key: string,
  start: number,
  end: number,
  wardrobe: Record<string, unknown> = {},
  extra: Partial<BoxRow> = {},
): StoryboardBox {
  const spec = parseShotSpec({
    id: key,
    purpose: `scene ${key}`,
    shotType: "narrative",
    kind: "generated",
    timeline: { start, end },
    wardrobe: { description: "exact YSL denim look", source: "treatment", ...wardrobe },
  });
  const w = boxWrite({
    key,
    start,
    end,
    section: "verse",
    generated: spec,
    override: null,
    locked: false,
    origin: "treatment",
    history: [],
  });
  return boxFromRow({
    id: `r_${key}`,
    project_id: "p1",
    shot_number: 1,
    ...w,
    ...extra,
    updated_at: AT,
  } as BoxRow)!;
}

function controller(
  boxes: StoryboardBox[],
  outfits: Outfit[],
  scenes: Scene[],
  over: Partial<StoryboardController> = {},
): StoryboardController {
  const index = indexEntities(outfits as ContinuityEntity[]);
  const onFile = new Set(WARDROBE.map((w) => w.id));
  const outfitOf = (b: StoryboardBox) => resolveOutfit(b.spec, { start: b.start }, scenes, index);
  return {
    boxes,
    numberOf: (id: string) => boxes.findIndex((b) => b.id === id) + 13,
    entities: outfits,
    outfits,
    scenes,
    wardrobe: WARDROBE,
    outfitOf,
    piecesOf: (b: StoryboardBox) => {
      const g = effectiveGarments(b.spec, outfitOf(b));
      return g.ids.map((id) => ({
        id,
        label: WARDROBE.find((w) => w.id === id)?.label ?? null,
        from: g.from,
      }));
    },
    outfitFlagsOf: (b: StoryboardBox) => outfitFlags(b.spec, outfitOf(b), onFile, outfits),
    outfitOutdatedOf: () => null,
    proposedScenes: scenesFromWriter(boxes, outfits),
    createOutfit: vi.fn(async () => DENIM),
    createScene: vi.fn(async () => undefined),
    saveScene: vi.fn(async () => undefined),
    removeScene: vi.fn(async () => undefined),
    adoptProposedScenes: vi.fn(async () => undefined),
    sceneBusy: false,
    saveEntity: vi.fn(async () => undefined),
    saveContinuity: vi.fn(async () => undefined),
    busyOf: () => null,
    entityBusyOf: () => null,
    ...over,
  } as unknown as StoryboardController;
}
const show = (ui: React.ReactNode, sb: StoryboardController) => ({
  sb,
  ...render(<StoryboardProvider value={sb}>{ui}</StoryboardProvider>),
});
const open = () => fireEvent.click(screen.getByTestId("wardrobe-toggle"));

describe("the wardrobe panel", () => {
  it("counts outfits and scenes, and the dressed shots no scene covers", () => {
    const boxes = [
      box("c012", 43, 47),
      box("c013", 47, 51),
      box("c017", 59, 63, { description: "exact YSL leather coat" }),
    ];
    show(
      <WardrobePanel />,
      controller(boxes, [DENIM, COAT], [scene("s1", "The viewer", 43, 51, "YSL_DENIM_LOOK")]),
    );
    expect(screen.getByTestId("wardrobe-summary").textContent).toContain("2 outfits · 1 scene");
    expect(screen.getByTestId("wardrobe-summary").textContent).toContain(
      "1 dressed shot with no outfit assigned",
    );
  });

  it("defines an outfit once: a name and the pieces ticked from the wardrobe, in order", async () => {
    const { sb } = show(<WardrobePanel />, controller([], [], []));
    open();
    expect(screen.getByTestId("wardrobe-summary").textContent).toContain("no outfits yet");
    fireEvent.change(screen.getByTestId("outfit-new-name"), {
      target: { value: "YSL denim look" },
    });
    const pieces = screen.getAllByTestId("outfit-new-piece");
    fireEvent.click(pieces[1]);
    fireEvent.click(pieces[0]);
    expect(pieces[1].textContent).toMatch(/^1\. /);
    expect(pieces[0].textContent).toMatch(/^2\. /);
    fireEvent.click(screen.getByTestId("outfit-new-add"));
    await vi.waitFor(() =>
      expect(sb.createOutfit).toHaveBeenCalledWith("YSL denim look", ["jeans", "jacket"]),
    );
  });

  it("an outfit card shows its version, who wears it, its pieces; pieces come on and off; the words save on blur", () => {
    const { sb } = show(
      <WardrobePanel />,
      controller([], [DENIM, COAT], [scene("s1", "The viewer", 43, 51, "YSL_DENIM_LOOK")]),
    );
    open();
    const cards = screen.getAllByTestId("outfit-card");
    expect(cards[0].getAttribute("data-version")).toBe("2");
    expect(within(cards[0]).getByTestId("outfit-worn").textContent).toBe("worn in The viewer");
    expect(within(cards[1]).getByTestId("outfit-worn").textContent).toBe("worn by no scene yet");
    expect(
      within(cards[0])
        .getAllByTestId("outfit-piece")
        .map((p) => p.textContent),
    ).toEqual(["1. Trucker Jacket — French Black Denim", "2. Mick Long Jeans — Westwood Black"]);
    fireEvent.click(within(cards[0]).getAllByLabelText("Take off")[0]);
    expect(sb.saveEntity).toHaveBeenCalledWith(DENIM, { outfit: { garmentFeatureIds: ["jeans"] } });
    fireEvent.click(within(cards[0]).getByTestId("outfit-add-piece"));
    expect(sb.saveEntity).toHaveBeenCalledWith(DENIM, {
      outfit: { garmentFeatureIds: ["jacket", "jeans", "track"] },
    });
    fireEvent.change(within(cards[0]).getByTestId("outfit-description"), {
      target: { value: "jacket open" },
    });
    fireEvent.blur(within(cards[0]).getByTestId("outfit-description"));
    expect(sb.saveEntity).toHaveBeenCalledWith(DENIM, { description: "jacket open" });
    fireEvent.click(within(cards[1]).getByTestId("outfit-archive"));
    expect(sb.saveEntity).toHaveBeenCalledWith(COAT, { archived: true });
  });

  it("a piece that left the wardrobe is named as gone on the card", () => {
    show(<WardrobePanel />, controller([], [outfit("X", "Gone look", ["jacket", "vanished"])], []));
    open();
    expect(screen.getByTestId("outfit-piece-gone").textContent).toContain(
      "no longer in the wardrobe",
    );
    expect(screen.getAllByTestId("outfit-piece")[1].textContent).toContain(
      "no longer in the wardrobe",
    );
  });

  it("a scene row names its shots and saves its edits; a new scene needs a name and an end after its start", async () => {
    const boxes = [box("c012", 43, 47), box("c013", 47, 51)];
    const s1 = scene("s1", "The viewer", 43, 51, "YSL_DENIM_LOOK");
    const { sb } = show(<WardrobePanel />, controller(boxes, [DENIM, COAT], [s1]));
    open();
    const row = screen.getByTestId("scene-row");
    expect(within(row).getByTestId("scene-shots").textContent).toBe("shots 13, 14");
    fireEvent.change(within(row).getByTestId("scene-outfit"), {
      target: { value: "YSL_LEATHER_COAT" },
    });
    expect(sb.saveScene).toHaveBeenCalledWith(s1, { outfitKey: "YSL_LEATHER_COAT" });
    fireEvent.change(within(row).getByTestId("scene-end"), { target: { value: "58.8" } });
    fireEvent.blur(within(row).getByTestId("scene-end"));
    expect(sb.saveScene).toHaveBeenCalledWith(s1, { end: 58.8 });
    fireEvent.click(within(row).getByTestId("scene-remove"));
    expect(sb.removeScene).toHaveBeenCalledWith(s1);

    const add = screen.getByTestId("scene-new-add") as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("scene-new-name"), { target: { value: "Chicago" } });
    fireEvent.change(screen.getByTestId("scene-new-start"), { target: { value: "59" } });
    fireEvent.change(screen.getByTestId("scene-new-end"), { target: { value: "50" } });
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("scene-new-end"), { target: { value: "80" } });
    fireEvent.change(screen.getByTestId("scene-new-outfit"), {
      target: { value: "YSL_LEATHER_COAT" },
    });
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    await vi.waitFor(() =>
      expect(sb.createScene).toHaveBeenCalledWith({
        name: "Chicago",
        start: 59,
        end: 80,
        outfitKey: "YSL_LEATHER_COAT",
      }),
    );
  });

  it("the treatment's words propose scenes, resolved or not, and the director adopts them", () => {
    const boxes = [
      box("c012", 43, 47),
      box("c013", 47, 51),
      box("c023", 67, 71, { description: "specified YSL jacket" }),
    ];
    const { sb } = show(<WardrobePanel />, controller(boxes, [DENIM, COAT], []));
    open();
    const rows = screen.getAllByTestId("proposed-scene");
    expect(rows.map((r) => r.getAttribute("data-resolution"))).toEqual(["resolved", "unresolved"]);
    expect(rows[0].textContent).toContain("wears YSL denim look");
    expect(rows[1].textContent).toContain("no outfit of that name yet");
    fireEvent.click(screen.getByTestId("wardrobe-adopt-scenes"));
    expect(sb.adoptProposedScenes).toHaveBeenCalledWith(sb.proposedScenes);
  });

  it("a proposed stretch already adopted as a scene is not proposed again", () => {
    const boxes = [box("c012", 43, 47), box("c013", 47, 51)];
    show(
      <WardrobePanel />,
      controller(boxes, [DENIM], [scene("s1", "YSL denim look", 43, 51, "YSL_DENIM_LOOK")]),
    );
    open();
    expect(screen.queryByTestId("wardrobe-proposed")).toBeNull();
  });
});

describe("one shot's outfit", () => {
  const scenes = [
    scene("s1", "The viewer", 43, 59, "YSL_DENIM_LOOK"),
    scene("s2", "Chicago", 59, 80, "YSL_LEATHER_COAT"),
    scene("s3", "Later", 80, 90, null),
  ];

  it("inherits its scene's outfit and lists the pieces generation receives, in order", () => {
    const b = box("c012", 43, 47);
    show(<ShotOutfitEditor box={b} />, controller([b], [DENIM, COAT], scenes));
    const el = screen.getByTestId("shot-outfit");
    expect(el.getAttribute("data-outfit-key")).toBe("YSL_DENIM_LOOK");
    expect(el.getAttribute("data-outfit-source")).toBe("scene");
    expect(screen.getByTestId("shot-outfit-line").textContent).toContain(
      "YSL denim look v2 — inherited from the scene “The viewer”",
    );
    expect(screen.getByTestId("shot-outfit-line").textContent).toContain(
      "the treatment says “exact YSL denim look”",
    );
    expect(
      screen
        .getAllByTestId("shot-outfit-piece")
        .map((p) => [p.textContent, p.getAttribute("data-from")]),
    ).toEqual([
      ["1. Trucker Jacket — French Black Denim", "outfit"],
      ["2. Mick Long Jeans — Westwood Black", "outfit"],
    ]);
    expect(screen.queryByTestId("shot-outfit-flags")).toBeNull();
  });

  it("an exception is a mode and a chosen outfit, saved on the shot's record", () => {
    const b = box("c012", 43, 47);
    const { sb } = show(<ShotOutfitEditor box={b} />, controller([b], [DENIM, COAT], scenes));
    fireEvent.change(screen.getByTestId("shot-outfit-mode"), { target: { value: "exception" } });
    expect(sb.saveContinuity).toHaveBeenCalledWith(b, {
      outfit: { mode: "exception", key: "YSL_DENIM_LOOK" },
    });
    const chosen = box("c012", 43, 47, { outfitMode: "exception", outfitKey: "YSL_DENIM_LOOK" });
    const second = show(
      <ShotOutfitEditor box={chosen} />,
      controller([chosen], [DENIM, COAT], scenes),
    );
    const inSecond = within(second.container);
    fireEvent.change(inSecond.getByTestId("shot-outfit-key"), {
      target: { value: "YSL_LEATHER_COAT" },
    });
    expect(second.sb.saveContinuity).toHaveBeenCalledWith(chosen, {
      outfit: { mode: "exception", key: "YSL_LEATHER_COAT" },
    });
    fireEvent.change(inSecond.getByTestId("shot-outfit-mode"), { target: { value: "none" } });
    expect(second.sb.saveContinuity).toHaveBeenCalledWith(chosen, {
      outfit: { mode: "none", key: null },
    });
  });

  it("a scene that contradicts the treatment, or decides nothing, is said on the shot — never obeyed in silence", () => {
    const b = box("c017", 60, 64);
    show(<ShotOutfitEditor box={b} />, controller([b], [DENIM, COAT], scenes));
    expect(screen.getByTestId("shot-outfit").getAttribute("data-outfit-key")).toBe(
      "YSL_LEATHER_COAT",
    );
    const flags = screen.getAllByTestId("shot-outfit-flag");
    expect(
      flags.some(
        (f) =>
          f.getAttribute("data-level") === "warning" && f.textContent?.includes("YSL denim look"),
      ),
    ).toBe(true);

    const undecided = box("c030", 81, 85);
    const u = within(
      show(<ShotOutfitEditor box={undecided} />, controller([undecided], [DENIM, COAT], scenes))
        .container,
    );
    expect(u.getByTestId("shot-outfit-line").textContent).toContain(
      "the scene “Later” has no outfit decided",
    );
    expect(
      u.getAllByTestId("shot-outfit-flag").some((f) => f.getAttribute("data-level") === "warning"),
    ).toBe(true);
  });

  it("the shot's own pieces replace the outfit's, and go back to them", () => {
    const b = box("c012", 43, 47, { garments: ["track"] });
    const { sb } = show(<ShotOutfitEditor box={b} />, controller([b], [DENIM, COAT], scenes));
    expect(
      screen
        .getAllByTestId("shot-outfit-piece")
        .map((p) => [p.textContent, p.getAttribute("data-from")]),
    ).toEqual([["1. Track Jacket — Mastic Navy Stripe", "shot"]]);
    fireEvent.click(screen.getByTestId("shot-garments-clear"));
    expect(sb.saveContinuity).toHaveBeenCalledWith(b, { garments: [] });
    fireEvent.click(screen.getAllByTestId("shot-garment")[0]);
    expect(sb.saveContinuity).toHaveBeenCalledWith(b, { garments: ["track", "jacket"] });
  });

  it("an outdated picture is said, with the reason; a performance shot has no wardrobe editor", () => {
    const b = box("c012", 43, 47);
    show(
      <ShotOutfitEditor box={b} />,
      controller([b], [DENIM], scenes, {
        outfitOutdatedOf: () => "it was made with YSL denim look v1",
      }),
    );
    expect(screen.getByTestId("shot-outfit-outdated").textContent).toContain("YSL denim look v1");
    const perf = parseShotSpec({
      id: "c019",
      purpose: "he performs",
      shotType: "performance",
      kind: "performance",
      timeline: { start: 0, end: 4 },
    });
    const w = boxWrite({
      key: "c019",
      start: 0,
      end: 4,
      section: "hook",
      generated: perf,
      override: null,
      locked: false,
      origin: "treatment",
      history: [],
    });
    const pb = boxFromRow({
      id: "r_c019",
      project_id: "p1",
      shot_number: 1,
      ...w,
      updated_at: AT,
    } as BoxRow)!;
    const p = show(<ShotOutfitEditor box={pb} />, controller([pb], [DENIM], scenes));
    expect(within(p.container).queryByTestId("shot-outfit")).toBeNull();
  });
});
