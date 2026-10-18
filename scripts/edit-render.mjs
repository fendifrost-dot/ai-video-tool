#!/usr/bin/env node
// Run a queued edit plan locally. The plan must cost 0 and name no provider.
// Usage: node scripts/edit-render.mjs <plan.json> <output.mp4>
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const [planPath, output] = process.argv.slice(2);
if (!planPath || !output) {
  console.error("usage: node scripts/edit-render.mjs <plan.json> <output.mp4>");
  process.exit(2);
}
const plan = JSON.parse(readFileSync(planPath, "utf8"));
if (plan.costUsd !== 0 || plan.billable !== false) {
  console.error("refusing a plan that is not free");
  process.exit(1);
}
const joined = (plan.argv ?? []).join(" ");
if (/https?:|fal\.ai|api\.x\.ai|openai\.com|montage-shot|lipsync-shot|grok-|topaz/i.test(joined)) {
  console.error("refusing a plan with a remote or billable input");
  process.exit(1);
}
const args = plan.argv.slice(1).map((a) => (a === "OUTPUT" ? output : a));
const run = spawnSync(plan.argv[0], args, { stdio: "inherit" });
process.exit(run.status ?? 1);
