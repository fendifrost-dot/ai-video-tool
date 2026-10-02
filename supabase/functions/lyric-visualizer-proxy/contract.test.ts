import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildSystemPrompt,
  isLyricMode,
  LYRIC_MODES,
  renderTemplate,
  scenesInstruction,
  scenesPerLine,
  SCENES_ALL,
  shotInstruction,
  templateMatches,
  templateSlots,
} from "./contract";
import { legacySystemPrompt } from "./legacyPrompt.golden";

const here = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(resolve(here, "./index.ts"), "utf8");
const flat = indexSource.replace(/\s+/g, " ");

const ARGS = {
  clipSeconds: 6,
  exemplars: "1. a reel\n2. another reel",
  rules: "- do not redescribe the chains",
  limits: "- crowds\n- hands",
};

describe("mode: all is byte-identical to what shipped", () => {
  it("matches the golden prompt with no template and no shot", () => {
    const built = buildSystemPrompt({ mode: "all", ...ARGS, templateBody: null, shot: null });
    expect(built).toBe(
      legacySystemPrompt(ARGS.clipSeconds, ARGS.exemplars, ARGS.rules, ARGS.limits),
    );
  });

  it("is the default when the caller sends no mode at all", () => {
    expect(flat).toContain('const mode: LyricMode = body.mode ?? "all"');
  });

  it("still asks for three scenes", () => {
    expect(scenesInstruction("all")).toBe(SCENES_ALL);
    expect(scenesPerLine("all")).toBe(3);
  });
});

describe("the other modes ask for exactly one scene", () => {
  it.each(["literal", "surreal", "performance"] as const)("%s", (mode) => {
    expect(scenesPerLine(mode)).toBe(1);
    expect(scenesInstruction(mode)).toMatch(/EXACTLY ONE/);
    expect(scenesInstruction(mode)).not.toBe(SCENES_ALL);
  });

  it("literal makes the line's own nouns the things in frame", () => {
    const s = scenesInstruction("literal");
    expect(s).toMatch(/every noun the line says is a physical thing the camera sees/);
    expect(s).toMatch(/No symbol stands in for an object the line already names/);
  });

  it("performance leaves the centre foreground clear", () => {
    expect(scenesInstruction("performance")).toMatch(/centre foreground clear/);
  });

  it("validates the mode rather than silently falling back", () => {
    expect(LYRIC_MODES).toEqual(["all", "literal", "surreal", "performance"]);
    expect(isLyricMode("literal")).toBe(true);
    expect(isLyricMode("Literal")).toBe(false);
    expect(isLyricMode("")).toBe(false);
    expect(flat).toContain('error: "bad_mode"');
  });
});

describe("template slots are filled or stripped — never shipped braced", () => {
  it("fills every slot the context supplies", () => {
    const out = renderTemplate("Turn {{project.title}} into a piece for {{project.audience}}.", {
      "project.title": "Ice On",
      "project.audience": "late-night streaming",
    });
    expect(out).toBe("Turn Ice On into a piece for late-night streaming.");
  });

  it("strips a slot the context cannot fill, leaving no braces behind", () => {
    const out = renderTemplate("Keep {{artist.name}} ({{artist.description}}) consistent.", {
      "artist.name": "the artist",
    });
    expect(out).not.toMatch(/\{\{|\}\}/);
    expect(out).toBe("Keep the artist consistent.");
  });

  it("removes a parenthetical that held only unfilled slots", () => {
    const out = renderTemplate("Style: the look preset ({{look.name}}: {{look.preamble}}).", {});
    expect(out).toBe("Style: the look preset.");
  });

  it("treats a blank or whitespace value as unfilled", () => {
    expect(renderTemplate("A {{x}} B", { x: "   " })).toBe("A B");
    expect(renderTemplate("A {{x}} B", { x: "" })).toBe("A B");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(renderTemplate("{{  project.title  }}", { "project.title": "Ice On" })).toBe("Ice On");
  });

  it("renders the real seed template with no brace surviving", () => {
    const seed = readFileSync(
      resolve(here, "../../migrations/20261002030000_seed_motion_story_template.sql"),
      "utf8",
    );
    const body = seed.slice(seed.indexOf("$tpl$") + 5, seed.lastIndexOf("$tpl$"));
    expect(body).toMatch(/\{\{project\.title\}\}/); // the fixture is the real thing
    const rendered = renderTemplate(body, templateSlots({ project: { title: "Ice On" } }));
    expect(rendered).not.toMatch(/\{\{|\}\}/);
    expect(rendered).toContain("Ice On");
  });
});

