/**
 * Continuity entities: described once, pointed at by shots, and reused — the same words in every request and the
 * same picture wherever a picture of the place is an input.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/worldBatch/browserDeps", () => ({ browserRunnerDeps: vi.fn() }));
vi.mock("@/lib/queries/storyboard", () => ({}));

import { parseShotSpec, type ShotEvent } from "@/lib/treatment/shotSpec";
import { applyOverride, boxFromRow, boxWrite, machineContext, planSplitAtBeats, type BoxRow, type StoryboardBox } from "@/lib/storyboard/boxes";
import { eventClock, resolveEvents, splitEvents } from "@/lib/storyboard/events";
import { boxShot, entityShot, FULL_BLEED, NO_MARKS, pointsAtEntities, SUBJECT_FIRST } from "@/lib/storyboard/generate";
import { restageShot, restageTemporalPlan } from "@/lib/storyboard/restage";
import { temporalPlan } from "@/lib/storyboard/temporal";
import type { MediaAsset, TakeSync } from "@/lib/storyboard/media";
import {
  canonicalWords,
  continuityLines,
  continuitySource,
  entityFromRow,
  entityKey,
  entityUsage,
  indexEntities,
  entityPictureRefusal,
  referencePrompt,
  resolveContinuity,
  uniqueKey,
  withLightingStates,
  withReference,
  type ContinuityEntity,
  type EntityRow,
} from "./entities";

const AT = "2026-10-03T12:00:00.000Z";
const row = (over: Partial<EntityRow> & Pick<EntityRow, "kind" | "key" | "name">): EntityRow => ({ id: `id_${over.key}`, project_id: "p1", description: "", constraints: "", approved_asset_id: null, reference_asset_ids: [], archived: false, created_at: AT, updated_at: AT, ...over });
const RUNWAY = entityFromRow(row({ kind: "location", key: "BLACK_RUNWAY", name: "Black Runway", description: "A long black runway between black walls, a white centre line, rows of empty black chairs on both sides", constraints: "The centre line is always white", approved_asset_id: "asset_runway", reference_asset_ids: ["asset_runway", "asset_runway_b"] }))!;
const STREET = entityFromRow(row({ kind: "location", key: "WET_STREET", name: "Wet Street", description: "A narrow street at night after rain, sodium lamps, shuttered shopfronts." }))!;
const SEDAN = entityFromRow(row({ kind: "prop", key: "BLACK_SEDAN", name: "Black Sedan", description: "A black four-door sedan with tinted glass and chrome trim", approved_asset_id: "asset_sedan" }))!;
const NORMAL = entityFromRow(row({ kind: "lighting", key: "RUNWAY_NORMAL", name: "Runway, lights up", description: "Even white house light from above, the whole room visible" }))!;
const ICE = entityFromRow(row({ kind: "lighting", key: "BLACKOUT_ICE_KEY", name: "Blackout, ice key", description: "House lights off; the only light is the glitter off the stones he wears; the room is black" }))!;
const ALL = [RUNWAY, STREET, SEDAN, NORMAL, ICE];
const index = indexEntities(ALL);
const LOOKS = [{ id: "look1", name: "Black suit", description: "double-breasted, no shirt" }];

function box(key: string, over: { shotType?: "b_roll" | "performance"; continuity?: Record<string, unknown>; events?: ShotEvent[]; purpose?: string; start?: number; end?: number; environment?: { location: string; description: string } } = {}): StoryboardBox {
  const start = over.start ?? 60;
  const end = over.end ?? 64;
  const shotType = over.shotType ?? "b_roll";
  const spec = parseShotSpec({ id: key, purpose: over.purpose ?? "a ring on a marble console under one hard light", shotType, kind: shotType === "performance" ? "performance" : "broll", timeline: { start, end }, continuity: over.continuity ?? {}, events: over.events ?? [], ...(over.environment ? { environment: over.environment } : {}) });
  const w = boxWrite({ key, start, end, section: "hook", generated: spec, override: null, locked: false, origin: "treatment", history: [] });
  return boxFromRow({ id: `r_${key}`, project_id: "p1", shot_number: 1, ...w, updated_at: AT } as BoxRow)!;
}
const ev = (over: Partial<ShotEvent> & { at: number }): ShotEvent => ({ id: "", trigger: { kind: "time", ref: "" }, visual: "", camera: "", lighting: "", action: "", lightingState: null, effect: null, ...over });

describe("an entity is a record with an identity", () => {
  it("reads from its row, and only kinds that exist", () => {
    expect(RUNWAY).toMatchObject({ kind: "location", key: "BLACK_RUNWAY", approvedAssetId: "asset_runway", referenceAssetIds: ["asset_runway", "asset_runway_b"], archived: false });
    expect(entityFromRow(row({ kind: "weather", key: "RAIN", name: "Rain" }))).toBeNull();
  });

  it("gets a key from its name, unique in the project", () => {
    expect(entityKey("Paris Black Runway")).toBe("PARIS_BLACK_RUNWAY");
    expect(entityKey("  Café — fitting room #2 ")).toBe("CAFE_FITTING_ROOM_2");
    expect(uniqueKey("Black Runway", ["BLACK_RUNWAY"])).toBe("BLACK_RUNWAY_2");
    expect(uniqueKey("Black Runway", new Set(["BLACK_RUNWAY", "BLACK_RUNWAY_2"]))).toBe("BLACK_RUNWAY_3");
    expect(uniqueKey("!!!", [])).toBe("ENTITY");
  });

  it("keeps a new reference picture without doubles, and approves the first", () => {
    expect(withReference({ approvedAssetId: null, referenceAssetIds: [] }, "a")).toEqual({ referenceAssetIds: ["a"], approvedAssetId: "a" });
    expect(withReference({ approvedAssetId: "a", referenceAssetIds: ["a"] }, "b")).toEqual({ referenceAssetIds: ["a", "b"], approvedAssetId: "a" });
    expect(withReference({ approvedAssetId: "a", referenceAssetIds: ["a", "b"] }, "b", true)).toEqual({ referenceAssetIds: ["a", "b"], approvedAssetId: "b" });
  });
});

describe("a shot points at entities instead of describing them", () => {
  it("resolves its references — and says which it could not", () => {
    const b = box("c018", { continuity: { location: "BLACK_RUNWAY", props: ["BLACK_SEDAN", "A_DIAMOND_CHAIN"], lighting: "BLACK_RUNWAY" } });
    const c = resolveContinuity(b.spec, index, LOOKS);
    expect(c.location?.key).toBe("BLACK_RUNWAY");
    expect(c.props.map((p) => p.key)).toEqual(["BLACK_SEDAN"]);
    // a place is not a lighting state: pointing at one as the light is a broken reference, not a silent accept
    expect(c.lighting).toBeNull();
    expect(c.missing).toEqual(["A_DIAMOND_CHAIN", "BLACK_RUNWAY"]);
    expect(continuitySource(c).notes.join(" ")).toContain("A_DIAMOND_CHAIN, which this project does not have");
  });

  it("the look is the existing Look record, pointed at through the shot's wardrobe", () => {
    const b = box("c018");
    const w = applyOverride(b, { direction: null, cameraMotion: null, framing: null, transitionIn: null, requiredElements: null, notes: null, continuity: { location: "BLACK_RUNWAY", look: "look1" }, manual: ["continuity"] }, AT);
    expect(w.spec_json.continuity.location).toBe("BLACK_RUNWAY");
    expect(w.spec_json.wardrobe.lookId).toBe("look1");
    expect(resolveContinuity(w.spec_json, index, LOOKS).look).toEqual(LOOKS[0]);
    // taking a reference away is said on purpose, with an empty value
    const b2 = boxFromRow({ id: "r", project_id: "p1", shot_number: 1, ...w, updated_at: AT } as BoxRow)!;
    const w2 = applyOverride(b2, { ...b2.override!, continuity: { location: "", look: "" } }, AT);
    expect(w2.spec_json.continuity.location).toBeNull();
    expect(w2.spec_json.wardrobe.lookId).toBeNull();
  });

  it("knows which shots use each entity", () => {
    const usage = entityUsage([
      { number: 13, spec: box("a", { continuity: { location: "BLACK_RUNWAY" } }).spec },
      { number: 14, spec: box("b", { continuity: { location: "WET_STREET", props: ["BLACK_SEDAN"] } }).spec },
      { number: 18, spec: box("c", { continuity: { location: "BLACK_RUNWAY", lighting: "RUNWAY_NORMAL" }, events: [ev({ id: "e1", at: 1.2, lightingState: "BLACKOUT_ICE_KEY" })] }).spec },
    ]);
    expect(usage.get("BLACK_RUNWAY")).toEqual([13, 18]);
    expect(usage.get("BLACK_SEDAN")).toEqual([14]);
    expect(usage.get("BLACKOUT_ICE_KEY")).toEqual([18]);
  });
});

describe("shots that point at the same entity are generated from the same source", () => {
  const a = box("c013", { continuity: { location: "BLACK_RUNWAY" }, purpose: "white sneakers step onto the runway" });
  const b = box("c018", { continuity: { location: "BLACK_RUNWAY", props: ["BLACK_SEDAN"], lighting: "RUNWAY_NORMAL" }, purpose: "a sedan idles at the far end of the runway" });
  const other = box("c014", { continuity: { location: "WET_STREET" }, purpose: "rain on a windscreen" });
  const of = (x: StoryboardBox) => resolveContinuity(x.spec, index, LOOKS);

  it("the place's canonical words are in both requests, word for word", () => {
    const line = `The place — the same place in every shot set there: ${canonicalWords(RUNWAY)}`;
    expect(canonicalWords(RUNWAY)).toBe("A long black runway between black walls, a white centre line, rows of empty black chairs on both sides. The centre line is always white.");
    const pa = boxShot(a, [], { continuity: of(a) }).prompt;
    const pb = boxShot(b, [], { continuity: of(b) }).prompt;
    expect(pa).toContain(line);
    expect(pb).toContain(line);
    // and a shot set somewhere else carries that place's words, not these
    expect(boxShot(other, [], { continuity: of(other) }).prompt).not.toContain("black runway between black walls");
    // each still shows its own scene
    expect(pa).toContain("white sneakers");
    expect(pb).toContain("a sedan idles");
  });

  it("a cutaway set in a location says the place once — in the location's words — and is a picture of its own subject", () => {
    const wrote = box("c040", {
      continuity: { location: "BLACK_RUNWAY" },
      purpose: "White sneakers step onto the gloss black floor.",
      // what a writer puts in the shot's own place field: the entity, paraphrased
      environment: { location: "", description: "A long indoor runway at night with a glossy floor and seats on both sides." },
    });
    const p = boxShot(wrote, [], { continuity: of(wrote) }).prompt;
    expect(p).not.toContain("A long indoor runway at night with a glossy floor");
    expect(p.match(/black runway between black walls/g)).toHaveLength(1);
    // the subject leads, the place follows, and the request says which of the two the picture is of
    expect(p.indexOf("White sneakers")).toBeLessThan(p.indexOf("The place — the same place"));
    expect(p).toContain(SUBJECT_FIRST);
    // a cutaway that points at no location keeps its own words for the place
    const free = box("c041", { purpose: "Rain on a windscreen.", environment: { location: "", description: "A wet street at night under sodium lamps." } });
    const pf = boxShot(free, [], { continuity: of(free) }).prompt;
    expect(pf).toContain("A wet street at night under sodium lamps.");
    expect(pf).not.toContain(SUBJECT_FIRST);
    // and the place drawn for a performance shot is the whole place, not a subject in it
    const perf = box("c015", { shotType: "performance", continuity: { location: "BLACK_RUNWAY" } });
    expect(boxShot(perf, [], { continuity: of(perf) }).prompt).not.toContain(SUBJECT_FIRST);
  });

  it("a prop and a lighting state are carried the same way; the standing rules still close the request", () => {
    const p = boxShot(b, [], { continuity: of(b) }).prompt;
    expect(p).toContain("Black Sedan — the same object in every shot it is in: A black four-door sedan with tinted glass and chrome trim.");
    expect(p).toContain("The light: Even white house light from above, the whole room visible.");
    expect(p.endsWith(FULL_BLEED)).toBe(true);
    expect(p).toContain(NO_MARKS);
    expect(continuityLines(of(b))).toHaveLength(3);
  });

  it("a request built without the entities a shot points at is refused, not quietly rebuilt from prose", () => {
    expect(pointsAtEntities(a.spec)).toBe(true);
    expect(() => boxShot(a, [])).toThrow(/built without them/);
    // a shot that points at nothing is generated exactly as before
    const plain = box("c001");
    expect(pointsAtEntities(plain.spec)).toBe(false);
    expect(boxShot(plain, [])).toEqual(boxShot(plain, [], { continuity: resolveContinuity(plain.spec, index) }));
  });

  it("performance shots set in one place are drawn as THAT place, empty — from its words alone", () => {
    const p1 = box("c015", { shotType: "performance", continuity: { location: "BLACK_RUNWAY" }, purpose: "he performs on the runway, pointing at the camera" });
    const p2 = box("c017", { shotType: "performance", continuity: { location: "BLACK_RUNWAY" }, purpose: "he walks the runway toward the lens" });
    const s1 = boxShot(p1, [], { continuity: of(p1) });
    const s2 = boxShot(p2, [], { continuity: of(p2) });
    // the same picture request for the place, whatever each shot's own sentence says about him
    expect(s1.prompt).toBe(s2.prompt);
    expect(s1.prompt).toContain(canonicalWords(RUNWAY));
    expect(s1.prompt).not.toMatch(/pointing at the camera|walks the runway/);
    expect(s1.prompt).toContain("no person stands there");
  });

  it("the approved picture of the place is the one continuity source for restaging", () => {
    const p1 = box("c015", { shotType: "performance", continuity: { location: "BLACK_RUNWAY" } });
    const p2 = box("c017", { shotType: "performance", continuity: { location: "BLACK_RUNWAY", lighting: "RUNWAY_NORMAL" } });
    const src1 = continuitySource(of(p1), { forPlate: true });
    const src2 = continuitySource(of(p2), { forPlate: true });
    expect(src1.placeAssetId).toBe("asset_runway");
    expect(src2.placeAssetId).toBe("asset_runway");
    expect(src1.placeOf).toEqual({ key: "BLACK_RUNWAY", name: "Black Runway" });
    // a place with no approved picture says so instead of pretending to hold one
    const s = continuitySource(resolveContinuity(box("x", { continuity: { location: "WET_STREET" } }).spec, index));
    expect(s.placeAssetId).toBeNull();
    expect(s.notes[0]).toMatch(/Wet Street has no approved picture yet/);
    // a prop's picture is not claimed to steer the image model
    expect(continuitySource(of(b)).notes.join(" ")).toMatch(/reads only its description/);

    const take = { id: "take1", shows: "a dark coat" } as MediaAsset;
    const sync = { id: "s1", projectId: "p1", songAssetId: "song", performanceAssetId: "take1", offsetSeconds: 0, driftPpm: 0, method: "manual", status: "confirmed" } as TakeSync;
    const base = { lyricLines: [], source: { take, sync, takeIn: 60, takeOut: 64 }, sourcePath: "a.mp4", stillPath: "refs/runway.png", cut: { start: 60, seconds: 4 } };
    const r2 = restageShot({ ...base, box: p2, temporal: restageTemporalPlan(p2), continuity: of(p2) });
    expect(r2.shot.still_path).toBe("refs/runway.png");
    // the light the shot opens in rides with the camera sentence
    expect(r2.shot.angle).toContain("The light: Even white house light from above, the whole room visible.");
    expect(() => restageShot({ ...base, box: p1, temporal: restageTemporalPlan(p1) })).toThrow(/built without them/);
  });

  it("a rewrite is told the entities the shot is set in", () => {
    const c = of(b);
    const ctx = machineContext({ box: b, continuity: { location: { name: c.location!.name, words: canonicalWords(c.location!) }, props: c.props.map((p) => ({ name: p.name, words: canonicalWords(p) })), lighting: { name: c.lighting!.name, words: canonicalWords(c.lighting!) } } });
    expect(ctx.continuity?.place).toEqual({ name: "Black Runway", is: canonicalWords(RUNWAY) });
    expect(ctx.continuity?.props?.[0].name).toBe("Black Sedan");
    expect(machineContext({ box: box("c001") }).continuity).toBeUndefined();
  });
});

describe("a lighting state is one description, used by shots and by beats", () => {
  const EVENTS = [ev({ id: "e1", at: 1.2, lightingState: "BLACKOUT_ICE_KEY" }), ev({ id: "e2", at: 2.4, camera: "a slow push toward him begins" })];
  const clock = eventClock(null, null, ALL);

  it("a beat that switches to a state says the state's own words, and keeps pointing at it", () => {
    const r = resolveEvents(EVENTS, { start: 60, end: 64 }, clock);
    expect(r[0].lighting).toBe("House lights off; the only light is the glitter off the stones he wears; the room is black");
    expect(r[0].lightingFromState).toBe(true);
    expect(withLightingStates(EVENTS, index)[0].lighting).toBe(r[0].lighting);
    // what is STORED keeps the pointer, never a copy of the words — so editing the state changes every beat that uses it
    expect(splitEvents(r, 2).first[0]).toMatchObject({ lighting: "", lightingState: "BLACKOUT_ICE_KEY" });
    const edited = eventClock(null, null, [{ ...ICE, description: "Pitch black; only his chains glitter" }]);
    expect(resolveEvents(EVENTS, { start: 60, end: 64 }, edited)[0].lighting).toBe("Pitch black; only his chains glitter");
  });

  it("a beat's own words win over the state's", () => {
    const r = resolveEvents([ev({ id: "e1", at: 1, lightingState: "BLACKOUT_ICE_KEY", lighting: "one bulb swings" })], { start: 0, end: 4 }, clock);
    expect(r[0]).toMatchObject({ lighting: "one bulb swings" });
    expect(r[0].lightingFromState).toBeUndefined();
  });

  it("a beat that says a few words of its own AND switches to a state gives the model both: its words, then what the state is", () => {
    // as the treatment writer wrote the first lights-out beat: "the pool dies" says nothing about what the new light IS
    const DISCO = entityFromRow(row({ kind: "lighting", key: "DISCO", name: "Diamond disco light", description: "The room goes dark and one hard white beam strikes the mirror ball, which throws hundreds of small sharp points of white light drifting slowly across the floor, the walls and anyone standing there", constraints: "White light only, no colour" }))!;
    const c = eventClock(null, null, [DISCO]);
    const own = resolveEvents([ev({ id: "e1", at: 4.7, lightingState: "DISCO", lighting: "pool dies, only diamond points remain" })], { start: 0, end: 5.88 }, c);
    expect(own[0].stateWords).toBe(canonicalWords(DISCO));
    const plan = temporalPlan({ route: "seedance_ref", resolved: own, shotSeconds: 5.88 });
    expect(plan.mode === "timed_script" && plan.script).toBe(
      "Timed changes inside this shot, in seconds from its first frame. Each holds until the next; nothing else changes: from 4.7 s: light: pool dies, only diamond points remain — " +
        "The room goes dark and one hard white beam strikes the mirror ball, which throws hundreds of small sharp points of white light drifting slowly across the floor, the walls and anyone standing there. White light only, no colour.",
    );
    // the state's words are whole — longer than a beat's own phrase may be — and the same in every beat that switches to it
    const bare = resolveEvents([ev({ id: "e1", at: 1, lightingState: "DISCO" })], { start: 0, end: 4 }, c);
    const p2 = temporalPlan({ route: "seedance_ref", resolved: bare, shotSeconds: 4 });
    expect(p2.mode === "timed_script" && p2.script).toContain(`from 1.0 s: light: ${canonicalWords(DISCO)}`);
    // the record still stores only the pointer and the beat's own words
    expect(splitEvents(own, 2).second[0]).toMatchObject({ lighting: "pool dies, only diamond points remain", lightingState: "DISCO" });
    expect("stateWords" in splitEvents(own, 2).second[0]).toBe(false);
  });

  it("the timed script a model is given carries the state's words", () => {
    const plan = temporalPlan({ route: "seedance_ref", resolved: resolveEvents(EVENTS, { start: 60, end: 64 }, clock), shotSeconds: 4 });
    expect(plan.mode === "timed_script" && plan.script).toContain("from 1.2 s: light: House lights off; the only light is the glitter off the stones he wears; the room is black.");
  });

  it("a switch to a state is change to draw even with no words at hand — and is refused rather than sent empty", () => {
    const blind = resolveEvents([ev({ id: "e1", at: 1, lightingState: "NOT_ON_FILE" })], { start: 0, end: 4 }, clock);
    const plan = temporalPlan({ route: "seedance_ref", resolved: blind, shotSeconds: 4 });
    expect(plan.mode).toBe("refused");
    expect(plan.mode === "refused" && plan.reason).toMatch(/NOT_ON_FILE.*has no description in this project/);
  });

  it("split at the beats: the shot made from a state points at that state", () => {
    const b = box("c018", { continuity: { location: "BLACK_RUNWAY", lighting: "RUNWAY_NORMAL" }, events: EVENTS });
    const plan = planSplitAtBeats(b, ["c018"], AT, clock);
    expect(plan.first.spec_json.continuity).toMatchObject({ location: "BLACK_RUNWAY", lighting: "RUNWAY_NORMAL" });
    for (const w of plan.rest) expect(w.spec_json.continuity).toMatchObject({ location: "BLACK_RUNWAY", lighting: "BLACKOUT_ICE_KEY" });
  });
});

describe("an entity's own reference picture", () => {
  it("is drawn from its canonical words: a place empty, an object alone", () => {
    expect(referencePrompt(RUNWAY)).toContain("An empty set, photographed with nobody in it");
    expect(referencePrompt(RUNWAY)).toContain(canonicalWords(RUNWAY));
    expect(referencePrompt(SEDAN)).toContain("The object alone, whole and in focus");
    const shot = entityShot(RUNWAY, "16:9");
    expect(shot).toMatchObject({ id: "ent_BLACK_RUNWAY", aspect: "16:9", stills: 2 });
    expect(shot.prompt).toContain(NO_MARKS);
    expect(entityShot(SEDAN).aspect).toBe("1:1");
  });

  it("draws an invented cast member as one person, whole, upright", () => {
    const rider = { kind: "character" as const, name: "The rider", description: "A woman in a dark riding coat, hair tied back", constraints: "" };
    expect(referencePrompt(rider)).toContain("A casting reference picture of one person, standing alone");
    // the description's scenes say who she is, not what to draw: the picture is the person only
    expect(referencePrompt(rider)).toContain("that says who they are, not what to draw");
    expect(referencePrompt(rider)).toContain("no place, vehicle, animal, screen, monitor, fire, crowd or event from the description");
    expect(referencePrompt(rider)).toContain(canonicalWords(rider));
    expect(referencePrompt(rider)).toContain("nobody else in the picture");
    expect(entityShot({ ...SEDAN, kind: "character", key: "THE_RIDER", description: rider.description }).aspect).toBe("3:4");
  });

  it("is never drawn for a real person's likeness", () => {
    const cast = (identityMode: "preserve" | "recurring" | "invent", artistId: string | null = null) => ({
      kind: "character" as const,
      name: "X",
      cast: { role: "recurring" as const, identityMode, artistId },
    });
    expect(entityPictureRefusal(cast("preserve"))).toMatch(/real photographs/);
    expect(entityPictureRefusal(cast("recurring", "artist-1"))).toMatch(/artist record/);
    expect(entityPictureRefusal(cast("recurring"))).toBeNull();
    expect(entityPictureRefusal(cast("invent"))).toBeNull();
    expect(entityPictureRefusal(SEDAN)).toBeNull();
    expect(entityPictureRefusal(ICE)).toMatch(/no picture of its own/);
  });

  it("cannot be drawn from nothing, and a lighting state has none", () => {
    expect(() => referencePrompt({ kind: "location", name: "Fitting Room", description: "", constraints: "" })).toThrow(/no description to draw from/);
    expect(() => referencePrompt(ICE)).toThrow(/has no picture of its own/);
  });
});
