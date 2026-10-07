/**
 * Continuity as the director sees it: the project's entities (described once), a shot's references to them, and
 * what generating will take from them — said before anything is spent.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { parseShotSpec } from "@/lib/treatment/shotSpec";
import { boxFromRow, boxWrite, type BoxRow, type StoryboardBox } from "@/lib/storyboard/boxes";
import { entityUsage, indexEntities, resolveContinuity, type ContinuityEntity } from "@/lib/continuity/entities";
import type { MediaAsset } from "@/lib/storyboard/media";
import { ContinuityChips, ContinuityPanel, ShotContinuityEditor } from "./Continuity";
import { StoryboardProvider, type StoryboardController } from "./useStoryboardController";

const AT = "2026-10-03T12:00:00.000Z";
const entity = (over: Partial<ContinuityEntity> & Pick<ContinuityEntity, "kind" | "key" | "name">): ContinuityEntity => ({ id: `id_${over.key}`, projectId: "p1", variationId: "v1", description: "", constraints: "", approvedAssetId: null, referenceAssetIds: [], archived: false, createdAt: AT, updatedAt: AT, ...over });
const RUNWAY = entity({ kind: "location", key: "BLACK_RUNWAY", name: "Black Runway", description: "A long black runway between black walls.", approvedAssetId: "pic1", referenceAssetIds: ["pic1", "pic2"] });
const STREET = entity({ kind: "location", key: "WET_STREET", name: "Wet Street", description: "A narrow street at night after rain." });
const SEDAN = entity({ kind: "prop", key: "BLACK_SEDAN", name: "Black Sedan", description: "A black four-door sedan." });
const ICE = entity({ kind: "lighting", key: "BLACKOUT_ICE_KEY", name: "Blackout, ice key", description: "House lights off; only his stones glitter." });
const pic = (id: string): MediaAsset => ({ id, assetType: "reference_image", footageRole: null, bucket: "project-references", path: `u/p/${id}.png`, playback: null, name: `${id}.png`, mime: "image/png", isVideo: false, isImage: true, durationSeconds: null, shotId: null, sourceTool: "grok", providerJobId: null, createdAt: AT });

function box(key: string, shotType: "b_roll" | "performance", continuity: Record<string, unknown> = {}): StoryboardBox {
  const spec = parseShotSpec({ id: key, purpose: `scene ${key}`, shotType, kind: shotType === "performance" ? "performance" : "broll", timeline: { start: 0, end: 4 }, continuity });
  const w = boxWrite({ key, start: 0, end: 4, section: "hook", generated: spec, override: null, locked: false, origin: "treatment", history: [] });
  return boxFromRow({ id: `r_${key}`, project_id: "p1", shot_number: 1, ...w, updated_at: AT } as BoxRow)!;
}

function controller(boxes: StoryboardBox[], entities: ContinuityEntity[], over: Partial<StoryboardController> = {}): StoryboardController {
  const index = indexEntities(entities);
  const pictures = new Map([pic("pic1"), pic("pic2")].map((a) => [a.id, a]));
  const looks = [{ id: "look1", name: "Black suit", description: null }];
  return {
    boxes,
    entities,
    looks,
    continuityOf: (b: StoryboardBox) => resolveContinuity(b.spec, index, looks),
    entityUsage: entityUsage(boxes.map((b, i) => ({ number: i + 13, spec: b.spec }))),
    picturesOf: (e: ContinuityEntity) => [e.approvedAssetId, ...e.referenceAssetIds].filter((x, i, a): x is string => !!x && a.indexOf(x) === i).map((id) => pictures.get(id)!).filter(Boolean),
    urlFor: (a: MediaAsset) => `https://signed/${a.id}`,
    mediaOf: () => ({ items: [], showing: null }),
    busyOf: () => null,
    entityBusyOf: () => null,
    createEntity: vi.fn(async () => RUNWAY),
    saveEntity: vi.fn(async () => undefined),
    generateEntityPicture: vi.fn(),
    useShotImageFor: vi.fn(async () => undefined),
    saveContinuity: vi.fn(async () => undefined),
    ...over,
  } as unknown as StoryboardController;
}
const show = (ui: React.ReactNode, sb: StoryboardController) => ({ sb, ...render(<StoryboardProvider value={sb}>{ui}</StoryboardProvider>) });

describe("a shot's references, at a glance", () => {
  it("shows nothing on a shot that points at nothing", () => {
    const b = box("c001", "b_roll");
    show(<ContinuityChips box={b} />, controller([b], [RUNWAY]));
    expect(screen.queryByTestId("box-continuity")).toBeNull();
  });

  it("names the place, the props and the light — and a reference the project no longer has", () => {
    const b = box("c018", "b_roll", { location: "BLACK_RUNWAY", props: ["BLACK_SEDAN", "GONE_PROP"], lighting: "BLACKOUT_ICE_KEY" });
    show(<ContinuityChips box={b} />, controller([b], [RUNWAY, SEDAN, ICE]));
    const chips = screen.getByTestId("box-continuity");
    expect([...chips.querySelectorAll("[data-entity-kind]")].map((c) => [c.getAttribute("data-entity-kind"), c.getAttribute("data-entity-key")])).toEqual([
      ["location", "BLACK_RUNWAY"],
      ["prop", "BLACK_SEDAN"],
      ["lighting", "BLACKOUT_ICE_KEY"],
      ["missing", "GONE_PROP"],
    ]);
    expect(chips.textContent).toContain("Black Runway");
    expect(chips.textContent).toContain("GONE_PROP — not in this project");
  });
});

describe("pointing a shot at the project's entities", () => {
  it("saves each choice onto the shot's own record", () => {
    const b = box("c015", "performance", { location: "WET_STREET", props: ["BLACK_SEDAN"] });
    const { sb } = show(<ShotContinuityEditor box={b} />, controller([b], [RUNWAY, STREET, SEDAN, ICE]));
    fireEvent.change(screen.getByTestId("shot-continuity-location"), { target: { value: "BLACK_RUNWAY" } });
    expect(sb.saveContinuity).toHaveBeenLastCalledWith(b, { location: "BLACK_RUNWAY" });
    fireEvent.change(screen.getByTestId("shot-continuity-lighting"), { target: { value: "BLACKOUT_ICE_KEY" } });
    expect(sb.saveContinuity).toHaveBeenLastCalledWith(b, { lighting: "BLACKOUT_ICE_KEY" });
    // a prop is toggled; the one already on the shot comes off
    fireEvent.click(screen.getByTestId("shot-continuity-prop"));
    expect(sb.saveContinuity).toHaveBeenLastCalledWith(b, { props: [] });
    // the look is one of the artist's existing Looks
    fireEvent.change(screen.getByTestId("shot-continuity-look"), { target: { value: "look1" } });
    expect(sb.saveContinuity).toHaveBeenLastCalledWith(b, { look: "look1" });
    // "described by this shot" takes the reference away on purpose
    fireEvent.change(screen.getByTestId("shot-continuity-location"), { target: { value: "" } });
    expect(sb.saveContinuity).toHaveBeenLastCalledWith(b, { location: "" });
  });

  it("says what generating takes from the entities: a place with an approved picture, and one without", () => {
    const withPicture = box("c015", "performance", { location: "BLACK_RUNWAY" });
    const { unmount } = show(<ShotContinuityEditor box={withPicture} />, controller([withPicture], [RUNWAY, STREET]));
    expect(screen.getByTestId("shot-continuity-source").textContent).toContain("Restaging puts him in the approved picture of Black Runway — the same picture as every other shot set there.");
    unmount();
    const without = box("c016", "performance", { location: "WET_STREET" });
    show(<ShotContinuityEditor box={without} />, controller([without], [RUNWAY, STREET]));
    expect(screen.getByTestId("shot-continuity-source").textContent).toContain("Wet Street has no approved picture yet");
  });

  it("says where entities are made when the project has none", () => {
    const b = box("c001", "b_roll");
    show(<ShotContinuityEditor box={b} />, controller([b], [], { looks: [] } as Partial<StoryboardController>));
    expect(screen.getByTestId("shot-continuity").textContent).toContain("has no places, props or lighting states yet");
  });
});

describe("the project's continuity entities", () => {
  const boxes = [box("c013", "performance", { location: "BLACK_RUNWAY" }), box("c014", "b_roll", { location: "WET_STREET", props: ["BLACK_SEDAN"] }), box("c015", "performance", { location: "BLACK_RUNWAY" })];

  it("is closed until asked for, and says what the project has", () => {
    show(<ContinuityPanel />, controller(boxes, [RUNWAY, STREET, SEDAN, ICE]));
    expect(screen.getByTestId("continuity-panel").getAttribute("data-open")).toBe("false");
    expect(screen.getByTestId("continuity-summary").textContent).toBe("2 locations · 1 prop · 1 lighting state");
    expect(screen.queryByTestId("entity-card")).toBeNull();
  });

  it("shows each entity once: its words, its pictures, and the shots that point at it", () => {
    const { sb } = show(<ContinuityPanel />, controller(boxes, [RUNWAY, STREET, SEDAN, ICE]));
    fireEvent.click(screen.getByTestId("continuity-toggle"));
    const cards = screen.getAllByTestId("entity-card");
    expect(cards.map((c) => c.getAttribute("data-entity-key"))).toEqual(["BLACK_RUNWAY", "WET_STREET", "BLACK_SEDAN", "BLACKOUT_ICE_KEY"]);
    const runway = within(cards[0]);
    expect(runway.getByTestId("entity-key").textContent).toBe("BLACK_RUNWAY");
    expect((runway.getByTestId("entity-description") as HTMLTextAreaElement).value).toBe("A long black runway between black walls.");
    expect(runway.getByTestId("entity-usage").textContent).toBe("Used by shots 13, 15");
    // the approved picture is marked; pressing another approves that one
    const pictures = runway.getAllByTestId("entity-picture");
    expect(pictures.map((p) => p.getAttribute("data-approved"))).toEqual(["true", "false"]);
    fireEvent.click(pictures[1]);
    expect(sb.saveEntity).toHaveBeenCalledWith(RUNWAY, { approvedAssetId: "pic2" });
    // a picture can be looked at large before it is approved — and approved from there
    expect(screen.queryByTestId("entity-picture-large")).toBeNull();
    fireEvent.click(runway.getAllByTestId("entity-picture-look")[1]);
    expect(screen.getByTestId("entity-picture-large").getAttribute("data-asset-id")).toBe("pic2");
    (sb.saveEntity as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.click(screen.getByTestId("entity-picture-approve"));
    expect(sb.saveEntity).toHaveBeenCalledWith(RUNWAY, { approvedAssetId: "pic2" });
    expect(screen.queryByTestId("entity-picture-large")).toBeNull();
    // the approved one is looked at without an approve button
    fireEvent.click(runway.getAllByTestId("entity-picture-look")[0]);
    expect(screen.queryByTestId("entity-picture-approve")).toBeNull();
    fireEvent.click(screen.getByTestId("entity-picture-close"));
    expect(screen.queryByTestId("entity-picture-large")).toBeNull();
    // a place with no picture says what that means; a lighting state has no pictures at all
    expect(within(cards[1]).getByTestId("entity-no-picture").textContent).toContain("held by the description alone");
    expect(within(cards[3]).queryByTestId("entity-generate-picture")).toBeNull();
  });

  it("edits the canonical description in one place", () => {
    const { sb } = show(<ContinuityPanel />, controller(boxes, [RUNWAY]));
    fireEvent.click(screen.getByTestId("continuity-toggle"));
    expect((screen.getByTestId("entity-save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("entity-description"), { target: { value: "A long black runway, mirrored floor." } });
    fireEvent.click(screen.getByTestId("entity-save"));
    expect(sb.saveEntity).toHaveBeenCalledWith(RUNWAY, { name: "Black Runway", description: "A long black runway, mirrored floor.", constraints: "" });
  });

  it("adds an entity by name and asks before drawing its pictures", async () => {
    const { sb } = show(<ContinuityPanel />, controller(boxes, [RUNWAY]));
    fireEvent.click(screen.getByTestId("continuity-toggle"));
    fireEvent.click(screen.getByTestId("continuity-add-lighting"));
    fireEvent.change(screen.getByTestId("continuity-new-name"), { target: { value: "Blackout, ice key" } });
    fireEvent.click(screen.getByTestId("continuity-new-save"));
    await waitFor(() => expect(sb.createEntity).toHaveBeenCalledWith("lighting", "Blackout, ice key"));
    fireEvent.click(screen.getByTestId("entity-generate-picture"));
    // the controller owns the confirmation and the price; the panel only asks
    expect(sb.generateEntityPicture).toHaveBeenCalledWith(RUNWAY);
  });
});
