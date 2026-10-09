import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildSystemPrompt,
  isLyricMode,
  LYRIC_MODES,
  neighboursInstruction,
  projectStateInstruction,
  LOOK_IS_NOT_PLACE,
  renderTemplate,
  scenesInstruction,
  scenesPerLine,
  SCENES_ALL,
  shotInstruction,
  templateMatches,
  templateSlots,
} from "./contract.ts";
import { legacySystemPrompt } from "./legacyPrompt.golden.ts";

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

describe("the treatment is the one creative brief (2026-10-03)", () => {
  const base = { ...ARGS, mode: "literal" as const };

  it("present, it outranks the standing notes and may ask for a mark or a crowd", () => {
    const p = buildSystemPrompt({ ...base, treatment: "A monogram burns in the forest; models cross in formation.", projectState: { constraints: ["PLACES (reuse these, do not invent others): the runway"] } });
    expect(p).toContain("except a mark the treatment itself calls for");
    expect(p).toContain("a crowd, a formation or a group the treatment asks for is what the beat needs");
    expect(p).toContain("The one exception is `constraints`, the director's standing notes");
    expect(p).toContain("the treatment is the later decision and wins");
    // the project's standing look rides in the request as `currentEnvironment`: it is a look, not the map
    expect(p).toContain(LOOK_IS_NOT_PLACE);
    expect(p.indexOf(LOOK_IS_NOT_PLACE)).toBeGreaterThan(p.indexOf("The treatment (every scene serves it"));
    // no notes sent: nothing is said about them
    expect(buildSystemPrompt({ ...base, treatment: "T", projectState: { window: [0, 4] } })).not.toContain("The one exception is `constraints`");
  });

  it("absent, the prompt is exactly what it was", () => {
    expect(buildSystemPrompt({ ...base, treatment: null, neighbours: null, projectState: null, hasExemplars: true })).toBe(buildSystemPrompt(base));
    expect(buildSystemPrompt({ ...base, treatment: "   " })).toBe(buildSystemPrompt(base));
    expect(buildSystemPrompt({ ...ARGS, mode: "all", treatment: "" })).toBe(
      legacySystemPrompt(ARGS.clipSeconds, ARGS.exemplars, ARGS.rules, ARGS.limits),
    );
  });

  it("present, it replaces the exemplars as the brief", () => {
    const p = buildSystemPrompt({ ...base, exemplars: "- (none supplied)", treatment: "A winter palace of ice.", hasExemplars: false });
    expect(p).toContain("The treatment (every scene serves it; none contradicts it):\nA winter palace of ice.");
    expect(p).toContain("inside the treatment below, which is the one creative brief for this video");
    expect(p).not.toContain("exemplars");
  });

  it("exemplars go in beside a treatment only when some were really supplied", () => {
    const p = buildSystemPrompt({ ...base, treatment: "A winter palace of ice.", hasExemplars: true });
    expect(p).toContain("The artist's exemplars (this is the bar):");
  });

  it("neighbours are stated only with a treatment, and only the ones that exist", () => {
    expect(neighboursInstruction(null)).toBeNull();
    expect(neighboursInstruction({ before: " ", after: null })).toBeNull();
    expect(neighboursInstruction({ before: "insert: a Bentley at the kerb", after: null })).toMatch(/Before: insert: a Bentley at the kerb$/);
    const p = buildSystemPrompt({ ...base, treatment: "T", neighbours: { before: "performance: he raps", after: "insert: the rim" } });
    expect(p).toContain("Before: performance: he raps\nAfter: insert: the rim");
    expect(buildSystemPrompt({ ...base, neighbours: { before: "x", after: "y" } })).toBe(buildSystemPrompt(base));
  });

  it("project state is carried as data, after the rules, and says it is not direction", () => {
    expect(projectStateInstruction(null)).toBeNull();
    expect(projectStateInstruction({})).toBeNull();
    const state = { song_window_seconds: [32, 36.2], performance_source: { take: "Take 1", source_range_seconds: [31.15, 35.35] } };
    const p = buildSystemPrompt({ ...base, treatment: "T", projectState: state });
    expect(p.endsWith(JSON.stringify(state))).toBe(true);
    expect(p).toContain("locked facts, given as data. This is not creative direction");
    expect(p.indexOf("Locked rules")).toBeLessThan(p.indexOf("Project state"));
  });

  it("a box that plays the real take is written as the place he performs in, in what he wears", () => {
    // no take: the instruction is what it always was
    expect(projectStateInstruction({ song_window_seconds: [0, 4], performance_source: null })).not.toContain("real performance");
    const bare = projectStateInstruction({ performance_source: { take: "Take 1", source_range_seconds: [31.15, 35.35] } })!;
    expect(bare).toContain("Write this box's scene as the PLACE he performs in");
    expect(bare).toContain("do not describe other clothes on him");
    const told = projectStateInstruction({ performance_source: { take: "Take 1", source_range_seconds: [31.15, 35.35], he_wears: "a camouflage shirt and a navy cap", filmed_in: "a walk-in closet" } })!;
    expect(told).toContain("exactly what he_wears says — never dress him in anything else");
    expect(told).toContain("the place it was filmed in (filmed_in) is replaced by yours, not described");
    // still data after the instruction
    expect(told.endsWith('"filmed_in":"a walk-in closet"}}')).toBe(true);
  });

  it("the function passes the three fields through and caps the treatment", () => {
    expect(flat).toContain("treatment: typeof body.treatment === \"string\" ? body.treatment.slice(0, MAX_TREATMENT_CHARS) : null");
    expect(flat).toContain("neighbours: body.neighbours ?? null");
    expect(flat).toContain("projectState: body.projectState ?? null");
    expect(flat).toContain("hasExemplars: (body.exemplars ?? []).length > 0");
  });
});
