/**
 * Treatment → timed storyboard: a writer's beats become the shot's own events, one way, whichever writer wrote them.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { buildSystemPrompt } from "../../../supabase/functions/lyric-visualizer-proxy/contract";
import { treatmentClipToShotSpec, type TreatmentClip } from "@/lib/treatment/api";
import { sceneToOverride } from "@/lib/treatment/regenerateFromLyrics";
import { rewrittenOverride } from "./boxes";
import { resolveEvents } from "./events";
import { temporalPlan } from "./temporal";
import { eventsFromWritten } from "./writtenBeats";

const WRITTEN = [
  { at_seconds: 1.2, on_words: "Lights out", lighting: "the house lights die", camera: "", action: "", picture: "", effect: "blackout" },
  { at_seconds: 2.4, on_words: "", lighting: "what he wears is the only light", camera: "a slow push toward him begins", action: "", picture: "", effect: "none" },
];

describe("a writer's timed beats become the shot's events", () => {
  it("each beat is an event: its time, its kinds, its effect", () => {
    const events = eventsFromWritten(WRITTEN, 4, "then it goes lights out again");
    expect(events).toEqual([
      { id: "e1", at: 1.2, trigger: { kind: "lyric", ref: "Lights out" }, lighting: "the house lights die", camera: "", action: "", visual: "", lightingState: null, effect: { type: "blackout", seconds: null, level: null } },
      { id: "e2", at: 2.4, trigger: { kind: "time", ref: "" }, lighting: "what he wears is the only light", camera: "a slow push toward him begins", action: "", visual: "", lightingState: null, effect: null },
    ]);
  });

  it("hangs a beat on words only when they are sung in the shot", () => {
    expect(eventsFromWritten(WRITTEN, 4, "something else entirely")[0].trigger).toEqual({ kind: "time", ref: "" });
    expect(eventsFromWritten(WRITTEN, 4)[0].trigger).toEqual({ kind: "time", ref: "" });
  });

  it("a shot the writer left as one state has no events", () => {
    expect(eventsFromWritten([], 4, "words")).toEqual([]);
    expect(eventsFromWritten(undefined, 4)).toEqual([]);
    // a beat outside the shot is not a beat of this shot
    expect(eventsFromWritten([{ ...WRITTEN[0], at_seconds: 7 }], 4)).toEqual([]);
  });
});

describe("the whole-board writer", () => {
  const clip: TreatmentClip = {
    key: "c018", start: 60, end: 64, section: "hook", energy: "high", shot_type: "b_roll",
    scene_description: "A runway under full house lights.", camera_direction: "wide, static", lighting: "full house lights", wardrobe: "none", environment: "a black runway",
    recommended_tool: "manual", lyric_ref: null, priority: "hero", dependencies: [],
    events: eventsFromWritten(WRITTEN, 4, "then it goes lights out again"),
  };

  it("writes the events onto the one shot record — and the opening scene stays the scene", () => {
    const spec = treatmentClipToShotSpec(clip);
    expect(spec.purpose).toBe("A runway under full house lights.");
    expect(spec.events.map((e) => [e.at, e.lighting])).toEqual([
      [1.2, "the house lights die"],
      [2.4, "what he wears is the only light"],
    ]);
    // which generating then treats as a shot that changes — never as one static prompt
    const plan = temporalPlan({ route: "still_kling", resolved: resolveEvents(spec.events, { start: 60, end: 64 }, {}), shotSeconds: 4 });
    expect(plan.mode).toBe("refused");
  });

  it("a clip with no beats is the shot it always was", () => {
    expect(treatmentClipToShotSpec({ ...clip, events: undefined }).events).toEqual([]);
  });
});

describe("the one-shot scene writer", () => {
  const scene = { purpose: "The lights go.", visual: "A runway under full house lights.", motion: { primary: "he walks" }, camera: { move: "push", framing: "wide", angle: "eye", lens: "35mm" }, transition: { preset: "cut" }, required_elements: [], render_prompt: "x", timed_beats: WRITTEN };

  it("returns the events with the scene", () => {
    const r = sceneToOverride(scene, { seconds: 4, sung: "then it goes lights out again" });
    expect(r.frame).toBe("A runway under full house lights.");
    expect(r.events).toHaveLength(2);
    expect(r.events[0].trigger).toEqual({ kind: "lyric", ref: "Lights out" });
    expect(sceneToOverride({ ...scene, timed_beats: [] }, { seconds: 4 }).events).toEqual([]);
  });

  it("a rewrite replaces written beats and leaves the director's alone", () => {
    const r = sceneToOverride(scene, { seconds: 4 });
    expect(rewrittenOverride(null, { direction: r.direction, events: r.events }).events).toHaveLength(2);
    const his = eventsFromWritten([{ ...WRITTEN[1], at_seconds: 3 }], 4);
    const kept = rewrittenOverride({ direction: null, cameraMotion: null, framing: null, transitionIn: null, requiredElements: null, notes: null, events: his, manual: ["events"] }, { direction: r.direction, events: r.events });
    expect(kept.events).toEqual(his);
    // a rewrite that comes back as one state clears beats a writer wrote earlier
    expect(rewrittenOverride({ direction: null, cameraMotion: null, framing: null, transitionIn: null, requiredElements: null, notes: null, events: r.events, manual: [] }, { direction: "x", events: [] }).events).toEqual([]);
  });

  it("is told about timed beats only when it writes one scene for a storyboard shot", () => {
    const base = { clipSeconds: 4, exemplars: "", rules: "", limits: "" };
    const forShot = buildSystemPrompt({ ...base, mode: "literal", shot: { start: 60, end: 64, section: "hook" }, treatment: "ONE IDEA." });
    expect(forShot).toContain("Change inside a shot (`timed_beats`):");
    expect(forShot).toContain("`visual` is then how the shot OPENS.");
    expect(buildSystemPrompt({ ...base, mode: "all" })).not.toContain("timed_beats");
    expect(buildSystemPrompt({ ...base, mode: "literal" })).not.toContain("timed_beats");
  });
});
