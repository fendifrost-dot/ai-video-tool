/**
 * REALISM A/B ARMS — write the two prompts the experiment compares, from the SHIPPED module.
 *
 *     npx tsx scripts/qa/realism_arms.mts --out qa/arms.json [--identity invent] [--temporal]
 *
 * The treatment arm is produced by `applyRealism` itself, not retyped here. If the modifier's
 * wording changes, the experiment's treatment arm changes with it, and a stale arms.json cannot
 * silently test an older version: `realismVersion` is written alongside and the runner records it.
 *
 * The control arm is the SAME base prompt with nothing appended — the only difference between the
 * arms is what the modifier adds. Anything else (model, resolution, aspect, project) is held fixed
 * by scripts/qa/realism_ab.py.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { applyRealism, REALISM_VERSION, type IdentityMode } from "../../src/lib/prompts/realism";
import type { CompiledPrompt } from "../../src/lib/prompts/types";

/**
 * A base prompt in the register AVT actually uses: a person in a real place, no styling language
 * that would trigger a withhold, so the arms differ ONLY by the realism wording. Deliberately
 * mentions no complexion, lens or film stock — those would put the control arm halfway to the
 * treatment and shrink the very effect being measured.
 */
const BASE =
  "A person standing in a doorway of a plain room, looking toward the camera, daylight from one side, waist-up framing";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? "") : fallback;
}

const identity = (arg("identity", "invent") ?? "invent") as IdentityMode;
const temporal = process.argv.includes("--temporal");
const out = arg("out", "qa/arms.json")!;

const blank: CompiledPrompt = {
  templateId: "ab",
  templateName: "realism a/b",
  templateProvider: null,
  templateCategory: "universal",
  promptText: BASE,
  negativePrompt: "",
  settings: {},
  unfilledPlaceholders: [],
  referenceImagePath: null,
  referenceImagePaths: [],
  realism: null,
  context: { projectId: "ab", artistId: null, shotId: null },
};

const applied = applyRealism(blank, { identity, temporal });

if (applied.realism.withheld.length > 0) {
  // The base prompt must not trigger a withhold, or the arms differ by less than the full modifier
  // and the experiment silently tests a weaker treatment than the one that shipped.
  console.error("base prompt triggers withholds; the arms would not isolate the modifier:");
  for (const w of applied.realism.withheld) console.error(`  - ${w.text} (conflicts with "${w.conflictsWith}")`);
  process.exit(1);
}

const arms = {
  control: BASE,
  treatment: applied.prompt.promptText,
  negativeControl: "",
  negativeTreatment: applied.prompt.negativePrompt,
  identity,
  temporal,
  realismVersion: REALISM_VERSION,
  generatedAt: new Date().toISOString(),
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(arms, null, 1));
console.log(`wrote ${out}`);
console.log(`\nCONTROL (${arms.control.length} chars):\n${arms.control}`);
console.log(`\nTREATMENT (${arms.treatment.length} chars):\n${arms.treatment}`);
console.log(`\nTREATMENT NEGATIVES:\n${arms.negativeTreatment}`);
