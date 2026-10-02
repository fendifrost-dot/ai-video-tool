import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseShotSpec } from "@/lib/treatment/shotSpec";
import type { LyricLine } from "@/lib/lyrics/lyricsForShot";
import {
  compileToWorldBatch,
  compositorArgs,
  phrasesFromCoveragePlan,
  phrasesFromShotSpecs,
  toCoveragePlan,
  toShotsJson,
  toStubsJson,
  type PlannerAngleRequest,
  type PlannerPlan,
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
    expect(s.source_seconds).toBe(4);
    expect(s.source_window).toEqual([66.885, 68.853]);
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
    expect(result.shots[0].prompt).toBe("locked hero, cold room");
    expect(result.shots[0].motion).toBe("slow push-in, camera only");
    expect("heroStillUrl" in result.shots[0]).toBe(false);
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
    // the dialect's prompt is THE SCENE: run_world_batch.py wraps it in the look preset itself, so the compiler
    // must not pre-wrap (the preamble and suffix used to be sent twice)
    expect(s.prompt).toBe("arctic room, one subject, door in the far wall");
    expect(s.prompt).not.toContain(LOOK_PRESETS[DEFAULT_LOOK_PRESET_ID].preamble.slice(0, 20));
    expect(s.prompt).not.toContain(LOOK_PRESETS[DEFAULT_LOOK_PRESET_ID].shot_suffix);
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

describe("stubs reach the scripts lane", () => {
  it("take_move stubs → coverage_plan.json that camera_coverage.py render consumes", () => {
    const result = compileToWorldBatch({
      phrases: [
        {
          kind: "coverage_take", id: "S06a", slot: "S06", section: "hook", song: [66.885, 68.853], move: MOVE,
          framing: "medium", sourcePath: "/x/S06_live.mp4", sourceSeconds: 1.968, transition: "cut",
          matteDir: "/x/mattes/S06", plate: "/x/P_runway_k.mp4", plateLoop: true, masterStart: 61.597,
        },
        {
          kind: "coverage_take", id: "S06b", slot: "S06", section: "hook", song: [68.853, 70.82],
          move: { ...MOVE, type: "pull" }, framing: "close_up", sourcePath: "/x/S06_live.mp4", sourceSeconds: 1.968,
          matteDir: "/x/mattes/S06", plate: "/x/P_runway_k.mp4", plateLoop: true, masterStart: 61.597,
        },
      ],
    });
    const plan = toCoveragePlan(result, { outDir: "/x/bar5", bpm: 122 });
    expect(plan.slots).toHaveLength(1);
    const slot = plan.slots[0];
    expect(slot.slot).toBe("S06");
    expect(slot.song).toEqual([66.885, 70.82]);
    expect(slot.source).toBe("/x/S06_live.mp4");
    expect(slot.masterStart).toBe(61.597);
    expect(slot.matte_dir).toBe("/x/mattes/S06");
    expect(slot.plate_loop).toBe(true);
    expect(slot.subs.map((x) => x.id)).toEqual(["S06a", "S06b"]);
    expect(slot.subs[0].variant).toBe("/x/bar5/variants/S06a_push.mp4");
    expect(slot.subs[1].variant).toBe("/x/bar5/variants/S06b_pull.mp4");
    expect(slot.subs[0].source).toBe("take");
    expect(slot.subs[0].lens).toBe("anamorphic_35");
  });

  it("living_plate stub carries the compositor's placement + occluder as argv", () => {
    const result = compileToWorldBatch({
      phrases: [
        {
          kind: "living_plate", id: "S11_stoop", takePath: "/x/S11_cut.mp4", platePath: "/x/stoop.jpg", song: [84.59, 88.5],
          placement: { matchPlate: 0.7, fgPlace: [0.3, 0.25, 0.48], fgAnchor: "bottom", occluderAuto: [0, 0.33, 1, 1], occluderBelow: 0.47 },
        },
      ],
    });
    const args = compositorArgs(result.stubs[0], "/x/S11_env.mp4");
    expect(args.join(" ")).toBe(
      "scripts/edit/composite_environment.py --in /x/S11_cut.mp4 --plate /x/stoop.jpg --out /x/S11_env.mp4 --match-plate 0.7 --fg-place 0.3,0.25,0.48 --fg-anchor bottom --occluder-auto 0,0.33,1,1 --occluder-below 0.47",
    );
  });
});

describe("phrases come from the planner and the storyboard (A2)", () => {
  const plan: PlannerPlan = {
    bpm: 122,
    slots: [
      {
        slot: "S06", section: "hook", song: [66.885, 70.82], source: "/x/S06_live.mp4", masterStart: 61.597,
        matte_dir: "/x/mattes/S06", plate: "/x/P_runway_k.mp4", plate_loop: true,
        subs: [
          { id: "S06a", slot: "S06", section: "hook", song: [66.885, 68.853], move: { type: "orbit", amount: 0.1, ease: "in_out" }, handheld: 0.25, lens: "anamorphic_35", framing: "medium", source: "take", transition: "whip_left" },
          { id: "S06c", slot: "S06", section: "hook", song: [68.853, 70.82], move: { type: "snap_zoom", amount: 0.3, ease: "linear" }, handheld: 0.5, lens: "handheld_24", framing: "close_up", source: "angle", angle: "a low hero angle" },
        ],
      },
    ],
  };
  const angles: PlannerAngleRequest[] = [
    { id: "S06c_low_hero", kind: "angle", route: "seedance_ref", aspect: "9:16", resolution: "720p", source_path: null, source_local: "/x/S06_live.mp4", source_window: [68.853, 70.82], masterStart: 61.597, angle: "a low hero angle from knee height looking up, 28mm, fast push-in", keep: [] },
  ];

  it("coverage_plan.json + angle_requests.json → take + angle phrases; keep[] and project-clips paths supplied by the caller", () => {
    const phrases = phrasesFromCoveragePlan(plan, angles, { keep: KEEP, sourcePaths: { S06: "project-clips/u/p/S06_live.mp4" } });
    expect(phrases.map((p) => p.kind)).toEqual(["coverage_take", "coverage_angle"]);
    const take = phrases[0] as Extract<CompilerPhrase, { kind: "coverage_take" }>;
    expect(take.sourcePath).toBe("project-clips/u/p/S06_live.mp4");
    expect(take.sourceLocal).toBe("/x/S06_live.mp4");
    expect(take.move).toEqual({ type: "orbit", amount: 0.1, ease: "in_out", handheld: 0.25, lens: "anamorphic_35", start: undefined, end: undefined, direction: undefined });
    expect(take.transition).toBe("whip_left");
    expect(take.masterStart).toBe(61.597);
    const angle = phrases[1] as Extract<CompilerPhrase, { kind: "coverage_angle" }>;
    expect(angle.id).toBe("S06c_low_hero");
    expect(angle.keep).toEqual(KEEP);
    expect(angle.angle).toContain("knee height");
    expect(angle.sourceSeconds).toBeCloseTo(1.967, 2);
    // and the whole thing compiles to one $0 stub + one seedance shot in the dialect
    const result = compileToWorldBatch({ phrases });
    expect(result.stubs).toHaveLength(1);
    expect(result.shots).toHaveLength(1);
    expect(result.shots[0].route).toBe("seedance_ref");
    expect(result.shots[0].source_window).toEqual([68.853, 70.82]);
  });

  it("storyboard cards that are not performance → world phrases with the lyric sung inside the window", () => {
    const spec = parseShotSpec({
      id: "clip-09", purpose: "the tailor at his bench, Yves Saint Laurent on the weekend", kind: "broll", shotType: "b_roll",
      timeline: { start: 47.2, end: 49.2 },
      environment: { description: "a Paris atelier, overcast window light" },
      cameraMotion: { type: "dolly", description: "push 0.16 · anamorphic_35 · handheld 0.25" },
      transitionIn: { preset: "whip_left" }, requiredElements: ["the tape measure"],
      fx: [{ type: "dust", description: "dust in the window light" }],
    });
    const perf = parseShotSpec({ id: "clip-10", purpose: "him on the stoop", shotType: "performance", timeline: { start: 49.2, end: 51.2 } });
    const lines: LyricLine[] = [
      { lineIndex: 0, section: "verse", text: "Yves Saint Laurent on the weekend", start: 47.6, end: 49.0, confidence: 0.9, words: [] },
      { lineIndex: 1, section: "verse", text: "rambling too", start: 49.5, end: 50.4, confidence: 0.9, words: [] },
    ];
    const phrases = phrasesFromShotSpecs([spec, perf], lines);
    expect(phrases).toHaveLength(1);
    const w = phrases[0] as Extract<CompilerPhrase, { kind: "world" }>;
    expect(w.id).toBe("clip-09");
    expect(w.lyric).toBe("Yves Saint Laurent on the weekend");
    expect(w.prompt).toContain("Paris atelier");
    expect(w.prompt).toContain("Must include: the tape measure.");
    expect(w.camera).toEqual({ type: "push", amount: 0.16, ease: "in_out", handheld: 0.25, lens: "anamorphic_35" });
    expect(w.motion.entrance).toBe("arrives on a whip left");
    expect(w.motion.secondary).toBe("dust in the window light");
    const shot = compileToWorldBatch({ phrases }).shots[0];
    expect(shot.kind).toBe("world");
    expect(shot.prompt).toBe(w.prompt);
  });
});
