import { describe, expect, it } from "vitest";
import { applyCoverageDefaults, DEFAULT_COVERAGE_PRESETS } from "./coverage";
import {
  applyShotOverride,
  applyShotOverrides,
  effectiveTreatment,
  isEmptyOverride,
  isOverridden,
  type ShotOverride,
} from "./overrides";
import { parseShotSpec, type ShotSpec } from "./shotSpec";

/**
 * The property these tests exist for: an override states ONLY what the director
 * changed. Everything else — including a field they cleared — must still come from
 * the generator or the coverage planner. Get that wrong and a director who retypes
 * one line of direction silently wipes the camera move off the card.
 */

const spec = (over: Partial<ShotSpec> = {}): ShotSpec =>
  parseShotSpec({
    id: "clip-07",
    purpose: "Artist delivers the hook to camera",
    shotType: "performance",
    timeline: { start: 12, end: 18 },
    performanceDirection: "Generated: steady delivery, eyes to lens",
    framing: "medium",
    cameraMotion: { type: "dolly", description: "push 0.16 · anamorphic_35 · handheld 0.25" },
    ...over,
  });

const override = (over: Partial<ShotOverride> = {}): ShotOverride => ({
  specId: "clip-07",
  direction: null,
  cameraMotion: null,
  framing: null,
  transitionIn: null,
  requiredElements: null,
  notes: null,
  ...over,
});

describe("only the stated fields are replaced", () => {
  it("replaces the direction and leaves camera and framing alone", () => {
    const out = applyShotOverride(
      spec(),
      override({ direction: "He turns away on the last word" }),
    );
    expect(out.performanceDirection).toBe("He turns away on the last word");
    expect(out.cameraMotion).toEqual(spec().cameraMotion);
    expect(out.framing).toBe("medium");
    expect(out.origin).toBe("override");
  });

  it("replaces the camera move and leaves the direction alone", () => {
    const out = applyShotOverride(spec(), override({ cameraMotion: { type: "orbit" } }));
    expect(out.cameraMotion.type).toBe("orbit");
    // the generated description does NOT survive a stated type: it named the generated move ("push …") and the
    // coverage planner reads prose first, so keeping it would hand the box back to the old move
    expect(out.cameraMotion.description).toBe("orbit");
    expect(out.performanceDirection).toBe(spec().performanceDirection);
  });

  it("takes a description without a type", () => {
    const out = applyShotOverride(
      spec(),
      override({ cameraMotion: { description: "slow creep in on his hands" } }),
    );
    expect(out.cameraMotion).toEqual({ type: "dolly", description: "slow creep in on his hands" });
  });

  it("takes a preset's own family with it, so the card and the cut agree", () => {
    // match_cut is a 0.25-beat crossfade in config/transition_presets.json, not a hard
    // cut. Storing a preset without its family is how a card ends up claiming one thing
    // while the assembler renders another.
    const out = applyShotOverride(spec(), override({ transitionIn: { preset: "match_cut" } }));
    expect(out.transitionIn.preset).toBe("match_cut");
    expect(out.transitionIn.type).toBe("crossfade");
  });

  it("replaces framing, transition and required elements independently", () => {
    const out = applyShotOverride(
      spec(),
      override({
        framing: "close_up",
        transitionIn: { type: "whip_pan", durationSeconds: 0.25 },
        requiredElements: ["the gator boots", "the car on four shoulders"],
      }),
    );
    expect(out.framing).toBe("close_up");
    expect(out.transitionIn).toEqual({ type: "whip_pan", preset: null, durationSeconds: 0.25 });
    expect(out.requiredElements).toEqual(["the gator boots", "the car on four shoulders"]);
    expect(out.performanceDirection).toBe(spec().performanceDirection);
  });

  it("puts the director's note on provenance, not on the direction the generators read", () => {
    const out = applyShotOverride(spec(), override({ notes: "ask him to hold the last beat" }));
    expect(out.provenance.notes).toBe("ask him to hold the last beat");
    expect(out.provenance.source).toBe("human");
    expect(effectiveTreatment(out)).toBe(spec().performanceDirection);
  });
});

describe("an override that states nothing changes nothing", () => {
  it("leaves the spec identical, tag included", () => {
    const s = spec();
    expect(applyShotOverride(s, override())).toBe(s);
    expect(applyShotOverride(s, null)).toBe(s);
    expect(isOverridden(s)).toBe(false);
  });

  it("treats whitespace-only text as untouched", () => {
    expect(isEmptyOverride(override({ direction: "   ", notes: "\n" }))).toBe(true);
    expect(applyShotOverride(spec(), override({ direction: "   " })).origin).toBe("generated");
  });

  it("ignores an empty required-elements list", () => {
    expect(isEmptyOverride(override({ requiredElements: [] }))).toBe(true);
  });
});

