#!/usr/bin/env node
/**
 * Lane R locked-suite runner. Re-runs existing deterministic tests listed in
 * tests/regression/locked-surfaces.json. Does not call providers (paidCalls=false).
 *
 * Usage:
 *   node scripts/run-regression-locked.mjs
 *   npm run test:regression
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "tests/regression/locked-surfaces.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (manifest.paidCalls !== false) {
  console.error("Lane R hard lock: paidCalls must be false in locked-surfaces.json");
  process.exit(2);
}

const files = [...new Set(manifest.suites.flatMap((suite) => suite.files))];

console.log(`Lane R locked regression — issue #${manifest.issue} / parent #${manifest.parent}`);
console.log(`paidCalls=${manifest.paidCalls} grokPerFrame=${manifest.grokPerFrame}`);
console.log(`suites=${manifest.suites.length} files=${files.length}`);
console.log("");

const args = [
  "vitest",
  "run",
  "--exclude",
  "**/.claude/worktrees/**",
  "--exclude",
  "**/node_modules/**",
  ...files,
];

const result = spawnSync("npx", args, {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  console.error("\nLane R: locked suite RED. Do not patch another lane's paint.");
  console.error("Assign the owning lane from tests/regression/locked-surfaces.json:\n");
  for (const suite of manifest.suites) {
    console.error(`- ${suite.id}  lane=${suite.lane}  escalateTo=${suite.escalateTo}`);
    console.error(`    files: ${suite.files.join(", ")}`);
    console.error(`    doNotFix: ${suite.doNotFix.join(", ")}`);
  }
  console.error("\nEvidence: write docs/regression/ with the failing file + owning lane.");
}

process.exit(result.status ?? 1);
