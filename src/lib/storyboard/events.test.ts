/**
 * Change inside a shot: the event model, where an event sits on the song, what the shot is stretch by stretch, the
 * effects as arithmetic, and what generating does with a shot that changes — on every route.
 *
 * The fixture is one shot that goes: the room as lit → the lights die on a sung phrase → what the subject wears
 * becomes the light and the camera starts in. Nothing here knows any project.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/worldBatch/browserDeps", () => ({ browserRunnerDeps: vi.fn() }));
vi.mock("@/lib/queries/storyboard", () => ({}));

import type { LyricLine } from "@/lib/lyrics/lyricsForShot";
import { parseShotSpec, SHOT_EVENT_PHRASE_MAX, SHOT_EVENTS_MAX, type ShotEvent } from "@/lib/treatment/shotSpec";
import { applyShotOverride } from "@/lib/treatment/overrides";
import {
  beatsInShot,
  drawnFacets,
  effectKeys,
  effectOf,
  eventNotes,
  eventStates,
  isDirected,
  isAsFilmed,
  mergeEvents,
  pictureAt,
  pictureFilter,
  resolveEvents,
  sanitizeEvents,
  splitEvents,
  wordsInShot,
  type EventClock,
} from "./events";
import { assertPlanCovers, beatLines, orderedScript, ROUTE_TEMPORAL, stateScene, temporalPlan, timedScript, timingSaid, type TemporalRoute } from "./temporal";
import { applyOverride, boxFromRow, boxWrite, hasDirectedChange, machineContext, parseBoxOverride, planMerge, planSplit, planSplitAtBeats, rewrittenOverride, sceneOf, type BoxRow, type StoryboardBox } from "./boxes";
import { clipShot, clipTemporalPlan, imageTemporalPlan } from "./generate";
import { restageShot, restageTemporalPlan } from "./restage";
import { buildTimeline, type MediaAsset, type TakeSync } from "./media";
import { motionPrompt } from "@/lib/worldBatch";

const AT = "2026-10-03T12:00:00.000Z";
const ev = (over: Partial<ShotEvent> & { at: number }): ShotEvent => ({ id: "", trigger: { kind: "time", ref: "" }, visual: "", camera: "", lighting: "", action: "", lightingState: null, effect: null, ...over });

/** A shot 60.00–64.00 with three beats: a sung trigger, a light change with an effect, then light + camera. */
/** The change is in the FOOTAGE: the lights die on a sung phrase, then what he wears is the light and the camera starts in. */
const EVENTS: ShotEvent[] = [
  ev({ id: "e1", at: 1.2, trigger: { kind: "lyric", ref: "lights out" }, lighting: "the house lights die" }),
  ev({ id: "e2", at: 2.4, lighting: "the stones he wears are the only light", camera: "a slow push toward him begins" }),
];
/** The same moment made by the EDIT: a blackout effect on the sung phrase (its words say what it is), then the camera. */
const EDIT_EVENTS: ShotEvent[] = [
  ev({ id: "e1", at: 1.2, trigger: { kind: "lyric", ref: "lights out" }, lighting: "the house lights die", effect: { type: "blackout", seconds: null, level: null } }),
  ev({ id: "e2", at: 2.4, camera: "a slow push toward him begins" }),
];
const LINES: LyricLine[] = [
  {
    lineIndex: 7,
    section: "hook",
    text: "then it goes lights out again",
    start: 60.2,
    end: 63.1,
    confidence: 1,
    words: [
      { w: "then", start: 60.2, end: 60.4 },
      { w: "it", start: 60.4, end: 60.6 },
      { w: "goes", start: 60.6, end: 61.0 },
      { w: "Lights", start: 61.31, end: 61.6 },
      { w: "out,", start: 61.6, end: 62.0 },
      { w: "again", start: 62.5, end: 63.1 },
    ],
  },
];
const CLOCK: EventClock = { lyricLines: LINES, beats: [59.5, 60.0, 60.5, 61.0, 61.5, 62.0, 62.5, 63.0, 63.5, 64.0] };

function box(events: ShotEvent[] = EVENTS, over: { start?: number; end?: number; shotType?: "b_roll" | "performance"; key?: string; id?: string } = {}): StoryboardBox {
  const start = over.start ?? 60;
  const end = over.end ?? 64;
  const shotType = over.shotType ?? "b_roll";
  const key = over.key ?? "c018";
  const spec = parseShotSpec({ id: key, purpose: "a runway under full house lights, he walks toward the camera", shotType, kind: shotType === "performance" ? "performance" : "broll", timeline: { start, end }, events });
  const w = boxWrite({ key, start, end, section: "hook", generated: spec, override: null, locked: false, origin: "treatment", history: [] });
  return boxFromRow({ id: over.id ?? "r18", project_id: "p1", shot_number: 18, ...w, updated_at: AT } as BoxRow)!;
}

