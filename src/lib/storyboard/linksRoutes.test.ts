import { describe, expect, it, vi } from "vitest";

// the generate module reaches the browser's Supabase client, which a test has no use for
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/worldBatch/browserDeps", () => ({ browserRunnerDeps: vi.fn() }));

import { linksOf, productionOf, treatmentClipToShotSpec, type TreatmentClip } from "@/lib/treatment/api";
import type { ContinuityEntity, ShotContinuity } from "@/lib/continuity/entities";
import { NO_CONTINUITY } from "@/lib/continuity/entities";
import { applyOverride, BLANK_OVERRIDE, boxFromRow, boxWrite, editedOverride, type BoxRow, type StoryboardBox } from "./boxes";
import { boxShot, previewStillRequest } from "./generate";
import { danglingLinks, linkPictureNeeds, linkPromptLines, linksOfBox } from "./links";
import { planStillReferences, referenceLegend } from "./references";
import { productionRoute } from "./route";

// A board shaped like a treatment that ties shots together (an opening show seen later on a monitor, a control room
// that turns out to be inside a car, a close-up whose effect happens inside his real footage, a coat the take does
// not show). Nothing here is the project's data: keys, words and ids are made up for the test.
const AT = "2026-10-07T00:00:00Z";
const grid = ["c001", "c002", "c010", "c020", "c030", "c031"];
const board = new Set(grid);

function clip(key: string, over: Partial<TreatmentClip> & { rawLinks?: unknown[]; rawProduction?: unknown } = {}): TreatmentClip {
  const { rawLinks, rawProduction, ...rest } = over;
  return {
    key,
    start: grid.indexOf(key) * 4,
    end: grid.indexOf(key) * 4 + 4,
    section: "verse",
    energy: "mid",
    shot_type: "b_roll",
    scene_description: `scene of ${key}`,
    camera_direction: "",
    lighting: "",
    wardrobe: "none",
    wardrobe_from: "",
    environment: "",
    recommended_tool: "grok",
    lyric_ref: null,
    priority: "normal",
    dependencies: [],
    continuity: { location: null, props: [], lighting: null, links: linksOf({ links: rawLinks ?? [] }, board, key) },
    production: productionOf(rawProduction),
    ...rest,
  };
}

/** Written → saved as a row → read back, as the storyboard does on every load. */
function saved(c: TreatmentClip, n: number, override: StoryboardBox["override"] = null): StoryboardBox {
  const spec = treatmentClipToShotSpec(c, { model: "test", generatedAt: AT, treatment: "5615:abc" });
  const w = boxWrite({ key: c.key, start: c.start, end: c.end, section: c.section, generated: spec, override, locked: false, origin: "treatment", history: [] });
  const row = JSON.parse(JSON.stringify({ id: `r-${c.key}`, project_id: "p1", variation_id: "v-ib", shot_number: n, ...w, updated_at: AT }));
  return boxFromRow(row as BoxRow)!;
}

const clips = [
  clip("c001", { scene_description: "A rider crosses a cleared route between walls of fire, side-on; the picture loses its colour." }),
  clip("c002", { shot_type: "narrative", scene_description: "Pull back: the same picture of the rider plays on a small black-and-white CRT; he watches.", rawLinks: [{ kind: "screen_shows", shot: "c001", note: "the CRT" }] }),
  clip("c010", { shot_type: "performance", wardrobe: "his exact leather coat", wardrobe_from: "treatment", scene_description: "He performs on a Chicago corner by the train.", rawProduction: { method: "restage" } }),
  clip("c020", { shot_type: "vfx", scene_description: "Extreme close-up: the grill's set sections rotate like reels and lock.", rawProduction: { method: "edit_footage", note: "the grill rotates inside his real mouth" } }),
  clip("c030", {
    shot_type: "narrative",
    scene_description: "A cramped broadcast control room; monitors show him performing and the burning show.",
    rawLinks: [
      { kind: "screen_shows", shot: "c001", note: "the monitor on the right" },
      { kind: "screen_shows", shot: "c099", note: "a key the writer made up" },
    ],
  }),
  clip("c031", { scene_description: "Outside: the door opens from a luxury SUV; a camera operator steps down.", rawLinks: [{ kind: "reveals", shot: "c030", note: "the control room is inside the SUV" }], rawProduction: { method: "multi_shot", note: "the interior only exists across the cut" } }),
];

const boxes = clips.map((c, i) => saved(c, i + 1));
const byKey = new Map(boxes.map((b) => [b.key, b]));
const numbered = boxes.map((b, i) => ({ ...b, shotNumber: i + 1 }));

