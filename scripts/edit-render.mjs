#!/usr/bin/env node
// Encode a queued edit plan by hand. The plan must cost 0 and name no provider.
// The core lives in scripts/edit-render/encode.mjs (also used by workers/edit-render).
//
//   node --experimental-strip-types scripts/edit-render.mjs <plan.json> <output.mp4>
import { readFileSync } from "node:fs";
import { encodePlan } from "./edit-render/encode.mjs";

const [planPath, output] = process.argv.slice(2);
if (!planPath || !output) {
  console.error(
    "usage: node --experimental-strip-types scripts/edit-render.mjs <plan.json> <output.mp4>",
  );
  process.exit(2);
}
try {
  await encodePlan(JSON.parse(readFileSync(planPath, "utf8")), output);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
