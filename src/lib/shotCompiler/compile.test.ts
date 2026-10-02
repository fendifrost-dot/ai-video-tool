import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  compileToWorldBatch,
  toShotsJson,
  toStubsJson,
  snapDurationForRoute,
  snapKlingOrRunway,
  snapSeedance,
  wrapPrompt,
  seedanceAnglePrompt,
  LOOK_PRESETS,
  DEFAULT_LOOK_PRESET_ID,
  type CompilerPhrase,
  type CoverageMoveSpec,
  type ShotCompilerInput,
} from "./index";

const MOVE: CoverageMoveSpec = {
  type: "push",
  amount: 0.16,
  ease: "in_out",
  handheld: 0.25,
  lens: "anamorphic_35",
  start: 0,
  end: 1,
  direction: "left",
};

const KEEP = ["clear-lens glasses, not tinted", "navy cap", "camo shirt with the flag patch"];

describe("duration snap", () => {
  it("snaps Kling/Runway to 5 or 10 (matches run_world_batch: int(sec) > 5 → 10)", () => {
    expect(snapKlingOrRunway(3)).toBe(5);
    expect(snapKlingOrRunway(5)).toBe(5);
    expect(snapKlingOrRunway(5.4)).toBe(5); // round → 5
    expect(snapKlingOrRunway(6)).toBe(10);
    expect(snapKlingOrRunway(12)).toBe(10);
  });

  it("Seedance duration = source seconds, clamped 4–30", () => {
    expect(snapSeedance(4)).toBe(4);
    expect(snapSeedance(7.4)).toBe(7);
    expect(snapSeedance(2)).toBe(4);
    expect(snapSeedance(40)).toBe(30);
  });

  it("route-aware snap: seedance uses source; still_kling uses enum", () => {
    expect(snapDurationForRoute("seedance_ref", 12, 4.2)).toBe(4);
    expect(snapDurationForRoute("still_kling", 7)).toBe(10);
    expect(snapDurationForRoute("kling_t2v", 4)).toBe(5);
  });
});

describe("prompt wrap + seedance angle", () => {
  it("wraps with film_bar_v1 preamble and suffix; drops preamble when over budget", () => {
    const look = LOOK_PRESETS.film_bar_v1;
    const out = wrapPrompt("a snow room with one subject", look, { motion: "slow push-in" });
    expect(out).toContain("snow room");
    expect(out).toContain(look.shot_suffix);
    expect(out.startsWith("You are a world-class")).toBe(true);
  });

  it("seedance angle prompt puts @Video1 first and keep[] in the lock line", () => {
    const p = seedanceAnglePrompt(
      "a low wide angle from waist height, 24mm, slow push-in",
      KEEP,
      LOOK_PRESETS.film_bar_v1,
      false,
    );
    expect(p.startsWith("@Video1 is the performer")).toBe(true);
    expect(p).toContain("clear-lens glasses, not tinted");
    expect(p).toContain("same mouth movements");
    expect(p).toContain("The same room, the same light.");
    expect(p).not.toContain("@Image1");
  });

  it("seedance with world still references @Image1", () => {
    const p = seedanceAnglePrompt("side tight", KEEP, null, true);
    expect(p).toContain("@Image1");
  });
});

