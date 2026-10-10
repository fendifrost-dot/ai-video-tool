import { describe, expect, it, vi } from "vitest";

// the generate module reaches the browser's Supabase client, which a test has no use for
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/worldBatch/browserDeps", () => ({ browserRunnerDeps: vi.fn() }));

import { castOf, linksOf, productionOf, treatmentClipToShotSpec, type TreatmentClip } from "@/lib/treatment/api";
import type { ContinuityEntity, ShotContinuity } from "@/lib/continuity/entities";
import { NO_CONTINUITY } from "@/lib/continuity/entities";
import { applyOverride, BLANK_OVERRIDE, boxFromRow, boxWrite, editedOverride, type BoxRow, type StoryboardBox } from "./boxes";
import { boxShot, previewStillRequest } from "./generate";
import { danglingLinks, linkPictureNeeds, linkPromptLines, linksOfBox } from "./links";
import { planStillReferences, referenceLegend, undeliveredProblem } from "./references";
import { actionIsPerforming, productionRoute } from "./route";

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
    expect(room).toContain("The screen in this picture (the monitor on the right) shows the picture of shot 1. What follows describes only what is on that screen, not the place, light or colour around it: A rider crosses a cleared route");
    expect(room).toContain("What this shot is inside of or opening onto is revealed by shot 6 (the control room is inside the SUV): Outside: the door opens from a luxury SUV");
    const outside = boxShot(byKey.get("c031")!, [], { linkLines: linkPromptLines(linksOfBox(byKey.get("c031")!, numbered)) }).prompt;
    expect(outside).toContain("This shot reveals what shot 5 was inside of or opening onto (the control room is inside the SUV) — that shot: A cramped broadcast control room");
  });
});

describe("references: the linked shot's picture, the place, exact garments — sent, capped, or said", () => {
  const place: ContinuityEntity = { id: "e1", projectId: "p1", variationId: "v-ib", kind: "location", key: "CORNER", name: "the Chicago corner", description: "a corner by the train", constraints: "", approvedAssetId: "asset-corner", referenceAssetIds: [], archived: false, createdAt: AT, updatedAt: AT, cast: null, outfit: null };
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
      ["garment", "g-coat"],
      ["place", "asset-corner"],
    ]);
    expect(plan.legend).toBe(referenceLegend(plan.sent));
    expect(plan.legend).toMatch(/^Reference pictures: <IMAGE_0> is the exact picture the screen shows \(shot 1\) — put this picture on the screen, as it is; <IMAGE_1> is a garment worn in this shot, black leather coat: reproduce it exactly/);
    expect(plan.legend).toContain("<IMAGE_2> is the place, the Chicago corner");
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
    expect(plan.sent.map((r) => r.id)).toEqual(["g1", "g2", "g3"]);
    expect(plan.notSent).toEqual([{ ref: expect.objectContaining({ id: "asset-corner" }), why: expect.stringContaining("takes 3 reference pictures") }]);
    // the place's words are in the prompt anyway: leaving its picture out is not a problem to raise
    expect(plan.problems).toEqual([]);
    const four = planStillReferences({ isPerformance: false, continuity: continuity(null), linkNeeds: [], garments: [{ id: "g1", onFile: { id: "g1", label: "trucker jacket" } }, { id: "g2", onFile: { id: "g2", label: "jeans" } }, { id: "g3", onFile: { id: "g3", label: "sneakers" } }, { id: "g4", onFile: { id: "g4", label: "belt" } }], cap: 3 });
    expect(four.problems).toEqual([expect.objectContaining({ level: "blocking", text: "belt is marked exact and does not fit in this request (3 pictures): it would be drawn from words.", fix: expect.stringContaining("untick") })]);
  });

  it("a required screen picture or an exact garment that overflows the cap BLOCKS the request — never dropped, never drawn from words", () => {
    // the viewer: the screen's picture, his identity, the exact jacket — and a second exact piece: four for three slots
    const screen = { link: { kind: "screen_shows", otherKey: "c008", other: { shotNumber: 8 } }, role: "screen", level: "blocking", still: { assetId: "asset-c008" } };
    const plan = planStillReferences({
      isPerformance: false,
      continuity: continuity(null),
      linkNeeds: [screen as never],
      garments: [{ id: "g1", onFile: { id: "g1", label: "Trucker Jacket — French Black Denim" } }, { id: "g2", onFile: { id: "g2", label: "Mick Long Jeans" } }],
      extra: [{ source: "project_asset", id: "asset-face", role: "cast", label: "Fendi" }],
      cap: 3,
    });
    expect(plan.sent.map((r) => r.role)).toEqual(["screen", "cast", "garment"]);
    expect(plan.notSent.map((n) => n.ref.label)).toEqual(["Mick Long Jeans"]);
    expect(plan.problems).toEqual([expect.objectContaining({ level: "blocking", text: expect.stringContaining("Mick Long Jeans is marked exact and does not fit") })]);
    // the screen itself past the cap is blocking too — never "something made up on the screen"
    const screenLast = planStillReferences({ isPerformance: false, continuity: continuity(null), linkNeeds: [screen as never], garments: [{ id: "g1", onFile: { id: "g1", label: "jacket" } }], extra: [{ source: "project_asset", id: "a", role: "cast", label: "Fendi" }, { source: "project_asset", id: "b", role: "cast", label: "The rider" }], cap: 2 });
    expect(screenLast.problems.filter((p) => p.level === "blocking").length).toBeGreaterThanOrEqual(1);
    expect(screenLast.problems.some((p) => p.level === "warning")).toBe(false);
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

  it("a rapping take is not a seated man: a take-based method on a shot where he does not perform is refused with the reason, and generate is not", () => {
    const seated = { hasTake: true, links: [], artist: { performs: false, action: "sitting, watching the television, composed" } };
    const spec = { ...byKey.get("c001")!.spec, production: { method: "restage" as const, note: "" } };
    const r = productionRoute(spec, seated);
    expect(r).toMatchObject({ method: "restage", verdict: "unsupported" });
    expect(r.limits).toEqual(["The take shows him performing; this shot has him sitting, watching the television, composed. It has to be drawn with his identity pictures (generate), not cut from the take."]);
    for (const method of ["footage", "composite", "edit_footage"] as const) expect(productionRoute({ ...spec, production: { method, note: "" } }, seated).verdict).toBe("unsupported");
    expect(productionRoute({ ...spec, production: { method: "generate", note: "" } }, seated)).toMatchObject({ verdict: "storyboard" });
    // performing, by type or by his action, keeps the take's routes
    expect(productionRoute(spec, { ...seated, artist: { performs: true, action: "rapping to camera" } })).toMatchObject({ method: "restage", verdict: "storyboard" });
    expect(actionIsPerforming("rapping directly to camera")).toBe(true);
    expect(actionIsPerforming("sitting, watching the television")).toBe(false);
    // not in the shot at all: nothing to refuse
    expect(productionRoute(spec, { hasTake: true, links: [], artist: null })).toMatchObject({ verdict: "storyboard" });
  });

  it("a shot that says nothing keeps the route its type always had", () => {
    expect(productionRoute(byKey.get("c001")!.spec, { hasTake: false, links: [] })).toMatchObject({ method: "generate", inferred: true, verdict: "storyboard" });
  });
});