describe("templateSlots", () => {
  it("flattens the request context into the dotted keys the seeds use", () => {
    expect(
      templateSlots({
        project: { title: "Ice On", audience: null },
        look: { name: "film_bar_v1", preamble: "4:3, grain 1" },
        artist: { name: "Fendi", description: "glasses, beard" },
      }),
    ).toEqual({
      "project.title": "Ice On",
      "look.name": "film_bar_v1",
      "look.preamble": "4:3, grain 1",
      "artist.name": "Fendi",
      "artist.description": "glasses, beard",
    });
  });

  it("drops empty values so they are stripped, not rendered blank", () => {
    expect(templateSlots({ project: { title: "  " } })).toEqual({});
    expect(templateSlots(null)).toEqual({});
  });
});

describe("templateMatches", () => {
  const row = {
    name: "Story-led motion piece",
    default_settings_json: { template_json: "config/treatment_templates/motion_story_v1.json" },
  };

  it("matches by the row's name", () => {
    expect(templateMatches(row, "Story-led motion piece")).toBe(true);
    expect(templateMatches(row, "story-led MOTION piece")).toBe(true);
  });

  it("matches by the structured file's basename — the id the plan and handoffs use", () => {
    expect(templateMatches(row, "motion_story_v1")).toBe(true);
  });

  it("does not match something else", () => {
    expect(templateMatches(row, "motion_story_v2")).toBe(false);
    expect(templateMatches({ name: "x", default_settings_json: null }, "motion_story_v1")).toBe(
      false,
    );
  });
});

describe("the shot window", () => {
  it("is absent when nothing useful was given", () => {
    expect(shotInstruction(null)).toBeNull();
    expect(shotInstruction({})).toBeNull();
  });

  it("names the window, the section and the choices already made", () => {
    const s = shotInstruction({
      start: 12,
      end: 18.5,
      section: "hook",
      framing: "close_up",
      cameraMotion: "orbit",
    })!;
    expect(s).toContain("12.00s–18.50s");
    expect(s).toContain("6.50s long");
    expect(s).toContain("the hook section");
    expect(s).toContain("close_up");
    expect(s).toContain("orbit");
    expect(s).toMatch(/honour the framing and camera move/);
  });

  it("is appended to the prompt only when present", () => {
    const without = buildSystemPrompt({ mode: "literal", ...ARGS, shot: null });
    const withShot = buildSystemPrompt({ mode: "literal", ...ARGS, shot: { start: 0, end: 4 } });
    expect(withShot.length).toBeGreaterThan(without.length);
    expect(withShot).toContain("0.00s–4.00s");
  });
});

describe("the template goes ahead of the standing instructions", () => {
  it("leads the prompt and says which half governs what", () => {
    const built = buildSystemPrompt({ mode: "all", ...ARGS, templateBody: "TEMPLATE BODY HERE" });
    expect(built.indexOf("TEMPLATE BODY HERE")).toBeLessThan(
      built.indexOf("You are the creative director"),
    );
    expect(built).toContain("the instructions after it govern the scenes themselves");
  });

  it("an empty rendered body changes nothing", () => {
    expect(buildSystemPrompt({ mode: "all", ...ARGS, templateBody: "   " })).toBe(
      buildSystemPrompt({ mode: "all", ...ARGS, templateBody: null }),
    );
  });
});

describe("the dry run reports the template it would have used", () => {
  it("resolves the template before the cost gate and the dry-run return", () => {
    const resolveAt = indexSource.indexOf("templateName = row.name");
    const gateAt = indexSource.indexOf('error: "cost_gate"');
    const dryAt = indexSource.indexOf("body.dryRun");
    expect(resolveAt).toBeGreaterThan(-1);
    expect(resolveAt).toBeLessThan(gateAt);
    expect(resolveAt).toBeLessThan(dryAt);
  });

  it("carries mode and template on the plan, which both the gate and the dry run spread", () => {
    expect(flat).toContain(
      "const plan = { lines: body.lines.length, mode, template: templateName,",
    );
    expect(flat).toContain("ok: true, dryRun: true, billed: false, model, ...plan");
  });

  it("reads seed templates only", () => {
    expect(flat).toContain('.eq("is_seed", true)');
  });
});

describe("the cost gate stays honest about the mode", () => {
  it("estimates one scene per line outside 'all'", () => {
    expect(flat).toContain("body.lines.length * scenesPerLine(mode) * 450");
  });
});
