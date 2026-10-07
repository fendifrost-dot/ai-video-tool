/**
 * The cast surfaces a director actually sees: the chips on a shot, the readiness notes before
 * generation, and the shot's cast editor — driven by a stand-in controller, so what is tested is
 * what can be seen and pressed.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { parseShotSpec } from "@/lib/treatment/shotSpec";
import { boxFromRow, boxWrite, type BoxRow, type StoryboardBox } from "@/lib/storyboard/boxes";
import { castProblems, resolveCast } from "@/lib/casting/cast";
import { entityFromRow, indexEntities, type EntityRow } from "@/lib/continuity/entities";
import type { CastOverride } from "@/lib/treatment/overrides";
import { CastChips, CastReadiness, ShotCastEditor } from "./Cast";
import { StoryboardProvider, type StoryboardController } from "./useStoryboardController";

const AT = "2026-10-07T12:00:00.000Z";

const row = (over: Partial<EntityRow> & { key: string }): EntityRow => ({
  id: `id-${over.key}`,
  project_id: "p1",
  variation_id: "v1",
  kind: "character",
  name: over.key,
  description: null,
  constraints: null,
  approved_asset_id: null,
  reference_asset_ids: null,
  archived: false,
  created_at: AT,
  updated_at: AT,
  ...over,
});

const FENDI = entityFromRow(
  row({
    key: "FENDI",
    name: "Fendi",
    description: "The artist.",
    cast_role: "primary_artist",
    identity_mode: "preserve",
    artist_id: "artist-1",
  }),
)!;
const DRIVER = entityFromRow(
  row({
    key: "DRIVER",
    name: "The driver",
    description: "Grey suit.",
    cast_role: "recurring",
    identity_mode: "recurring",
    approved_asset_id: "asset-driver",
  }),
)!;
const GUEST = entityFromRow(
  row({ key: "GUEST", name: "The guest", cast_role: "recurring", identity_mode: "preserve" }),
)!;

function box(spec: Record<string, unknown>): StoryboardBox {
  const w = boxWrite({
    key: "c001",
    start: 0,
    end: 4,
    section: "verse",
    generated: parseShotSpec({
      id: "c001",
      purpose: "a scene",
      timeline: { start: 0, end: 4 },
      ...spec,
    }),
    override: null,
    locked: false,
    origin: "treatment",
    history: [],
  });
  return boxFromRow({
    id: "r1",
    project_id: "p1",
    shot_number: 1,
    ...w,
    updated_at: AT,
  } as BoxRow)!;
}

/** Typed so `.mock.calls[n][1]` is the CastOverride the editor wrote, not an untyped tuple. */
const castMock = () =>
  vi.fn<(box: StoryboardBox, cast: CastOverride) => Promise<void>>(async () => undefined);

function controller(
  entities = [FENDI, DRIVER, GUEST],
  saveCast = castMock(),
): StoryboardController {
  const index = indexEntities(entities);
  return {
    projectId: "p1",
    entities,
    busyOf: () => null,
    entityBusyOf: () => null,
    entityUsage: new Map(),
    castOf: (b: StoryboardBox) => resolveCast(b.spec, index),
    castProblemsOf: (b: StoryboardBox) => castProblems(resolveCast(b.spec, index)),
    saveCast,
    createEntity: vi.fn(async () => null),
    saveEntity: vi.fn(async () => undefined),
  } as unknown as StoryboardController;
}

const show = (ui: React.ReactElement, c = controller()) =>
  render(<StoryboardProvider value={c}>{ui}</StoryboardProvider>);

describe("the chips on a shot", () => {
  it("names everyone cast, with the identity mode in force", () => {
    show(<CastChips box={box({ cast: { members: [{ key: "FENDI" }, { key: "DRIVER" }] } })} />);
    expect(screen.getByText("Fendi")).toBeInTheDocument();
    expect(screen.getByText("The driver")).toBeInTheDocument();
    expect(
      document.querySelector('[data-cast-key="FENDI"]')?.getAttribute("data-identity-mode"),
    ).toBe("preserve");
  });

  it("shows a cast key this variation does not have, rather than hiding it", () => {
    show(<CastChips box={box({ cast: { members: [{ key: "GHOST" }] } })} />);
    expect(screen.getByText(/GHOST — not cast in this variation/)).toBeInTheDocument();
  });

  it("distinguishes 'no people' and 'open casting' from each other", () => {
    show(<CastChips box={box({ cast: { none: true } })} />);
    expect(screen.getByText("No people")).toBeInTheDocument();

    show(<CastChips box={box({ cast: { open: true } })} />);
    expect(screen.getByText("Open casting")).toBeInTheDocument();
  });

  it("renders nothing for a shot that says nothing about people", () => {
    const { container } = show(<CastChips box={box({})} />);
    expect(container.querySelector('[data-testid="box-cast"]')).toBeNull();
  });
});