describe("a shot's timed events are part of the one shot record", () => {
  it("a shot with none is exactly what it was", () => {
    const spec = parseShotSpec({ id: "c001", purpose: "a ring on marble", shotType: "b_roll", kind: "broll", timeline: { start: 0, end: 4 } });
    expect(spec.events).toEqual([]);
    expect(spec.continuity).toEqual({ location: null, props: [], lighting: null, links: [] });
    expect(hasDirectedChange(spec)).toBe(false);
  });

  it("survives the round trip through the row", () => {
    const b = box();
    expect(b.spec.events.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(b.spec.events[0]).toMatchObject({ at: 1.2, trigger: { kind: "lyric", ref: "lights out" }, lighting: "the house lights die", effect: null });
    expect(box(EDIT_EVENTS).spec.events[0].effect).toMatchObject({ type: "blackout" });
    expect(hasDirectedChange(b.spec)).toBe(true);
  });

  it("keeps only events that say something, as phrases, in time order, with unique ids", () => {
    const out = sanitizeEvents(
      [
        { at: 3, camera: "x".repeat(400) },
        { at: 1, lighting: "  the   lights\n die " },
        { at: 2 }, // says nothing
        { at: 9, action: "he stops", id: "e1" },
        { at: 0.5, effect: { type: "sparkle" } }, // not an effect the edit knows: nothing left of it
        { at: 0.2, trigger: { kind: "lyric", ref: "" }, effect: { type: "flash", seconds: 0.1 } },
        "nonsense",
      ],
      4,
    );
    expect(out.map((e) => e.at)).toEqual([0.2, 1, 3, 3.95]);
    expect(out[0].trigger).toEqual({ kind: "time", ref: "" });
    expect(out[1].lighting).toBe("the lights die");
    expect(out[2].camera).toHaveLength(SHOT_EVENT_PHRASE_MAX);
    expect(new Set(out.map((e) => e.id)).size).toBe(4);
    expect(sanitizeEvents(Array.from({ length: 30 }, (_, i) => ({ at: i / 10, action: "a" })))).toHaveLength(SHOT_EVENTS_MAX);
    expect(sanitizeEvents("no")).toEqual([]);
  });

  it("the director's list replaces the generated one, and an empty list means the shot does not change", () => {
    const b = box();
    const mine = [ev({ id: "e1", at: 0.8, action: "he looks up" })];
    const none = { specId: b.key, direction: null, cameraMotion: null, framing: null, transitionIn: null, requiredElements: null, notes: null };
    expect(applyShotOverride(b.generated, { ...none, events: mine }).events).toEqual(mine);
    expect(applyShotOverride(b.generated, { ...none, events: [] }).events).toEqual([]);
    // an override that says nothing about events leaves them
    expect(applyShotOverride(b.generated, { ...none, direction: "another scene" }).events).toHaveLength(2);
    // and it is stored and read back as his
    const w = applyOverride(b, { ...(b.override ?? {}), events: mine, manual: ["events"] } as never, AT);
    expect(parseBoxOverride(w.override_json)?.events).toEqual(mine);
    expect(w.spec_json.events).toEqual(mine);
  });

  it("a rewrite may write the events, but never over the ones the director set", () => {
    const written = [ev({ id: "e1", at: 2, lighting: "everything goes red" })];
    expect(rewrittenOverride(null, { direction: "x", events: written }).events).toEqual(written);
    const his = { direction: null, cameraMotion: null, framing: null, transitionIn: null, requiredElements: null, notes: null, events: EVENTS, manual: ["events" as const] };
    expect(rewrittenOverride(his, { direction: "x", events: written }).events).toEqual(EVENTS);
    // a rewrite that says nothing about events leaves what was there
    expect(rewrittenOverride({ ...his, manual: [] }, { direction: "x" }).events).toEqual(EVENTS);
  });

  it("tells a writer that the director's beats are locked", () => {
    const b = box();
    const mine = boxFromRow({ id: "r18", project_id: "p1", shot_number: 18, ...applyOverride(b, { direction: null, cameraMotion: null, framing: null, transitionIn: null, requiredElements: null, notes: null, events: EVENTS, manual: ["events"] }, AT), updated_at: AT } as BoxRow)!;
    const ctx = machineContext({ box: mine, boxes: [mine], lyricLines: LINES, treatment: "", assets: [] } as never);
    expect(JSON.stringify(ctx)).toContain("timed_events");
  });
});

describe("an event sits on the song, not on a copy of it", () => {
  it("a typed time is its offset", () => {
    const [e] = resolveEvents([ev({ id: "e1", at: 2.4, camera: "push in" })], { start: 60, end: 64 }, CLOCK);
    expect(e).toMatchObject({ offset: 2.4, songTime: 62.4, placedBy: "time" });
  });

  it("a lyric trigger is where the words are sung, whatever offset was stored", () => {
    const r = resolveEvents(EVENTS, { start: 60, end: 64 }, CLOCK);
    expect(r[0]).toMatchObject({ id: "e1", offset: 1.31, songTime: 61.31, placedBy: "lyric" });
    // the lyric timing moves; the event moves with it, with nothing rewritten
    const later = [{ ...LINES[0], words: LINES[0].words.map((w) => ({ ...w, start: w.start + 0.4, end: w.end + 0.4 })) }];
    expect(resolveEvents(EVENTS, { start: 60, end: 64 }, { lyricLines: later })[0].offset).toBeCloseTo(1.71, 3);
  });

  it("matches the words as sung: case, punctuation and apostrophes do not matter", () => {
    const r = resolveEvents([ev({ id: "e1", at: 0, trigger: { kind: "lyric", ref: "LIGHTS OUT!" }, action: "a" })], { start: 60, end: 64 }, CLOCK);
    expect(r[0].placedBy).toBe("lyric");
  });

  it("a beat trigger is the nth beat inside the shot", () => {
    const r = resolveEvents([ev({ id: "e1", at: 0, trigger: { kind: "beat", ref: "3" }, action: "he turns" })], { start: 60, end: 64 }, CLOCK);
    expect(r[0]).toMatchObject({ offset: 1, songTime: 61, placedBy: "beat" });
    expect(beatsInShot(CLOCK.beats, { start: 60, end: 64 }).map((b) => b.offset)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  });

  it("says so when what it hangs on is not in the shot, and holds its stored time", () => {
    const r = resolveEvents([ev({ id: "e1", at: 1.2, trigger: { kind: "lyric", ref: "never sung" }, action: "a" }), ev({ id: "e2", at: 2, trigger: { kind: "beat", ref: "40" }, action: "b" })], { start: 60, end: 64 }, CLOCK);
    expect(r.map((e) => [e.offset, e.placedBy])).toEqual([[1.2, "fallback"], [2, "fallback"]]);
    // with no lyric timing at all the same holds
    expect(resolveEvents(EVENTS, { start: 60, end: 64 }, {})[0]).toMatchObject({ offset: 1.2, placedBy: "fallback" });
  });

  it("offers the words sung in the shot as places to hang a beat", () => {
    const w = wordsInShot(LINES, { start: 60, end: 64 });
    expect(w.find((x) => x.text.startsWith("Lights out"))?.offset).toBeCloseTo(1.31, 3);
  });

  it("never leaves the shot", () => {
    const r = resolveEvents([ev({ id: "e1", at: 30, action: "late" })], { start: 60, end: 64 }, {});
    expect(r[0].offset).toBeLessThan(4);
  });
});

describe("what the shot is, stretch by stretch", () => {
  const resolved = resolveEvents(EVENTS, { start: 60, end: 64 }, CLOCK);

  it("opens as its base scene and carries every change forward", () => {
    const st = eventStates(resolved, 4);
    expect(st.map((s) => [s.from, s.to, s.eventId])).toEqual([
      [0, 1.31, null],
      [1.31, 2.4, "e1"],
      [2.4, 4, "e2"],
    ]);
    expect(st[0]).toMatchObject({ lighting: "", camera: "" });
    expect(st[1]).toMatchObject({ lighting: "the house lights die", camera: "" });
    // the camera starts at 2.4 and the light is the NEWEST light said
    expect(st[2]).toMatchObject({ lighting: "the stones he wears are the only light", camera: "a slow push toward him begins" });
  });

  it("an effect alone opens no state — it is not drawn", () => {
    const fx = resolveEvents([ev({ id: "e1", at: 1, effect: { type: "flash", seconds: null, level: null } })], { start: 0, end: 4 }, {});
    expect(eventStates(fx, 4)).toHaveLength(1);
  });

  it("reads as one line per beat", () => {
    expect(beatLines(resolved)).toEqual(["0:01.3 light: the house lights die", "0:02.4 light: the stones he wears are the only light; camera: a slow push toward him begins"]);
    expect(beatLines(resolveEvents(EDIT_EVENTS, { start: 60, end: 64 }, CLOCK))[0]).toBe("0:01.3 light: the house lights die; effect: blackout");
  });

  it("writes the scene of one state from the base and what has changed by then", () => {
    const st = eventStates(resolved, 4);
    expect(stateScene("a runway under full house lights", st[0])).toBe("a runway under full house lights");
    expect(stateScene("a runway under full house lights", st[2])).toBe("a runway under full house lights. Now — light: the stones he wears are the only light; camera: a slow push toward him begins.");
  });
});

describe("a change of light is made by the footage or by the edit — never asked of both", () => {
  const resolved = resolveEvents(EDIT_EVENTS, { start: 60, end: 64 }, CLOCK);

  it("a light change that carries an effect is the edit's: it is not direction for a generator", () => {
    expect(isDirected(EDIT_EVENTS[0])).toBe(false);
    expect(drawnFacets(EDIT_EVENTS[0])).toEqual([]);
    expect(drawnFacets(EVENTS[0])).toEqual(["lighting"]);
    // camera, action and picture changes are the footage's even beside an effect
    expect(drawnFacets(ev({ at: 1, camera: "push in", lighting: "dark", effect: { type: "dim", seconds: null, level: null } }))).toEqual(["camera"]);
    // so the shot's states are: as it opens, then the camera move — the blackout opens no state to draw
    expect(eventStates(resolved, 4).map((st) => [st.from, st.eventId, st.lighting, st.camera])).toEqual([
      [0, null, "", ""],
      [2.4, "e2", "", "a slow push toward him begins"],
    ]);
    // and a generator is told about the camera only
    const plan = temporalPlan({ route: "seedance_ref", resolved, shotSeconds: 4 });
    expect(plan.mode === "timed_script" && plan.script).toBe("Timed changes inside this shot, in seconds from its first frame. Each holds until the next; nothing else changes: from 2.4 s: camera: a slow push toward him begins.");
    // a shot whose only beat is the edit's generates exactly as a shot with none
    expect(temporalPlan({ route: "still_kling", resolved: resolveEvents([EDIT_EVENTS[0]], { start: 60, end: 64 }, CLOCK), shotSeconds: 4 })).toEqual({ mode: "single", effects: 1 });
  });

  it("a switch to a lighting state is the footage's: an exposure effect is never kept on the same beat", () => {
    const states = new Map([["DISCO", "points of white light drift across the room"]]);
    // as a writer returned it: the room goes dark (blackout) AND the light becomes the project's disco state
    const written = ev({ id: "e1", at: 1.2, lighting: "room goes dark", lightingState: "DISCO", effect: { type: "blackout", seconds: null, level: null } });
    // saved, the beat keeps the state and loses the effect — no exposure change makes points of light
    expect(sanitizeEvents([written], 4)[0]).toMatchObject({ lightingState: "DISCO", effect: null, lighting: "room goes dark" });
    // a record stored before the rule is read the same way
    const [r] = resolveEvents([written], { start: 0, end: 4 }, { lightingStates: states });
    expect(r.effect).toBeNull();
    expect(drawnFacets(r)).toEqual(["lighting"]);
    expect(pictureAt([r], 3)).toEqual({ brightness: 1, contrast: 1, flash: 0 });
    expect(effectKeys([r])).toEqual([]);
    // so the generator that takes a script is given the change, and the one that cannot refuses
    const plan = temporalPlan({ route: "seedance_ref", resolved: [r], shotSeconds: 4 });
    expect(plan.mode === "timed_script" && plan.script).toContain("from 1.2 s: light: room goes dark");
    expect(temporalPlan({ route: "still_kling", resolved: [r], shotSeconds: 4 }).mode).toBe("refused");
    // a state with no words of the beat's own reads as the state's description
    const [bare] = resolveEvents([ev({ id: "e1", at: 1.2, lightingState: "DISCO", effect: { type: "dim", seconds: null, level: null } })], { start: 0, end: 4 }, { lightingStates: states });
    expect(bare).toMatchObject({ lighting: "points of white light drift across the room", lightingFromState: true, effect: null });
    // a flash is not a light that holds: it may sit on the switch
    expect(effectOf({ effect: { type: "flash", seconds: null, level: null }, lightingState: "DISCO" })).toMatchObject({ type: "flash" });
    expect(sanitizeEvents([ev({ id: "e1", at: 1, lightingState: "DISCO", effect: { type: "flash", seconds: null, level: null } })], 4)[0].effect).toMatchObject({ type: "flash" });
  });

  it("says so when the footage is asked for a light change the edit's effect would cover", () => {
    expect(eventNotes(resolved)).toEqual([]);
    const both = resolveEvents([EDIT_EVENTS[0], ev({ id: "e2", at: 2.4, lighting: "the stones he wears are the only light" })], { start: 60, end: 64 }, CLOCK);
    expect(eventNotes(both)).toEqual(["At 0:02.4 the light changes in the footage, but the edit's blackout from 0:01.3 is still on the picture — the change would be seen through it. Let one of the two make it, or end the effect there (Lights up)."]);
    // once the effect is ended, nothing is in the way
    const ended = resolveEvents([EDIT_EVENTS[0], ev({ id: "e2", at: 2.0, effect: { type: "lights_up", seconds: 0.2, level: null } }), ev({ id: "e3", at: 2.6, lighting: "a single spot" })], { start: 60, end: 64 }, CLOCK);
    expect(eventNotes(ended)).toEqual([]);
    expect(eventNotes(resolveEvents(EVENTS, { start: 60, end: 64 }, CLOCK))).toEqual([]);
  });
});

describe("an effect is arithmetic the edit applies", () => {
  const resolved = resolveEvents(EDIT_EVENTS, { start: 60, end: 64 }, CLOCK);

  it("the picture is as filmed until the effect, moves over its seconds, and holds", () => {
    expect(isAsFilmed(pictureAt(resolved, 0))).toBe(true);
    expect(isAsFilmed(pictureAt(resolved, 1.3))).toBe(true);
    const mid = pictureAt(resolved, 1.31 + 0.125);
    expect(mid.brightness).toBeCloseTo(0.55, 2);
    expect(mid.contrast).toBeCloseTo(1.3, 2);
    expect(pictureAt(resolved, 1.56)).toEqual({ brightness: 0.1, contrast: 1.6, flash: 0 });
    expect(pictureAt(resolved, 3.9)).toEqual({ brightness: 0.1, contrast: 1.6, flash: 0 });
    expect(pictureFilter(pictureAt(resolved, 3.9))).toBe("brightness(0.1) contrast(1.6)");
    expect(pictureFilter(pictureAt(resolved, 0))).toBe("none");
  });

  it("lights come back up, a flash decays, a dim takes its own level", () => {
    const fx = resolveEvents(
      [
        ev({ id: "e1", at: 0.5, effect: { type: "dim", seconds: 0.5, level: 0.5 } }),
        ev({ id: "e2", at: 2, effect: { type: "lights_up", seconds: 0.5, level: null } }),
        ev({ id: "e3", at: 3, effect: { type: "flash", seconds: 0.2, level: null } }),
      ],
      { start: 0, end: 4 },
      {},
    );
    expect(pictureAt(fx, 1.5).brightness).toBe(0.5);
    expect(pictureAt(fx, 2.25).brightness).toBeCloseTo(0.75, 3);
    expect(pictureAt(fx, 2.6)).toEqual({ brightness: 1, contrast: 1, flash: 0 });
    expect(pictureAt(fx, 3).flash).toBe(1);
    expect(pictureAt(fx, 3.1).flash).toBeCloseTo(0.5, 3);
    expect(pictureAt(fx, 3.3).flash).toBe(0);
  });

  it("is carried to a render as keys on the song clock", () => {
    expect(effectKeys(resolved)).toEqual([{ event_id: "e1", song_time: 61.31, offset: 1.31, type: "blackout", seconds: 0.25, level: 0.1, contrast: 1.6 }]);
  });

  it("is on the timeline Review plays", () => {
    const b = box(EDIT_EVENTS);
    const tl = buildTimeline({ boxes: [b], assignments: [], assets: new Map<string, MediaAsset>(), syncs: [] as TakeSync[], clock: CLOCK });
    expect(tl[0].events.map((e) => [e.id, e.songTime])).toEqual([
      ["e1", 61.31],
      ["e2", 62.4],
    ]);
  });
});

describe("events go with their moment when a shot is split or merged", () => {
  it("each half keeps what happens inside it, re-timed from its own start", () => {
    const resolved = resolveEvents(EVENTS, { start: 60, end: 64 }, CLOCK);
    const { first, second } = splitEvents(resolved, 2);
    expect(first.map((e) => [e.id, e.at])).toEqual([["e1", 1.31]]);
    expect(second.map((e) => [e.id, e.at])).toEqual([["e2", 0.4]]);
    const plan = planSplit(box(), 62, ["c018"], AT, CLOCK);
    expect(plan.first.spec_json.events.map((e) => e.id)).toEqual(["e1"]);
    expect(plan.second.spec_json.events.map((e) => [e.at, e.camera])).toEqual([[0.4, "a slow push toward him begins"]]);
  });

  it("a beat count does not survive a cut; a lyric trigger does", () => {
    const r = resolveEvents([ev({ id: "e1", at: 0, trigger: { kind: "beat", ref: "6" }, action: "turn" }), ev({ id: "e2", at: 0, trigger: { kind: "lyric", ref: "again" }, action: "stop" })], { start: 60, end: 64 }, CLOCK);
    const { second } = splitEvents(r, 2);
    expect(second.map((e) => e.trigger.kind)).toEqual(["time", "lyric"]);
    expect(second.map((e) => e.at)).toEqual([0.5, 0.5]);
  });

  it("merging two shots keeps both shots' events at their moments", () => {
    const a = box([ev({ id: "e1", at: 1, action: "he turns" })], { start: 60, end: 62, key: "c018", id: "r18" });
    const b = box([ev({ id: "e1", at: 0.5, lighting: "the lights die" })], { start: 62, end: 64, key: "c019", id: "r19" });
    const w = planMerge(a, b, AT, {});
    expect(w.spec_json.events.map((e) => [e.at, e.action || e.lighting])).toEqual([
      [1, "he turns"],
      [2.5, "the lights die"],
    ]);
    expect(new Set(w.spec_json.events.map((e) => e.id)).size).toBe(2);
    const resolved = mergeEvents(resolveEvents(a.spec.events, a, {}), resolveEvents(b.spec.events, b, {}), 2);
    expect(resolved).toHaveLength(2);
  });

  it("split at the beats turns each state into its own shot, cut on the beat", () => {
    const plan = planSplitAtBeats(box(), ["c018"], AT, CLOCK);
    expect(plan.cuts).toEqual([61.31, 62.4]);
    expect([plan.first.timestamp_start, plan.first.timestamp_end]).toEqual([60, 61.31]);
    expect(plan.rest.map((r) => [r.timestamp_start, r.timestamp_end])).toEqual([
      [61.31, 62.4],
      [62.4, 64],
    ]);
    // the opening shot is the base scene and has nothing left to change
    expect(plan.first.spec_json.events).toEqual([]);
    // the second IS the dark state — said in its scene — and has nothing left to change
    const second = plan.rest[0].spec_json;
    expect(sceneOf(second)).toBe("a runway under full house lights, he walks toward the camera. Now: the house lights die.");
    expect(second.events).toEqual([]);
    // the third carries the newest light and the camera move as its own direction
    const third = plan.rest[1].spec_json;
    expect(sceneOf(third)).toContain("Now: the stones he wears are the only light");
    expect(third.cameraMotion.description).toBe("a slow push toward him begins");
    expect(third.events).toEqual([]);
    // every piece is now a shot any generator can draw
    for (const w of [plan.first, ...plan.rest]) expect(hasDirectedChange(w.spec_json)).toBe(false);
    expect(new Set([plan.first.spec_key, ...plan.rest.map((r) => r.spec_key)]).size).toBe(3);
  });

  it("an effect goes with the piece it falls in, at its own moment — it is not a state and makes no cut", () => {
    const plan = planSplitAtBeats(box(EDIT_EVENTS), ["c018"], AT, CLOCK);
    // one cut only: where the camera move begins. The blackout is the edit's and stays in the first piece, on its sung phrase
    expect(plan.cuts).toEqual([62.4]);
    expect(plan.first.spec_json.events).toHaveLength(1);
    expect(plan.first.spec_json.events[0]).toMatchObject({ at: 1.31, trigger: { kind: "lyric", ref: "lights out" }, effect: { type: "blackout" } });
    expect(plan.rest[0].spec_json.cameraMotion.description).toBe("a slow push toward him begins");
  });

  it("refuses to cut pieces shorter than half a second", () => {
    expect(() => planSplitAtBeats(box([ev({ id: "e1", at: 0.2, action: "a" })]), ["c018"], AT, {})).toThrow(/half a second/);
  });
});

describe("generating a shot that changes is never a flattened prompt", () => {
  const resolved = resolveEvents(EVENTS, { start: 60, end: 64 }, CLOCK);
  const ONE_STATE: TemporalRoute[] = ["still_kling", "kling_t2v", "still_dop", "still_runway", "still_runway45", "runway_t2v"];

  it("every route's support is declared, and none is claimed measured without a measurement", () => {
    for (const [route, cap] of Object.entries(ROUTE_TEMPORAL)) {
      expect(cap.note.length, route).toBeGreaterThan(20);
      if (route !== "image") expect(cap.measured, route).toBe(false);
    }
  });

  it("what was measured of a route's timing is said in numbers, and a route nobody measured says so", () => {
    // Seedance was measured on the fresh section: the change was drawn, about a second early — that is not "keeps to time"
    const e = ROUTE_TEMPORAL.seedance_ref.evidence!;
    expect(ROUTE_TEMPORAL.seedance_ref.measured).toBe(false);
    expect(e.errorsSeconds).toEqual([-1.02, -0.94]);
    // a detected change and its time; that it was the change asked for is said to be a reading by eye, not a measurement
    expect(e.identified).toBe("by_eye");
    expect(timingSaid("seedance_ref")).toBe("On the 2 restagings measured so far (3 October 2026) a change of light began 1.0 s early on average (−1.02 s, −0.94 s). That it was the change asked for was read off the frames by eye, not measured. Each clip is measured against its beats when it comes back.");
    expect(timingSaid("seedance_ref")).not.toMatch(/the change asked for was drawn/);
    expect(timingSaid("seedance_ref")).not.toMatch(/works|accurate|reliabl/i);
    for (const route of ONE_STATE) {
      expect(ROUTE_TEMPORAL[route].evidence, route).toBeUndefined();
      expect(timingSaid(route), route).toContain("has not been measured");
    }
    // the plan a director is shown before paying carries the same sentence
    const plan = temporalPlan({ route: "seedance_ref", resolved, shotSeconds: 4 });
    expect(plan.mode === "timed_script" && plan.timing).toBe(timingSaid("seedance_ref"));
  });

  it("a shot with no directed change generates as it always did, on every route", () => {
    for (const route of Object.keys(ROUTE_TEMPORAL) as TemporalRoute[]) {
      expect(temporalPlan({ route, resolved: [], shotSeconds: 4 })).toEqual({ mode: "single", effects: 0 });
    }
    // an effect is the edit's: it is counted, not sent
    const fx = resolveEvents([ev({ id: "e1", at: 1, effect: { type: "blackout", seconds: null, level: null } })], { start: 0, end: 4 }, {});
    expect(temporalPlan({ route: "still_kling", resolved: fx, shotSeconds: 4 })).toEqual({ mode: "single", effects: 1 });
  });

  it("a route that draws one move REFUSES, says why, and names the defined alternatives", () => {
    for (const route of ONE_STATE) {
      const plan = temporalPlan({ route, resolved, shotSeconds: 4 });
      expect(plan.mode, route).toBe("refused");
      if (plan.mode !== "refused") continue;
      expect(plan.beats).toBe(2);
      expect(plan.reason).toMatch(/changes 2 times while it plays \(0:01\.3, 0:02\.4\)/);
      expect(plan.reason).toMatch(/cannot place a change at a set time/);
      expect(plan.alternatives).toEqual(["split", "ordered"]);
    }
  });

  it("offers an effect only when everything directed is a change of light", () => {
    const light = resolveEvents([ev({ id: "e1", at: 1, lighting: "the lights die" })], { start: 0, end: 4 }, {});
    const plan = temporalPlan({ route: "still_kling", resolved: light, shotSeconds: 4 });
    expect(plan.mode === "refused" && plan.alternatives).toEqual(["effect", "split", "ordered"]);
  });

  it("'in order, not on time' exists only when asked for by name, and never calls itself timed", () => {
    const plan = temporalPlan({ route: "still_kling", resolved, shotSeconds: 4, allowOrdered: true });
    expect(plan.mode).toBe("ordered");
    if (plan.mode !== "ordered") return;
    expect(plan.script).toBe("First: light: the house lights die. Then: light: the stones he wears are the only light; camera: a slow push toward him begins.");
    expect(plan.script).not.toMatch(/\d s\b/);
    expect(plan.note).toMatch(/when each happens is its own choice/);
    expect(orderedScript(resolved, 4)).toBe(plan.script);
  });

  it("a route that reads times is given them, in seconds from the first frame, and is not called measured", () => {
    const plan = temporalPlan({ route: "seedance_ref", resolved, shotSeconds: 4 });
    expect(plan.mode).toBe("timed_script");
    if (plan.mode !== "timed_script") return;
    expect(plan.measured).toBe(false);
    expect(plan.script).toBe(
      "Timed changes inside this shot, in seconds from its first frame. Each holds until the next; nothing else changes: from 1.3 s: light: the house lights die. from 2.4 s: light: the stones he wears are the only light; camera: a slow push toward him begins.",
    );
    expect(timedScript(resolved, 4)).toBe(plan.script);
  });

  it("an image is the shot as it opens, and says so", () => {
    const plan = imageTemporalPlan(box(), CLOCK);
    expect(plan).toMatchObject({ mode: "opening_state", beats: 2 });
  });

  it("the storyboard's clip of a changing shot is refused before anything is built", () => {
    const b = box();
    const plan = clipTemporalPlan(b, CLOCK);
    expect(plan.mode).toBe("refused");
    expect(() => clipShot(b, LINES, { temporal: plan })).toThrow(/Nothing was generated/);
  });

  it("a stale 'nothing changes' plan cannot be used for a shot that changes", () => {
    const b = box();
    expect(() => clipShot(b, LINES, { temporal: { mode: "single", effects: 0 } })).toThrow(/said nothing about it/);
    expect(() => assertPlanCovers(b.spec, { mode: "opening_state", beats: 2, note: "" })).toThrow();
    expect(() => assertPlanCovers(box([]).spec, { mode: "single", effects: 0 })).not.toThrow();
  });

  it("asked for in order, the clip's request carries the beats and is recorded as ordered, unmeasured", () => {
    const b = box();
    const shot = clipShot(b, LINES, { temporal: clipTemporalPlan(b, CLOCK, { allowOrdered: true }) });
    expect(shot.motion).toContain("First: light: the house lights die.");
    // the beats go along as data too — what the director wanted and when — though no time was promised
    expect(shot.temporal).toMatchObject({ mode: "ordered", beats: 2, measured: false });
    expect(shot.temporal?.asked?.map((a) => [a.id, a.offset, a.kinds])).toEqual([
      ["e1", 1.31, ["lighting"]],
      ["e2", 2.4, ["lighting", "camera"]],
    ]);
  });

  it("a shot with no events builds exactly the request it built before", () => {
    const b = box([]);
    const shot = clipShot(b, LINES, { temporal: clipTemporalPlan(b, CLOCK) });
    expect(shot.temporal).toBeUndefined();
  });

  it("a restaging gives the model the timed script and records that it did", () => {
    const b = box(EVENTS, { shotType: "performance" });
    const take = { id: "take1", shows: "a dark coat" } as MediaAsset;
    const sync = { id: "s1", projectId: "p1", songAssetId: "song", performanceAssetId: "take1", offsetSeconds: 0, driftPpm: 0, method: "manual", status: "confirmed" } as TakeSync;
    const base = { box: b, lyricLines: LINES, source: { take, sync, takeIn: 60, takeOut: 64 }, sourcePath: "a.mp4", stillPath: "b.png", cut: { start: 60, seconds: 4 } };
    const req = restageShot({ ...base, temporal: restageTemporalPlan(b, CLOCK) });
    expect(req.shot.angle).toContain("from 1.3 s: light: the house lights die");
    expect(req.shot.temporal).toMatchObject({ mode: "timed_script", beats: 2, measured: false });
    // the job carries the script as data — the moments and the words — so the footage can be measured against it
    expect(req.shot.temporal?.asked).toEqual([
      { id: "e1", offset: 1.31, kinds: ["lighting"], says: "light: the house lights die" },
      { id: "e2", offset: 2.4, kinds: ["lighting", "camera"], says: "light: the stones he wears are the only light; camera: a slow push toward him begins" },
    ]);
    // the request the provider receives says the place changes as the script says — not that the place is still
    const said = motionPrompt(req.shot, null, true);
    expect(said).toContain("from 1.3 s: light: the house lights die");
    expect(said).toContain("The environment changes only as the timed changes say, at the seconds they say");
    expect(said).not.toContain("The environment is still, only he and the camera move.");
    // a restaging with no beats is told, as before, that only he and the camera move
    const plain = restageShot({ ...base, box: box([], { shotType: "performance" }), temporal: { mode: "single", effects: 0 } });
    expect(motionPrompt(plain.shot, null, true)).toContain("The environment is still, only he and the camera move.");
    // a cut that could only open on an earlier sync frame carries that footage first: every time the model is
    // given, and every time the footage is measured against, moves by it
    const early = restageShot({ ...base, cut: { start: 59.2, seconds: 5 }, temporal: restageTemporalPlan(b, CLOCK) });
    expect(early.shot.angle).toContain("from 2.1 s: light: the house lights die");
    expect(early.shot.temporal?.asked?.map((a) => a.offset)).toEqual([2.11, 3.2]);
    // a cut made to the frame opens up to a frame early: that is not a shift
    const exact = restageShot({ ...base, cut: { start: 59.97, seconds: 4 }, temporal: restageTemporalPlan(b, CLOCK) });
    expect(exact.shot.temporal?.asked?.map((a) => a.offset)).toEqual([1.31, 2.4]);
    // and cannot be handed a plan that ignores the beats
    expect(() => restageShot({ ...base, temporal: { mode: "single", effects: 0 } })).toThrow(/said nothing about it/);
  });
});

describe("the director's cast survives the round trip through the row", () => {
  it("a cast edit is read back from the stored override, so a reload does not undo it", () => {
    const b = box();
    const generated = { ...b.generated!, cast: { members: [], open: false, none: true } };
    const w0 = boxWrite({ key: b.key, start: 60, end: 64, section: "hook", generated, override: null, locked: false, origin: "treatment", history: [] });
    const row = { id: "r18", project_id: "p1", shot_number: 18, ...w0, override_json: { cast: { none: false } }, updated_at: AT } as BoxRow;
    // the stored override says "there are people": the resolved shot says so too
    expect(boxFromRow(row)!.spec.cast?.none).toBe(false);
    // members are kept with what each does here, and a mode the app does not know is read as "the entity's"
    const members = [{ key: "FENDI", action: "watching", placement: "on the sofa", framing: "medium", identityMode: "preserve" }];
    const o = parseBoxOverride({ cast: { members: [...members, { key: "X", identityMode: "nope" }], open: false } });
    expect(o?.cast?.members).toEqual([...members, { key: "X", action: "", placement: "", framing: "", identityMode: null }]);
    expect(o?.cast?.open).toBe(false);
    expect(o?.cast?.none).toBeUndefined();
    // and what is written is what is read
    const w = applyOverride(b, { ...(b.override ?? {}), cast: { members, none: false } } as never, AT);
    expect(parseBoxOverride(w.override_json)?.cast).toEqual({ members, none: false });
    expect(w.spec_json.cast?.members.map((m) => m.key)).toEqual(["FENDI"]);
  });
});
