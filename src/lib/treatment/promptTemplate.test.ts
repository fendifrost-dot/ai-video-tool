import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderPromptTemplate, templateSlotsFor } from "./promptTemplate";
import {
  renderTemplate as edgeRender,
  templateSlots as edgeSlots,
} from "../../../supabase/functions/lyric-visualizer-proxy/contract";

const SEED_SQL = resolve(
  process.cwd(),
  "supabase/migrations/20261002030000_seed_motion_story_template.sql",
);

/** The real seeded template body, read from the migration that creates it. */
function seedBody(): string {
  const sql = readFileSync(SEED_SQL, "utf8");
  return sql.slice(sql.indexOf("$tpl$") + 5, sql.lastIndexOf("$tpl$"));
}

describe("slots are filled or stripped", () => {
  it("fills what the project supplies", () => {
    expect(
      renderPromptTemplate("Turn {{project.title}} into a piece.", { "project.title": "Ice On" }),
    ).toBe("Turn Ice On into a piece.");
  });

  it("leaves no brace behind on the real seed template", () => {
    const body = seedBody();
    expect(body).toMatch(/\{\{/); // the fixture really is a slotted template
    const rendered = renderPromptTemplate(
      body,
      templateSlotsFor({ project: { title: "Ice On" }, artist: { name: "the artist" } }),
    );
    expect(rendered).not.toMatch(/\{\{|\}\}/);
    expect(rendered).toContain("Ice On");
    expect(rendered).toContain("the artist");
  });

  it("takes the preposition with the slot it governed", () => {
    // "a piece for {{audience}}: every scene…" must not strip to "a piece for: every
    // scene…" — that is not a placeholder, but the model still reads broken prose and
    // compensates by inventing what the sentence looks like it is missing.
    expect(
      renderPromptTemplate("Turn it into a piece for {{project.audience}}: it moves.", {}),
    ).toBe("Turn it into a piece: it moves.");
    expect(renderPromptTemplate("shot with {{look.name}}, handheld", {})).toBe("shot, handheld");
    expect(renderPromptTemplate("a piece for {{x}}", {})).toBe("a piece");
  });

  it("keeps the preposition when the slot IS filled", () => {
    expect(
      renderPromptTemplate("a piece for {{project.audience}}: it moves.", {
        "project.audience": "late-night streaming",
      }),
    ).toBe("a piece for late-night streaming: it moves.");
  });

  it("leaves no brace, and no connector the template did not already have", () => {
    const body = seedBody();
    const DANGLER = /\b(?:for|with|in|of|as|to|on|at|from|by|about|into|like)\s*[:,.]/g;
    // The template's own prose contains "each with:" — legitimate. So the bar is not
    // "no connector before punctuation", it is "none that stripping INTRODUCED": every
    // occurrence must already be in the fully-filled render.
    const everything = {
      project: { title: "Ice On", audience: "late-night streaming" },
      look: { name: "film_bar_v1", preamble: "4:3" },
      artist: { name: "the artist", description: "glasses" },
    };
    const baseline = (renderPromptTemplate(body, templateSlotsFor(everything)).match(DANGLER) ?? [])
      .length;

    for (const ctx of [
      {},
      { project: { title: "Ice On" } },
      { look: { name: "film_bar_v1", preamble: "4:3" } },
      everything,
    ]) {
      const out = renderPromptTemplate(body, templateSlotsFor(ctx));
      expect(out, JSON.stringify(ctx)).not.toMatch(/\{\{|\}\}/);
      expect((out.match(DANGLER) ?? []).length, JSON.stringify(ctx)).toBe(baseline);
    }
  });

  it("drops a parenthetical left holding nothing", () => {
    expect(
      renderPromptTemplate("the look preset ({{look.name}}: {{look.preamble}}) applies", {}),
    ).toBe("the look preset applies");
  });
});

describe("the client and the edge function agree", () => {
  // Two copies exist because Deno cannot import from src/. This test is what stops them
  // drifting into two different prompts for the same template.
  const body = seedBody();
  const cases: Array<[string, Parameters<typeof templateSlotsFor>[0]]> = [
    ["nothing supplied", {}],
    ["title only", { project: { title: "Ice On" } }],
    ["look only", { look: { name: "film_bar_v1", preamble: "4:3, grain 1" } }],
    [
      "everything",
      {
        project: { title: "Ice On", audience: "late-night streaming" },
        look: { name: "film_bar_v1", preamble: "4:3, grain 1" },
        artist: { name: "the artist", description: "glasses, beard" },
      },
    ],
  ];

  it.each(cases)("%s", (_label, ctx) => {
    expect(templateSlotsFor(ctx)).toEqual(edgeSlots(ctx));
    expect(renderPromptTemplate(body, templateSlotsFor(ctx))).toBe(
      edgeRender(body, edgeSlots(ctx)),
    );
  });
});