describe("compileToWorldBatch", () => {
  it("splits coverage_take → take_move stub and coverage_angle → seedance_ref shot", () => {
    const phrases: CompilerPhrase[] = [
      {
        kind: "coverage_take",
        id: "S06a",
        slot: "S06",
        section: "hook",
        song: [66.885, 68.853],
        move: MOVE,
        framing: "medium",
        sourcePath: "project-clips/u/p/S06_live.mp4",
        sourceSeconds: 1.968,
        transition: "cut",
      },
      {
        kind: "coverage_angle",
        id: "S06c_low_hero",
        slot: "S06",
        section: "hook",
        song: [66.885, 68.853],
        move: MOVE,
        framing: "close_up",
        sourcePath: "project-clips/u/p/S06_live.mp4",
        sourceLocal: "/tmp/S06_live.mp4",
        sourceSeconds: 4.0,
        angle: "a low hero angle from knee height looking up, 28mm, fast push-in",
        keep: KEEP,
      },
    ];
    const result = compileToWorldBatch({ phrases });
    expect(result.stubs).toHaveLength(1);
    expect(result.stubs[0].route).toBe("take_move");
    expect(result.stubs[0].provider).toBe(false);
    expect(result.stubs[0].move?.type).toBe("push");
    expect(result.stubs[0].sourcePath).toBe("project-clips/u/p/S06_live.mp4");

    expect(result.shots).toHaveLength(1);
    const s = result.shots[0];
    expect(s.route).toBe("seedance_ref");
    expect(s.kind).toBe("angle");
    expect(s.source_path).toBe("project-clips/u/p/S06_live.mp4");
    expect(s.seconds).toBe(4);
    expect(s.keep).toEqual(KEEP);
    expect(s.angle).toContain("low hero");
    expect(s.prompt).toContain("@Video1");
    expect(s.prompt).toContain("clear-lens glasses, not tinted");
    expect(s.heroStillUrl).toBeUndefined();
    expect(result.gateHints.requireReferenceFidelity).toBe(true);
    expect(result.gateHints.requireCoverageQa).toBe(true);
  });

  it("rejects coverage_angle without keep[]", () => {
    expect(() =>
      compileToWorldBatch({
        phrases: [
          {
            kind: "coverage_angle",
            id: "bad",
            slot: "S1",
            section: "verse",
            song: [0, 4],
            move: MOVE,
            framing: "medium",
            sourcePath: "x.mp4",
            sourceSeconds: 4,
            angle: "side",
            keep: [],
          },
        ],
      }),
    ).toThrow(/keep\[\]/);
  });

  it("never routes a singing coverage_take to DoP/Kling", () => {
    const result = compileToWorldBatch({
      phrases: [
        {
          kind: "coverage_take",
          id: "S01a",
          slot: "S01",
          section: "verse",
          song: [10, 12],
          move: MOVE,
          framing: "wide",
          sourcePath: "take.mp4",
          sourceSeconds: 2,
        },
      ],
    });
    expect(result.shots).toHaveLength(0);
    expect(result.stubs[0].route).toBe("take_move");
    const json = toShotsJson(result);
    expect(json).toBe("[]");
    expect(toStubsJson(result)).toContain("take_move");
  });

  it("hero_broll_i2v uses still_dop/still_kling from hero still (non-singing)", () => {
    const result = compileToWorldBatch({
      phrases: [
        {
          kind: "hero_broll",
          id: "B1_push",
          prompt: "locked hero, cold room",
          motion: "slow push-in, camera only",
          heroStillPath: "project-references/u/p/hero.jpg",
          seconds: 7,
          routeHint: "still_dop",
        },
      ],
    });
    expect(result.shots).toHaveLength(1);
    expect(result.shots[0].route).toBe("still_dop");
    expect(result.shots[0].kind).toBe("plate");
    expect(result.shots[0].seconds).toBe(10);
    expect(result.shots[0].still_path).toBe("project-references/u/p/hero.jpg");
    expect(result.stubs).toHaveLength(0);
  });

  it("world phrase emits still_kling with motion contract + typed camera", () => {
    const result = compileToWorldBatch({
      phrases: [
        {
          kind: "world",
          id: "H1_bear",
          song: [20, 25],
          lyric: "Yves Saint Laurent on the weekend",
          prompt: "arctic room, one subject, door in the far wall",
          motion: {
            entrance: "door opens",
            primary: "subject steps into cold light",
            secondary: "breath fog",
            exit: "cut on the slam",
          },
          camera: MOVE,
          seconds: 5,
        },
      ],
      lookPresetId: "film_bar_v1",
    });
    const s = result.shots[0];
    expect(s.id).toBe("H1_bear");
    expect(s.kind).toBe("world");
    expect(s.route).toBe("still_kling");
    expect(s.seconds).toBe(5);
    expect(s.motion).toContain("door opens");
    expect(s.motion).toContain("push 0.16");
    expect(s.prompt).toContain("arctic room");
    expect(result.lookPresetId).toBe(DEFAULT_LOOK_PRESET_ID);
  });

  it("living_plate is a compositor stub, not a paid shot", () => {
    const result = compileToWorldBatch({
      phrases: [
        {
          kind: "living_plate",
          id: "LP1",
          takePath: "takes/S11.mp4",
          platePath: "plates/arctic.mp4",
          song: [84, 88],
        },
      ],
    });
    expect(result.shots).toHaveLength(0);
    expect(result.stubs[0]).toMatchObject({
      route: "living_plate",
      provider: false,
      takePath: "takes/S11.mp4",
      platePath: "plates/arctic.mp4",
    });
  });

  it("emitted seedance shot matches run_world_batch shots.json field set", () => {
    const input: ShotCompilerInput = {
      phrases: [
        {
          kind: "coverage_angle",
          id: "S11c_low_hero",
          slot: "S11",
          section: "hook",
          song: [84.59, 86.557],
          move: MOVE,
          framing: "medium_close",
          sourcePath: "project-clips/x/S11.mp4",
          sourceLocal: "/tmp/S11.mp4",
          sourceSeconds: 4,
          angle: "a low hero angle from knee height looking up, 28mm, fast push-in",
          keep: KEEP,
          resolution: "720p",
        },
      ],
      aspectDefault: "9:16",
    };
    const shot = compileToWorldBatch(input).shots[0];
    const keys = Object.keys(shot).sort();
    // Required dialect keys from run_world_batch.py header
    for (const k of [
      "id",
      "kind",
      "aspect",
      "seconds",
      "prompt",
      "motion",
      "route",
      "source_path",
      "source_local",
      "angle",
      "keep",
      "resolution",
    ]) {
      expect(keys).toContain(k);
    }
    expect(shot.kind).toBe("angle");
    expect(shot.route).toBe("seedance_ref");
    expect(JSON.parse(toShotsJson(compileToWorldBatch(input)))[0].keep).toEqual(KEEP);
  });

  it("look preset preamble in film_bar_v1 mirrors config/look_presets.json", () => {
    const json = JSON.parse(readFileSync(resolve(process.cwd(), "config/look_presets.json"), "utf8"));
    expect(LOOK_PRESETS.film_bar_v1.preamble).toBe(json.film_bar_v1.preamble);
    expect(LOOK_PRESETS.film_bar_v1.shot_suffix).toBe(json.film_bar_v1.shot_suffix);
  });

  it("mixed compile: stubs stay out of shots.json", () => {
    const result = compileToWorldBatch({
      phrases: [
        {
          kind: "coverage_take",
          id: "a",
          slot: "S",
          section: "verse",
          song: [0, 2],
          move: MOVE,
          framing: "medium",
          sourcePath: "t.mp4",
          sourceSeconds: 2,
        },
        {
          kind: "world",
          id: "w",
          song: [2, 7],
          prompt: "street plate",
          motion: { entrance: "in", primary: "walk", secondary: "cars", exit: "out" },
          camera: MOVE,
        },
        {
          kind: "living_plate",
          id: "lp",
          takePath: "t.mp4",
          platePath: "p.mp4",
          song: [7, 10],
        },
      ],
    });
    expect(result.shots.map((s) => s.id)).toEqual(["w"]);
    expect(result.stubs.map((s) => s.route)).toEqual(["take_move", "living_plate"]);
    expect(JSON.parse(toShotsJson(result))).toHaveLength(1);
    expect(JSON.parse(toStubsJson(result))).toHaveLength(2);
  });
});
