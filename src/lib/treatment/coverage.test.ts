import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseShotSpec } from "./shotSpec";
import { applyCoverageDefaults, DEFAULT_COVERAGE_PRESETS } from "./coverage";

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
    expect(s.framing).toBe("wide");
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
