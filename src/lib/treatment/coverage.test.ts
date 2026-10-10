import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseShotSpec } from "./shotSpec";
import { applyCoverageDefaults, classifyMotion, DEFAULT_COVERAGE_PRESETS, measureCoverage } from "./coverage";

const perf = (id: string, start: number, end: number, extra: Record<string, unknown> = {}) =>
  parseShotSpec({ id, purpose: "line", shotType: "performance", timeline: { start, end }, ...extra });

describe("applyCoverageDefaults", () => {
  it("gives every unset performance card a move and a framing, deterministically", () => {
    const specs = [perf("a", 0, 4), perf("b", 4, 8), perf("c", 8, 12)];
    const once = applyCoverageDefaults(specs);
    const twice = applyCoverageDefaults(specs);
    expect(once.map((s) => s.cameraMotion.description)).toEqual(twice.map((s) => s.cameraMotion.description));
    for (const s of once) { expect(s.cameraMotion.description).not.toBe(""); expect(s.framing).not.toBeNull(); }
  });
  it("keeps the director's own motion and framing", () => {
    const [s] = applyCoverageDefaults([perf("a", 0, 4, { cameraMotion: { type: "static", description: "locked off on purpose" }, framing: "wide" })]);
    expect(s.cameraMotion.description).toBe("locked off on purpose");
    expect(s.cameraMotion.type).toBe("static");
    expect(s.framing).toBe("wide");
  });
  it("reads the generator's prose into the typed move (the treatment writes cameras as text)", () => {
    expect(classifyMotion({ type: "static", description: "50mm macro, slight push-in" })).toBe("push");
    expect(classifyMotion({ type: "static", description: "24mm wide shot, locked frame" })).toBe("static");
    expect(classifyMotion({ type: "static", description: "slow lateral track with him" })).toBe("truck");
    expect(classifyMotion({ type: "static", description: "crash zoom on the chain" })).toBe("snap_zoom");
    expect(classifyMotion({ type: "static", description: "harsh light, polished floor" })).toBe("");
    expect(classifyMotion({ type: "orbit", description: "" })).toBe("orbit");
    // a forward move said the way the writer says it on an aerial or an approach is a push, not "no move named"
    expect(classifyMotion({ type: "static", description: "Slow forward aerial advance from high altitude." })).toBe("push");
    expect(classifyMotion({ type: "static", description: "Slow forward aerial advance tightening on the monogram." })).toBe("push");
    expect(classifyMotion({ type: "static", description: "the drone glides forward over the rooftops" })).toBe("push");
    expect(classifyMotion({ type: "static", description: "the drone flies over the tree line" })).toBe("push");
    expect(classifyMotion({ type: "static", description: "the sign fills the frame, tightening on its lettering" })).toBe("push");
    // an explicit static still wins over an incidental forward word
    expect(classifyMotion({ type: "static", description: "locked frame as the car approaches" })).toBe("static");
    // what the SUBJECT does is not the camera: these shots pull back, pan, or name no move at all
    expect(classifyMotion({ type: "static", description: "slow pull back as the crowd advances" })).toBe("pull");
    expect(classifyMotion({ type: "static", description: "pan left as the car approaches" })).toBe("pan");
    expect(classifyMotion({ type: "static", description: "Medium tracking shot moving backward as the group advances." })).toBe("");
    expect(classifyMotion({ type: "static", description: "low angle on the floor and sign area as the group advances" })).toBe("");
    expect(classifyMotion({ type: "static", description: "birds flying over the tree line" })).toBe("");
    const [a, b] = applyCoverageDefaults([
      perf("a", 0, 4, { cameraMotion: { type: "static", description: "50mm macro, slight push-in" } }),
      perf("b", 4, 8, { cameraMotion: { type: "static", description: "harsh light, polished floor" } }),
    ]);
    expect(a.cameraMotion.type).toBe("dolly");
    expect(a.cameraMotion.description).toBe("50mm macro, slight push-in");
    expect(b.cameraMotion.type).not.toBe("static");
    expect(b.cameraMotion.description).toMatch(/harsh light, polished floor$/);
  });
  it("suggests the section's transition on its first card and leaves a card's own transition alone", () => {
    const lines = [{ section: "verse", start: 0, end: 8 }, { section: "hook", start: 8, end: 16 }];
    const out = applyCoverageDefaults([perf("v1", 0, 4), perf("v2", 4, 8), perf("h1", 8, 12), perf("h2", 12, 16, { transitionIn: { type: "glitch" } })], DEFAULT_COVERAGE_PRESETS, lines);
    expect(out[2].transitionIn.preset).toBe("whip_left");
    expect(out[2].transitionIn.type).toBe("whip_pan");
    expect(out[3].transitionIn.type).toBe("glitch");
    expect(out[0].transitionIn.preset).toBeNull();
  });
  it("measures static share and static runs against the rules, where the cards are written", () => {
    const locked = { cameraMotion: { type: "static", description: "24mm wide shot, locked frame" } };
    const report = measureCoverage([perf("a", 0, 4, locked), perf("b", 4, 8, locked), perf("c", 8, 12, { cameraMotion: { type: "static", description: "slow push-in" } })]);
    expect(report.pass).toBe(false);
    expect(report.sections[0].staticShare).toBeCloseTo(8 / 12);
    expect(report.sections[0].longestStaticRunSeconds).toBe(8);
    expect(report.findings.map((f) => f.rule)).toEqual(expect.arrayContaining(["static_share_max", "max_static_run_s"]));
    expect(Object.keys(report.flaggedShotIds).sort()).toEqual(["a", "b"]);
    const moving = measureCoverage(applyCoverageDefaults([perf("a", 0, 4), perf("b", 4, 8), perf("c", 8, 12)]));
    expect(moving.findings.filter((f) => f.rule === "static_share_max")).toEqual([]);
  });
  it("never repeats a move on consecutive cards", () => {
    const specs = Array.from({ length: 12 }, (_, i) => perf(`s${i}`, i * 2, i * 2 + 2));
    const out = applyCoverageDefaults(specs);
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1].cameraMotion.description.split(" ")[0]; const b = out[i].cameraMotion.description.split(" ")[0];
      if (a !== "static") expect(b).not.toBe(a);
    }
  });
  it("uses the hook vocabulary when lyric lines say hook", () => {
    const out = applyCoverageDefaults([perf("h", 60, 62)], DEFAULT_COVERAGE_PRESETS, [{ section: "hook", start: 60, end: 62 }]);
    const move = out[0].cameraMotion.description.split(" ")[0];
    expect(DEFAULT_COVERAGE_PRESETS.sections.hook.moves.map((m) => m.type)).toContain(move);
  });
  it("mirrors config/coverage_presets.json (the scripts lane's source of truth)", () => {
    const json = JSON.parse(readFileSync(resolve(process.cwd(), "config/coverage_presets.json"), "utf8"));
    for (const [name, sec] of Object.entries(DEFAULT_COVERAGE_PRESETS.sections)) {
      expect(json.sections[name].moves.map((m: { type: string; weight: number }) => [m.type, m.weight])).toEqual(sec.moves.map((m) => [m.type, m.weight]));
      expect(json.sections[name].cut_every_bars).toBe(sec.cut_every_bars);
    }
    expect(json.rules.framing_rotation).toEqual(DEFAULT_COVERAGE_PRESETS.rules.framing_rotation);
  });
});