describe("what is said before anything is generated", () => {
  it("blocks a shot that must match a person it has no picture of", () => {
    show(<CastReadiness box={box({ cast: { members: [{ key: "GUEST" }] } })} />);
    const problem = document.querySelector('[data-problem-level="blocking"]');
    expect(problem?.textContent).toMatch(/no approved or reference picture/);
    expect(problem?.textContent).toMatch(/Approve a reference image/);
  });

  it("marks an uncast shot as unsaid rather than as an error — and still shows it", () => {
    show(<CastReadiness box={box({})} />);
    const problem = document.querySelector('[data-problem-level="unsaid"]');
    expect(problem?.textContent).toMatch(/not a decision/);
    expect(document.querySelector('[data-problem-level="blocking"]')).toBeNull();
  });

  it("says nothing at all when casting was decided on purpose", () => {
    const { container } = show(<CastReadiness box={box({ cast: { open: true } })} />);
    expect(container.querySelector('[data-testid="cast-readiness"]')).toBeNull();
  });

  it("does not block the artist, whose likeness lives on the artist record", () => {
    show(<CastReadiness box={box({ cast: { members: [{ key: "FENDI" }] } })} />);
    expect(document.querySelector('[data-problem-level="blocking"]')).toBeNull();
  });
});

describe("casting a shot", () => {
  it("puts someone in the shot without touching anybody else", () => {
    const saveCast = castMock();
    show(
      <ShotCastEditor box={box({ cast: { members: [{ key: "FENDI" }] } })} />,
      controller(undefined, saveCast),
    );

    fireEvent.change(screen.getByTestId("cast-add"), { target: { value: "DRIVER" } });
    expect(saveCast).toHaveBeenCalledTimes(1);
    const members = saveCast.mock.calls[0][1].members!;
    expect(members.map((m) => m.key)).toEqual(["FENDI", "DRIVER"]);
  });

  it("writes this shot's own direction for a person, not the character's", () => {
    const saveCast = castMock();
    show(
      <ShotCastEditor box={box({ cast: { members: [{ key: "DRIVER" }] } })} />,
      controller(undefined, saveCast),
    );

    const action = document.querySelector('[data-cast-field="DRIVER.action"]') as HTMLInputElement;
    fireEvent.blur(action, { target: { value: "holds the door" } });
    expect(saveCast.mock.calls[0][1].members![0].action).toBe("holds the door");
  });

  it("takes someone out of the shot", () => {
    const saveCast = castMock();
    show(
      <ShotCastEditor box={box({ cast: { members: [{ key: "FENDI" }, { key: "DRIVER" }] } })} />,
      controller(undefined, saveCast),
    );

    fireEvent.click(screen.getByLabelText("Take Fendi out of this shot"));
    expect(saveCast.mock.calls[0][1].members!.map((m) => m.key)).toEqual(["DRIVER"]);
  });

  it("marking 'no people' also clears open casting, so the two cannot both be on", () => {
    const saveCast = castMock();
    show(<ShotCastEditor box={box({ cast: { open: true } })} />, controller(undefined, saveCast));

    fireEvent.click(screen.getByTestId("cast-none"));
    expect(saveCast.mock.calls[0][1]).toEqual({ none: true, open: false });
  });

  it("offers an identity override for this shot only, defaulting to the character's own", () => {
    const saveCast = castMock();
    show(
      <ShotCastEditor box={box({ cast: { members: [{ key: "DRIVER" }] } })} />,
      controller(undefined, saveCast),
    );

    const select = document.querySelector(
      '[data-cast-field="DRIVER.identityMode"]',
    ) as HTMLSelectElement;
    expect(select.value).toBe("");
    fireEvent.change(select, { target: { value: "invent" } });
    expect(saveCast.mock.calls[0][1].members![0].identityMode).toBe("invent");
  });

  it("shows the readiness notes right there in the editor", () => {
    show(<ShotCastEditor box={box({ cast: { members: [{ key: "GUEST" }] } })} />);
    expect(document.querySelector('[data-problem-level="blocking"]')).not.toBeNull();
  });
});