describe("people cast in a shot reach its request as pictures (casting decides who; references.ts sends them)", () => {
  it("a cast identity picture is sent right after the linked picture, before garments and the place — and never with a performance plate", () => {
    const rider = { source: "project_asset" as const, id: "asset-rider", role: "cast" as const, label: "The rider" };
    const narrative = planStillReferences({ isPerformance: false, continuity: NO_CONTINUITY, linkNeeds: [], garments: [{ id: "g1", onFile: { id: "g1", label: "denim jacket" } }], extra: [rider], cap: 3 });
    expect(narrative.sent.map((r) => [r.role, r.label])).toEqual([
      ["cast", "The rider"],
      ["garment", "denim jacket"],
    ]);
    expect(narrative.legend).toContain("<IMAGE_0> is The rider: the same person");
    const plate = planStillReferences({ isPerformance: true, continuity: NO_CONTINUITY, linkNeeds: [], garments: [], extra: [rider], cap: 3 });
    expect(plate.sent).toEqual([]);
    expect(plate.notSent.map((n) => n.ref.label)).toEqual(["The rider"]);
  });
});

describe("the people the writer cast reach the saved shot", () => {
  it("a cast member the variation has survives write → row → reload; a made-up key does not", () => {
    const c = clip("c001", { cast: castOf({ members: [{ key: "THE_RIDER", action: "rides between walls of fire", placement: "centre", framing: "side-on" }, { key: "NOBODY", action: "", placement: "", framing: "" }], open: false, none: false }, new Set(["THE_RIDER", "FENDI"])) });
    const b = saved(c, 1);
    expect(b.spec.cast).toEqual({ members: [{ key: "THE_RIDER", action: "rides between walls of fire", placement: "centre", framing: "side-on", identityMode: null }], open: false, none: false });
    expect(saved(clip("c002", { cast: castOf({ members: [], open: false, none: true }, new Set()) }), 2).spec.cast).toEqual({ members: [], open: false, none: true });
  });
});