describe("links written by the writer survive to the saved shot, and are read from both ends", () => {
  it("keeps links to shots of this board and drops a key the writer made up", () => {
    expect(byKey.get("c030")!.spec.continuity.links).toEqual([{ kind: "screen_shows", shot: "c001", note: "the monitor on the right" }]);
    expect(byKey.get("c031")!.spec.continuity.links).toEqual([{ kind: "reveals", shot: "c030", note: "the control room is inside the SUV" }]);
  });

  it("the shot shown on screens knows it is shown there; the reveal is known to the shot it reveals", () => {
    const shown = linksOfBox(byKey.get("c001")!, numbered);
    expect(shown.map((l) => [l.direction, l.kind, l.otherKey])).toEqual([
      ["in", "screen_shows", "c002"],
      ["in", "screen_shows", "c030"],
    ]);
    const room = linksOfBox(byKey.get("c030")!, numbered);
    expect(room.map((l) => [l.direction, l.kind, l.otherKey])).toEqual([
      ["out", "screen_shows", "c001"],
      ["in", "reveals", "c031"],
    ]);
    expect(danglingLinks(room)).toEqual([]);
  });

  it("each end's prompt says what it owes: the screen shows that shot's picture; the interior agrees with its exterior", () => {
    const room = boxShot(byKey.get("c030")!, [], { linkLines: linkPromptLines(linksOfBox(byKey.get("c030")!, numbered)) }).prompt;
    expect(room).toContain("The screen in this picture (the monitor on the right) shows the picture of shot 1: A rider crosses a cleared route");
    expect(room).toContain("What this shot is inside of or opening onto is revealed by shot 6 (the control room is inside the SUV): Outside: the door opens from a luxury SUV");
    const outside = boxShot(byKey.get("c031")!, [], { linkLines: linkPromptLines(linksOfBox(byKey.get("c031")!, numbered)) }).prompt;
    expect(outside).toContain("This shot reveals what shot 5 was inside of or opening onto (the control room is inside the SUV) — that shot: A cramped broadcast control room");
  });
});

describe("references: the linked shot's picture, the place, exact garments — sent, capped, or said", () => {
  const place: ContinuityEntity = { id: "e1", projectId: "p1", variationId: "v-ib", kind: "location", key: "CORNER", name: "the Chicago corner", description: "a corner by the train", constraints: "", approvedAssetId: "asset-corner", referenceAssetIds: [], archived: false, createdAt: AT, updatedAt: AT, cast: null };
  const continuity = (location: ContinuityEntity | null): ShotContinuity => ({ ...NO_CONTINUITY, location });

  it("a screen shot whose source shot has no image yet is blocked before any spend", () => {
    const needs = linkPictureNeeds(linksOfBox(byKey.get("c030")!, numbered)).map((n) => ({ ...n, still: null }));
    const plan = planStillReferences({ isPerformance: false, continuity: continuity(null), linkNeeds: needs, garments: [], cap: 3 });
    expect(plan.sent).toEqual([]);
    expect(plan.problems).toEqual([expect.objectContaining({ level: "blocking", text: expect.stringContaining("shows shot 1, and shot 1 has no image yet") })]);
  });

  it("with the source image chosen, it goes first, named as what the screen shows", () => {
    const needs = linkPictureNeeds(linksOfBox(byKey.get("c030")!, numbered)).map((n) => ({ ...n, still: { assetId: "asset-c001-still" } }));
    const plan = planStillReferences({ isPerformance: false, continuity: continuity(place), linkNeeds: needs, garments: [{ id: "g-coat", onFile: { id: "g-coat", label: "black leather coat" } }], cap: 3 });
    expect(plan.sent.map((r) => [r.role, r.id])).toEqual([
      ["screen", "asset-c001-still"],
      ["place", "asset-corner"],
      ["garment", "g-coat"],
    ]);
    expect(plan.legend).toBe(referenceLegend(plan.sent));
    expect(plan.legend).toMatch(/^Reference pictures: <IMAGE_0> is the exact picture the screen shows \(shot 1\) — put this picture on the screen, as it is; <IMAGE_1> is the place, the Chicago corner/);
    expect(plan.legend).toContain("<IMAGE_2> is a garment worn in this shot, black leather coat: reproduce it exactly");
  });

  it("over the endpoint's limit the rest are NOT dropped silently: each is listed with why, and a garment left out is a warning", () => {
    const plan = planStillReferences({
      isPerformance: false,
      continuity: continuity(place),
      linkNeeds: [],
      garments: [
        { id: "g1", onFile: { id: "g1", label: "trucker jacket" } },
        { id: "g2", onFile: { id: "g2", label: "jeans" } },
        { id: "g3", onFile: { id: "g3", label: "sneakers" } },
      ],
      cap: 3,
    });
    expect(plan.sent.map((r) => r.id)).toEqual(["asset-corner", "g1", "g2"]);
    expect(plan.notSent).toEqual([{ ref: expect.objectContaining({ id: "g3" }), why: expect.stringContaining("takes 3 reference pictures") }]);
    expect(plan.problems).toEqual([expect.objectContaining({ level: "warning", text: "sneakers does not fit in this request: it is described in words only." })]);
  });

  it("a garment id that is not in the wardrobe is blocking — never invented, never replaced", () => {
    const plan = planStillReferences({ isPerformance: false, continuity: continuity(null), linkNeeds: [], garments: [{ id: "gone", onFile: null }], cap: 3 });
    expect(plan.problems[0]).toMatchObject({ level: "blocking" });
  });

  it("a performance still is the empty place: garments and people are recorded as not sent, the place is sent", () => {
    const plan = planStillReferences({
      isPerformance: true,
      continuity: continuity(place),
      linkNeeds: [],
      garments: [{ id: "g-coat", onFile: { id: "g-coat", label: "black leather coat" } }],
      extra: [{ source: "project_asset", id: "cast-1", role: "cast", label: "the rider" }],
      cap: 3,
    });
    expect(plan.sent.map((r) => r.role)).toEqual(["place"]);
    expect(plan.notSent.map((n) => n.ref.role)).toEqual(["garment", "cast"]);
  });
});

