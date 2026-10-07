// What the shot writer is told for a variation, built by the writer's own functions — no call, no spend.
// usage: npx tsx scripts/trace_ib_writer_prompt.ts <treatment.txt> [notes] [visual] [mood]
import { readFileSync } from "node:fs";
import { shotsSystemPrompt, PRODUCTION_RULES } from "../supabase/functions/treatment-writer-proxy/contract.ts";
const [file, notes = "", visual = "", mood = ""] = process.argv.slice(2);
const treatment = readFileSync(file, "utf8");
const grid = [{ key: "c001", start: 0, end: 4, section: "intro", lyrics: "" }];
const system = shotsSystemPrompt({ hasPerformanceFootage: true, notes: notes || null, visualStyle: visual || null, mood: mood || null, entities: [] }, treatment, grid);
const RUNWAY = ["PLACES (reuse these", "never write another outfit", "backstage fitting room", "Paris runway show at night", "No readable logos or text"];
console.log(JSON.stringify({
  chars: system.length,
  treatmentIncluded: system.includes(treatment.trim().slice(0, 200)),
  runwayInstructionsPresent: RUNWAY.filter((r) => system.includes(r)),
  linksRule: system.includes("`continuity.links`"),
  productionRule: system.includes(PRODUCTION_RULES),
}, null, 1));