describe("a picture the shot cannot do without is never a quiet demotion", () => {
  const fendi = { source: "character_feature" as const, id: "face-1", role: "cast" as const, label: "Fendi" };
  it("a screen picture that does not fit the cap BLOCKS (the control-room monitors cannot show something made up)", () => {
    const screens = [1, 2, 3, 4].map((n) => ({ link: { kind: "screen_shows" as const, otherKey: `S${n}`, other: { shotNumber: n } }, role: "screen" as const, still: { assetId: `a${n}` } }));
    const plan = planStillReferences({ isPerformance: false, continuity: NO_CONTINUITY, linkNeeds: screens as never, garments: [], cap: 3 });
    expect(plan.sent.map((r) => r.id)).toEqual(["a1", "a2", "a3"]);
    expect(plan.notSent.map((n) => n.ref.id)).toEqual(["a4"]);
    expect(plan.problems).toEqual([expect.objectContaining({ level: "blocking", text: expect.stringContaining("shot 4) does not fit in this request (3 pictures)"), fix: expect.stringContaining("multi_shot") })]);
    // a garment behind a screen, a face and another garment: the fourth is a block, not a warning
    const full = planStillReferences({ isPerformance: false, continuity: NO_CONTINUITY, linkNeeds: [screens[0]] as never, garments: [{ id: "g1", onFile: { id: "g1", label: "jacket" } }, { id: "g2", onFile: { id: "g2", label: "jeans" } }], extra: [{ source: "character_feature", id: "face", role: "cast", label: "Fendi" }], cap: 3 });
    expect(full.sent.map((r) => r.role)).toEqual(["screen", "cast", "garment"]);
    expect(full.problems.map((p) => p.level)).toEqual(["blocking"]);
    expect(full.problems[0].text).toContain("jeans is marked exact");
  });

  it("a position to hold gives its place to a person or an exact garment, and is said in words — it never pushes one out and blocks the shot", () => {
    const position = { link: { kind: "match_position" as const, direction: "out" as const, otherKey: "c013", other: { id: "r13", key: "c013", shotNumber: 13, spec: {} as never }, note: "" }, role: "position" as const, level: "warning" as const, still: { assetId: "p13" } };
    const woman = { source: "project_asset" as const, id: "asset-woman", role: "cast" as const, label: "The woman" };
    const plan = planStillReferences({ isPerformance: false, continuity: NO_CONTINUITY, linkNeeds: [position], garments: [{ id: "coat", onFile: { id: "coat", label: "coat" } }], extra: [fendi, woman], cap: 3 });
    // without the rule the position took <IMAGE_0> and the coat, marked exact, blocked the shot
    expect(plan.sent.map((r) => [r.role, r.id])).toEqual([["cast", "face-1"], ["cast", "asset-woman"], ["garment", "coat"]]);
    expect(plan.notSent).toEqual([{ ref: expect.objectContaining({ role: "position", id: "p13" }), why: expect.stringContaining("asked for in words") }]);
    expect(plan.problems).toEqual([]);
    // with room for it, the position still leads: the sent order is the decisive order
    const roomy = planStillReferences({ isPerformance: false, continuity: NO_CONTINUITY, linkNeeds: [position], garments: [{ id: "coat", onFile: { id: "coat", label: "coat" } }], extra: [fendi, woman], cap: 5 });
    expect(roomy.sent.map((r) => r.role)).toEqual(["position", "cast", "cast", "garment"]);
    expect(roomy.legend).toContain("<IMAGE_0> is shot 13: keep the subject in the same place in the frame");
  });

  it("when the generator lists a larger model, only a picture the shot cannot be made without takes a place past the usual model's limit", () => {
    const place = { ...NO_CONTINUITY, location: { name: "The room", approvedAssetId: "asset-room" }, props: [{ name: "The CRT", approvedAssetId: "asset-crt" }] } as never;
    const woman = { source: "project_asset" as const, id: "asset-woman", role: "cast" as const, label: "The woman" };
    const garments = (ids: string[]) => ids.map((id) => ({ id, onFile: { id, label: id } }));
    // two people and a coat fit the usual model: the place takes no fourth picture, so the shot stays on that model
    const three = planStillReferences({ isPerformance: false, continuity: place, linkNeeds: [], garments: garments(["coat"]), extra: [fendi, woman], cap: 5, baseCap: 3 });
    expect(three.sent.map((r) => r.role)).toEqual(["cast", "cast", "garment"]);
    expect(three.notSent.map((n) => n.ref.role)).toEqual(["place", "prop"]);
    expect(three.problems).toEqual([]);
    // with one person, the place fills what the usual model still has room for — and stops there
    const roomy = planStillReferences({ isPerformance: false, continuity: place, linkNeeds: [], garments: garments(["coat"]), extra: [fendi], cap: 5, baseCap: 3 });
    expect(roomy.sent.map((r) => r.role)).toEqual(["cast", "garment", "place"]);
    // five required pictures go, on the larger model; a sixth still blocks
    const five = planStillReferences({ isPerformance: false, continuity: place, linkNeeds: [], garments: garments(["coat", "cap", "glasses"]), extra: [fendi, woman], cap: 5, baseCap: 3 });
    expect(five.sent.map((r) => r.id)).toEqual(["face-1", "asset-woman", "coat", "cap", "glasses"]);
    expect(five.problems).toEqual([]);
    const six = planStillReferences({ isPerformance: false, continuity: place, linkNeeds: [], garments: garments(["coat", "cap", "glasses", "trousers"]), extra: [fendi, woman], cap: 5, baseCap: 3 });
    expect(six.problems).toEqual([expect.objectContaining({ level: "blocking", text: expect.stringContaining("trousers is marked exact and does not fit in this request (5 pictures)") })]);
    // a generator with one model: the old behaviour, optional pictures fill to its limit
    const one = planStillReferences({ isPerformance: false, continuity: place, linkNeeds: [], garments: garments(["coat"]), extra: [fendi], cap: 3 });
    expect(one.sent.map((r) => r.role)).toEqual(["cast", "garment", "place"]);
  });

  it("an identity that does not fit the cap BLOCKS the shot (the still would draw a stranger)", () => {
    const plan = planStillReferences({
      isPerformance: false,
      continuity: NO_CONTINUITY,
      linkNeeds: [{ link: { kind: "screen_shows", direction: "out", otherKey: "c001", other: { id: "r1", key: "c001", shotNumber: 1, spec: {} as never }, note: "" }, role: "screen", level: "blocking", still: { assetId: "s1" } }],
      garments: [{ id: "g1", onFile: { id: "g1", label: "jacket" } }, { id: "g2", onFile: { id: "g2", label: "jeans" } }, { id: "g3", onFile: { id: "g3", label: "sneakers" } }],
      extra: [fendi],
      cap: 3,
    });
    // screen first, identity second, then the garments that fit — and the two exact garments that do not fit BLOCK
    expect(plan.sent.map((r) => r.role)).toEqual(["screen", "cast", "garment"]);
    expect(plan.problems.map((p) => p.level)).toEqual(["blocking", "blocking"]);
    expect(plan.problems.map((p) => p.text)).toEqual([expect.stringContaining("jeans is marked exact"), expect.stringContaining("sneakers is marked exact")]);
    // the same shot with one exact garment fits and is clean
    const fits = planStillReferences({ ...{ isPerformance: false, continuity: NO_CONTINUITY, cap: 3, extra: [fendi] }, linkNeeds: [], garments: [{ id: "g1", onFile: { id: "g1", label: "jacket" } }, { id: "g2", onFile: { id: "g2", label: "jeans" } }] });
    expect(fits.problems).toEqual([]);
    const tight = planStillReferences({ isPerformance: false, continuity: NO_CONTINUITY, linkNeeds: [], garments: [{ id: "g1", onFile: { id: "g1", label: "jacket" } }], extra: [fendi], cap: 1 });
    expect(tight.sent.map((r) => r.role)).toEqual(["cast"]);
    const noRoom = planStillReferences({ isPerformance: false, continuity: NO_CONTINUITY, linkNeeds: [], garments: [], extra: [fendi, { ...fendi, id: "face-2", label: "The rider" }], cap: 1 });
    expect(noRoom.problems).toEqual([expect.objectContaining({ level: "blocking", text: expect.stringContaining("The rider's identity picture does not fit") })]);
  });
  it("when the generator cannot take pictures, a shot that needs a screen picture, a garment or an identity is blocked, not logged", () => {
    expect(undeliveredProblem([fendi], true)).toBeNull();
    expect(undeliveredProblem([{ source: "project_asset", id: "p", role: "place", label: "the corner" }], false)).toBeNull();
    expect(undeliveredProblem([fendi], false)).toMatchObject({ level: "blocking", text: expect.stringContaining("Fendi — cast"), fix: expect.stringContaining("Nothing was generated") });
  });
});