describe("the request a shot would send — built, not sent — carries what it was given", () => {
  it("garments chosen by the director survive save and reload and reach the request, legend and all", () => {
    const b = byKey.get("c002")!;
    const next = { ...BLANK_OVERRIDE, continuity: { garments: ["g-denim-jacket", "g-denim-jeans"] } };
    const w = applyOverride(b, editedOverride(b.override, next), AT, "edit");
    const reloaded = boxFromRow(JSON.parse(JSON.stringify({ id: b.id, project_id: "p1", variation_id: "v-ib", shot_number: 2, ...w, updated_at: AT })) as BoxRow)!;
    expect(reloaded.spec.wardrobe.garments).toEqual(["g-denim-jacket", "g-denim-jeans"]);
    expect(reloaded.spec.continuity.links).toEqual([{ kind: "screen_shows", shot: "c001", note: "the CRT" }]);

    const plan = planStillReferences({
      isPerformance: false,
      continuity: NO_CONTINUITY,
      linkNeeds: linkPictureNeeds(linksOfBox(reloaded, numbered)).map((n) => ({ ...n, still: { assetId: "asset-c001-still" } })),
      garments: reloaded.spec.wardrobe.garments.map((id) => ({ id, onFile: { id, label: id === "g-denim-jacket" ? "denim trucker jacket" : "denim jeans" } })),
      cap: 3,
    });
    const delivered = previewStillRequest(reloaded, [], { linkLines: linkPromptLines(linksOfBox(reloaded, numbered)), references: { sent: plan.sent, notSent: plan.notSent, legend: plan.legend, delivered: true } });
    expect(delivered.body.references).toEqual([
      { source: "project_asset", id: "asset-c001-still", role: "screen", label: "shot 1" },
      { source: "character_feature", id: "g-denim-jacket", role: "garment", label: "denim trucker jacket" },
      { source: "character_feature", id: "g-denim-jeans", role: "garment", label: "denim jeans" },
    ]);
    expect(String(delivered.body.prompt)).toContain("The screen in this picture (the CRT) shows the picture of shot 1");
    expect(String(delivered.body.prompt).endsWith(plan.legend)).toBe(true);
    expect(delivered.job.variation_id).toBe("v-ib");

    // a generator that does not take pictures: nothing is sent, the legend is not in the prompt, and the job says why
    const undelivered = previewStillRequest(reloaded, [], { references: { sent: plan.sent, notSent: plan.notSent, legend: plan.legend, delivered: false } });
    expect(undelivered.body.references).toBeUndefined();
    expect(String(undelivered.body.prompt)).not.toContain("<IMAGE_0>");
    expect((undelivered.job.references as { notSent: { why: string }[] }).notSent).toHaveLength(3);
    expect((undelivered.job.references as { notSent: { why: string }[] }).notSent[0].why).toContain("not deployed");
  });
});

describe("each shot is routed by how it has to be made — a method the app cannot do is said, not swapped", () => {
  const take = { hasTake: true, links: [] };
  it("a performance the treatment dresses in a coat the take does not show is not restaged in the take's clothes", () => {
    const r = productionRoute(byKey.get("c010")!.spec, take);
    expect(r).toMatchObject({ method: "restage", inferred: false, verdict: "elsewhere" });
    expect(r.limits.join(" ")).toContain("keeps the clothes of the take");
    expect(r.where).toContain("Garment lane");
  });

  it("an effect inside his real footage is a video edit, made outside the storyboard", () => {
    expect(productionRoute(byKey.get("c020")!.spec, take)).toMatchObject({ method: "edit_footage", verdict: "elsewhere" });
    expect(productionRoute(byKey.get("c020")!.spec, { hasTake: false, links: [] })).toMatchObject({ verdict: "unsupported" });
  });

  it("a moment made across a cut is made on the storyboard when the cut is linked, and refused when it is not", () => {
    const outside = byKey.get("c031")!;
    expect(productionRoute(outside.spec, { hasTake: false, links: linksOfBox(outside, numbered) })).toMatchObject({ method: "multi_shot", verdict: "storyboard" });
    expect(productionRoute(outside.spec, { hasTake: false, links: [] })).toMatchObject({ verdict: "unsupported" });
  });

  it("a shot that says nothing keeps the route its type always had", () => {
    expect(productionRoute(byKey.get("c001")!.spec, { hasTake: false, links: [] })).toMatchObject({ method: "generate", inferred: true, verdict: "storyboard" });
  });
});