describe("a value this build does not know is dropped, never written", () => {
  it("keeps the generated framing when the column holds an unknown vocabulary", () => {
    const out = applyShotOverride(spec(), override({ framing: "cowboy" }));
    expect(out.framing).toBe("medium");
    // nothing was stated that this build understands, so the card is not tagged
    expect(out.origin).toBe("generated");
  });

  it("keeps the generated move when the camera type is unknown", () => {
    const out = applyShotOverride(spec(), override({ cameraMotion: { type: "hyperlapse" } }));
    expect(out.cameraMotion.type).toBe("dolly");
  });

  it("keeps the generated transition when the type is unknown but takes a stated duration", () => {
    const out = applyShotOverride(
      spec(),
      override({ transitionIn: { type: "teleport", durationSeconds: 0.5 } }),
    );
    expect(out.transitionIn.type).toBe("cut");
    expect(out.transitionIn.durationSeconds).toBe(0.5);
  });

  it("ignores a preset name that is not in config/transition_presets.json", () => {
    const out = applyShotOverride(spec(), override({ transitionIn: { preset: "teleport" } }));
    expect(out.transitionIn.preset).toBeNull();
    expect(out.origin).toBe("generated");
  });
});

describe("applyShotOverrides over a list", () => {
  it("touches only the specs that have one", () => {
    const a = spec({ id: "a" });
    const b = spec({ id: "b" });
    const out = applyShotOverrides([a, b], { b: override({ specId: "b", framing: "wide" }) });
    expect(out[0]).toBe(a);
    expect(out[1].framing).toBe("wide");
    expect(out[1].origin).toBe("override");
  });

  it("is a no-op with no overrides", () => {
    const specs = [spec()];
    expect(applyShotOverrides(specs, {})).toBe(specs);
    expect(applyShotOverrides(specs, null)).toBe(specs);
  });
});

describe("overrides run BEFORE the coverage planner", () => {
  // This ordering is the whole contract between B3 and the coverage work: an explicit
  // override must survive the planner, and a box the director cleared must be refilled
  // by it rather than left blank.
  const run = (s: ShotSpec, o: Record<string, ShotOverride>) =>
    applyCoverageDefaults(applyShotOverrides([s], o), DEFAULT_COVERAGE_PRESETS)[0];

  it("an explicit move survives the planner", () => {
    const cleared = spec({ cameraMotion: { type: "static", description: "" }, framing: null });
    const out = run(cleared, {
      "clip-07": override({
        cameraMotion: { type: "crane", description: "rise off his shoulder" },
      }),
    });
    expect(out.cameraMotion).toEqual({ type: "crane", description: "rise off his shoulder" });
  });

  it("a type stated WITHOUT a description survives the planner (the prose is replaced, not kept)", () => {
    // The planner reads prose first; the generated prose named the generated move and used to win.
    const generated = spec({ cameraMotion: { type: "dolly", description: "push 0.16 · anamorphic_35 · handheld 0.25" } });
    const out = run(generated, { "clip-07": override({ cameraMotion: { type: "truck" } }) });
    expect(out.cameraMotion.type).toBe("truck");
    expect(out.cameraMotion.description).not.toContain("push");
    expect(out.origin).toBe("override");
    const locked = run(generated, { "clip-07": override({ cameraMotion: { type: "static" } }) });
    expect(locked.cameraMotion.type).toBe("static");
  });

  it("an explicit static with a description is a choice, and is kept", () => {
    const cleared = spec({ cameraMotion: { type: "static", description: "" } });
    const out = run(cleared, {
      "clip-07": override({
        cameraMotion: { type: "static", description: "locked off, let him come to the lens" },
      }),
    });
    expect(out.cameraMotion.type).toBe("static");
    expect(out.cameraMotion.description).toBe("locked off, let him come to the lens");
  });

  it("a cleared move is refilled by the planner, not left blank", () => {
    const cleared = spec({ cameraMotion: { type: "static", description: "" }, framing: null });
    const out = run(cleared, { "clip-07": override({ direction: "just the direction changed" }) });
    expect(out.performanceDirection).toBe("just the direction changed");
    expect(out.cameraMotion.description).not.toBe("");
    expect(out.framing).toBeTruthy();
  });

  it("an explicit framing survives the planner's rotation", () => {
    const cleared = spec({ framing: null });
    const out = run(cleared, { "clip-07": override({ framing: "extreme_close_up" }) });
    expect(out.framing).toBe("extreme_close_up");
  });
});

describe("the schema carries the new fields", () => {
  it("defaults origin to generated and requiredElements to empty", () => {
    const s = parseShotSpec({ id: "x", purpose: "p", timeline: { start: 0, end: 1 } });
    expect(s.origin).toBe("generated");
    expect(s.requiredElements).toEqual([]);
  });
});
