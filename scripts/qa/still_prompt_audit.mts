/**
 * What the image generator will ACTUALLY be asked for, composed by the SHIPPED code — not by reading spec_json.
 *
 * Two traps this exists to catch, both of which bit on 9 Oct 2026:
 *
 *  1. A box the director overrode keeps its original generated `purpose`, which can contradict the correction
 *     (c003's purpose still read "inside the burning monogram" while the director's frame said "No visible YSL
 *     letters"). `worldScene` decides which of the two a prompt is built from, so only calling it answers this.
 *
 *  2. The scene text is NOT the whole prompt. `boxShot` appends each cast entity's OWN words (castSource) to every
 *     non-performance still. A correction applied to the shot but not to the entity is therefore undone at the last
 *     step: THE_MODELS still described "the cleared strokes of the YSL monogram cut into the forest floor", so a
 *     ground shot whose own frame forbade the logo would still have asked for it. Auditing the scene alone MISSES
 *     this — the first version of this script passed all nine shots that were about to reproduce the bug.
 *
 * Usage: rows as JSON on stdin ({shots: [...], entities: {KEY: {...}}}).
 *   npx tsx scripts/qa/still_prompt_audit.mts < rows.json        (PRINT=1 also prints each full prompt)
 * Exit 1 if any composed prompt breaks its rule — nothing is generated, nothing is billed.
 */
import { worldScene } from "../../src/lib/shotCompiler/fromPlanner";
import { wrapPrompt } from "../../src/lib/shotCompiler/prompts";
import { LOOK_PRESETS, DEFAULT_LOOK_PRESET_ID } from "../../src/lib/shotCompiler/lookPresets";
import { PROMPT_CAPS } from "../../src/lib/worldBatch/rates";
import { castSource, type ShotCast } from "../../src/lib/casting/cast";

/** The logo rule, per the 9 Oct 2026 correction: the monogram reads from the AIR and nowhere else. */
const AERIAL = new Set(["c001", "c002"]);
const LOGO = /\bYSL\b|monogram/i;
/** The sentence FORBIDDING the logo must not itself count as the logo being asked for. */
const NEGATION = /No visible YSL letters, monogram geometry, or logo-shaped cleared paths\./gi;

const input = JSON.parse(await new Response(process.stdin as never).text()) as {
  shots: Array<Record<string, any>>;
  entities: Record<string, any>;
};
const look = LOOK_PRESETS[DEFAULT_LOOK_PRESET_ID];

let bad = 0;
for (const r of input.shots) {
  const spec = {
    environment: r.environment,
    purpose: r.purpose ?? "",
    openingFrame: r.openingFrame ?? "",
    performanceDirection: r.performanceDirection ?? "",
    requiredElements: r.requiredElements ?? [],
    origin: r.origin,
  } as never;
  const overridden = r.origin === "override" && String(r.performanceDirection ?? "").trim().length > 0;
  let prompt = wrapPrompt(worldScene(spec, overridden), look, { maxChars: PROMPT_CAPS.xai });

  // ...then the people, in the characters' own words — exactly as boxShot appends them.
  const refs = r.cast?.members ?? [];
  const cast: ShotCast = {
    open: !!r.cast?.open,
    none: !!r.cast?.none,
    missing: [],
    members: refs.flatMap((ref: any) => {
      const e = input.entities[ref.key];
      if (!e) return [];
      return [{
        ref: { key: ref.key, action: ref.action ?? "", placement: ref.placement ?? "", framing: ref.framing ?? "", identityMode: ref.identityMode ?? null },
        entity: { ...e, cast: { role: e.cast_role, identityMode: e.identity_mode, artistId: e.artist_id ?? null } },
        mode: ref.identityMode ?? e.identity_mode,
      }];
    }),
  };
  for (const line of castSource(cast).lines) if (!prompt.includes(line)) prompt = `${prompt.trim()} ${line}`;

  const aerial = AERIAL.has(r.spec_key);
  const asked = prompt.replace(NEGATION, "");          // what the generator is told to DRAW
  const shows = LOGO.test(asked);
  const ok = aerial ? shows : !shows;
  if (!ok) bad++;
  const where = ok ? "" : `  <-- "${(asked.match(/[^.]*(?:YSL|monogram)[^.]*\./i) ?? [""])[0].trim()}"`;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.spec_key}  ${aerial ? "aerial (must show YSL)" : "ground (must not)"}  cast=${cast.members.map((m) => m.ref.key).join(",") || "none"}${where}`);
  // PRINT=1 gives the prompt itself — what you paste into a generate call, so the thing audited is the thing sent.
  if (process.env.PRINT) console.log(`\n${prompt}\n`);
}
console.log(bad === 0 ? `\nAll ${input.shots.length} prompts obey the logo rule.` : `\n${bad} of ${input.shots.length} BREAK the logo rule — do not generate.`);
process.exit(bad === 0 ? 0 : 1);
