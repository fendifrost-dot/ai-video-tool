import { describe, expect, it } from "vitest";
import {
  angleToCard,
  extractScene,
  framingToCard,
  linesForSpec,
  motionSentence,
  moveToCard,
  presetToTransitionType,
  sceneToOverride,
  type MotionScene,
  modeForSpec,
  standingRules,
} from "./regenerateFromLyrics";
import { applyShotOverride, type ShotOverride } from "./overrides";
import { parseShotSpec } from "./shotSpec";
import type { LyricLine } from "@/lib/lyrics/lyricsForShot";

/**
 * These tests cover the seam: the generator speaks the engine's vocabulary (the same
 * words config/coverage_presets.json uses), the card speaks the ShotSpec enums, and a
 * word that does not translate must be DROPPED rather than written through. A bad enum
 * reaching a spec is not a cosmetic bug — parseShotSpec rejects it and the box vanishes.
 */

const scene: MotionScene = {
  title: "The boots that snap",
  purpose: "Make the boast physical: the alligator is still in the leather",
  visual: "Low angle on a marble stair, wet light, the boots mid-stride",
  motion: {
    entrance: "The stair lights come up one tread at a time",
    primary: "He steps and the gator boots snap at the air",
    secondary: "A bystander pulls his own foot back",
    exit: "The camera is left on the empty tread.",
  },
  camera: { move: "snap_zoom", framing: "close", angle: "low", lens: "anamorphic_35" },
  sound: "A leather creak tuned to the snare",
  transition: { object: "the wet tread becomes the hood of the car", preset: "match_cut" },
  required_elements: ["alligator boots", "marble stair", " "],
  realism_risk: "medium",
  risk_reason: "animated leather is close to a physics tell",
  render_prompt:
    "Low angle, anamorphic 35 … photographed on a cinema camera, photoreal, no animation look",
};

describe("vocabulary bridges", () => {
  it("maps the engine's move through the coverage planner's own table", () => {
    expect(moveToCard("snap_zoom")).toBe("zoom");
    expect(moveToCard("push")).toBe("dolly");
    expect(moveToCard("orbit")).toBe("orbit");
    expect(moveToCard("static")).toBe("static");
  });

  it("drops a move the card has no word for rather than inventing one", () => {
    expect(moveToCard("hyperlapse")).toBeNull();
    expect(moveToCard("")).toBeNull();
    expect(moveToCard(undefined)).toBeNull();
  });

  it("translates the template's framing words", () => {
    expect(framingToCard("close")).toBe("close_up");
    expect(framingToCard("extreme_close")).toBe("extreme_close_up");
    expect(framingToCard("medium_close")).toBe("medium_close");
    expect(framingToCard("wide")).toBe("wide");
    expect(framingToCard("cowboy")).toBeNull();
  });

  it("translates the template's angle words, including the one with no card equivalent", () => {
    expect(angleToCard("eye")).toBe("eye_level");
    expect(angleToCard("low")).toBe("low");
    expect(angleToCard("over_shoulder")).toBe("over_shoulder");
    // "profile" is not in CAMERA_ANGLES; eye_level is the honest nearest, not a null card
    expect(angleToCard("profile")).toBe("eye_level");
    expect(angleToCard("worm")).toBeNull();
  });

  it("maps every transition preset in the config onto a card type", () => {
    const presets = [
      "cut",
      "crossfade_1",
      "crossfade_2",
      "dip_black",
      "dip_white",
      "flash",
      "whip_left",
      "whip_right",
      "whip_up",
      "zoom_punch",
      "speed_ramp",
      "strobe_16",
      "luma_wipe",
      "glitch",
      "light_leak",
      "film_burn",
      "match_cut",
    ];
    for (const p of presets) expect(presetToTransitionType(p), p).not.toBeNull();
    expect(presetToTransitionType("teleport")).toBeNull();
  });
});

describe("the motion contract becomes one sentence a director would say", () => {
  it("joins entrance → primary → secondary → exit in order", () => {
    expect(motionSentence(scene.motion)).toBe(
      "The stair lights come up one tread at a time; He steps and the gator boots snap at the air; A bystander pulls his own foot back; The camera is left on the empty tread.",
    );
  });

  it("skips the beats that are missing", () => {
    expect(motionSentence({ primary: "He steps" })).toBe("He steps.");
    expect(motionSentence({})).toBe("");
    expect(motionSentence(undefined)).toBe("");
  });
});

describe("scene → override fields", () => {
  const out = sceneToOverride(scene);

  it("puts the motion sentence in the direction", () => {
    expect(out.direction).toContain("the gator boots snap at the air");
  });

  it("falls back to the purpose when the scene has no motion beats", () => {
    expect(sceneToOverride({ purpose: "Make it physical" }).direction).toBe("Make it physical");
  });

  it("carries the camera across, with the engine's own words kept in the description", () => {
    expect(out.cameraMotion.type).toBe("zoom");
    expect(out.cameraMotion.description).toContain("snap_zoom");
    expect(out.cameraMotion.description).toContain("anamorphic_35");
    expect(out.framing).toBe("close_up");
    expect(out.cameraAngle).toBe("low");
  });

  it("keeps the precise preset beside the coarse card type", () => {
    // match_cut is a 0.25-beat CROSSFADE in config/transition_presets.json; the mapping
    // comes from transitions.ts (the mirror held equal to that JSON by its own test),
    // not from a hand-rolled table here — the hand-rolled one had this as a hard cut.
    expect(out.transitionIn).toEqual({ type: "crossfade", preset: "match_cut" });
    expect(out.cameraMotion.description).toContain(
      "into: the wet tread becomes the hood of the car",
    );
  });

  it("trims the required elements and drops the blank one", () => {
    expect(out.requiredElements).toEqual(["alligator boots", "marble stair"]);
  });

  it("carries the render prompt and the honest risk", () => {
    expect(out.renderPrompt).toMatch(/no animation look$/);
    expect(out.realismRisk).toBe("medium");
  });

  it("survives a scene with nothing in it", () => {
    const empty = sceneToOverride({});
    expect(empty.direction).toBe("");
    expect(empty.cameraMotion.type).toBeNull();
    expect(empty.framing).toBeNull();
    expect(empty.requiredElements).toEqual([]);
  });
});

describe("the result feeds the SAME override path a hand edit does", () => {
  it("applies onto a spec through applyShotOverride and parses", () => {
    const spec = parseShotSpec({
      id: "clip-07",
      purpose: "p",
      shotType: "performance",
      timeline: { start: 12, end: 18 },
      performanceDirection: "generated direction",
    });
    const r = sceneToOverride(scene);
    const override: ShotOverride = {
      specId: spec.id,
      direction: r.direction,
      cameraMotion: { type: r.cameraMotion.type, description: r.cameraMotion.description },
      framing: r.framing,
      transitionIn: {
        type: r.transitionIn.type,
        preset: r.transitionIn.preset,
        durationSeconds: null,
      },
      requiredElements: r.requiredElements,
      notes: null,
    };
    const out = applyShotOverride(spec, override);
    expect(out.origin).toBe("override");
    expect(out.framing).toBe("close_up");
    expect(out.cameraMotion.type).toBe("zoom");
    expect(out.requiredElements).toEqual(["alligator boots", "marble stair"]);
    // and it is still a valid spec — the bridges did not smuggle an unknown enum through
    expect(() => parseShotSpec(out)).not.toThrow();
  });
});

describe("the window decides whether the button is even offered", () => {
  const line = (i: number, start: number, end: number, text: string): LyricLine => ({
    lineIndex: i,
    section: "hook",
    text,
    start,
    end,
    confidence: 1,
    words: text
      .split(" ")
      .map((w, n) => ({ w, start: start + n * 0.2, end: start + n * 0.2 + 0.2 })),
  });
  const spec = parseShotSpec({ id: "s", purpose: "p", timeline: { start: 10, end: 14 } });

  it("finds the lines sung inside the box", () => {
    expect(linesForSpec(spec, [line(0, 10.5, 12, "gator boots on the marble")])).toHaveLength(1);
  });

  it("is empty for an instrumental window", () => {
    expect(linesForSpec(spec, [line(0, 30, 32, "elsewhere in the song")])).toEqual([]);
    expect(linesForSpec(spec, [])).toEqual([]);
    expect(linesForSpec(spec, undefined)).toEqual([]);
  });
});

describe("extractScene", () => {
  it("pulls the one scene out of the proxy envelope", () => {
    expect(extractScene({ ok: true, result: { lines: [{ ref: "a", scene }] } })?.title).toBe(
      "The boots that snap",
    );
  });

  it("returns null rather than throwing on an empty or three-scene envelope", () => {
    expect(extractScene({ ok: true, result: { lines: [] } })).toBeNull();
    expect(extractScene({ ok: true, result: { lines: [{ ref: "a", scenes: [] }] } })).toBeNull();
    expect(extractScene(null)).toBeNull();
  });
});

describe("the card's role decides the reading and the standing rules", () => {
  const perf = parseShotSpec({ id: "p", purpose: "p", shotType: "performance", timeline: { start: 0, end: 4 } });
  const broll = parseShotSpec({ id: "b", purpose: "b", shotType: "b_roll", kind: "broll", timeline: { start: 4, end: 8 } });

  it("a performance card stages the line behind the real take; every other card makes the line literal", () => {
    expect(modeForSpec(perf)).toBe("performance");
    expect(modeForSpec(broll)).toBe("literal");
  });

  it("a performance card never re-dresses or re-seats the artist; an insert never shows him; the camera moves", () => {
    const p = standingRules(perf).join(" ");
    expect(p).toContain("real footage that already exists");
    expect(p).toContain("never seat or place him somewhere he was not shot");
    expect(p).toContain("around and behind him");
    const b = standingRules(broll).join(" ");
    expect(b).toContain("The artist does not appear in this shot");
    for (const rules of [standingRules(perf), standingRules(broll)]) expect(rules.at(-1)).toContain("The camera moves");
  });
});
