#!/usr/bin/env node
/**
 * Lovable deploys one edge function by bundling that function's folder plus
 * supabase/functions/_shared/. An import of another function, or of src/, is a
 * "Module not found" at deploy time.
 *
 * A file under supabase/functions/<name>/ may import its own folder and _shared/.
 * A file under _shared/ may import only _shared/ (a shared module that reaches
 * into a function would fail every deploy that bundles _shared).
 * https:// and package imports are left alone.
 *
 * *.test.ts files are not deployed. They are skipped here; several of them
 * import the app on purpose to compare behaviour.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SPEC = /(?:\bfrom\s+|import\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;

export function importSpecifiers(source) {
  return [...source.matchAll(SPEC)].map((m) => m[1]);
}

function inside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

/** @returns {{ file: string, spec: string, resolved: string } | null} */
export function violationFor(file, spec, functionsRoot) {
  if (!spec.startsWith(".")) return null;
  const resolved = resolve(dirname(file), spec.split("?")[0]);
  const rel = relative(functionsRoot, file);
  const top = rel.split(sep)[0];
  if (!top || top.startsWith("..")) {
    return { file, spec, resolved };
  }
  const home = resolve(functionsRoot, top);
  const shared = resolve(functionsRoot, "_shared");
  if (inside(home, resolved)) return null;
  if (home !== shared && inside(shared, resolved)) return null;
  return { file, spec, resolved };
}

function isTest(file) {
  return /\.test\.(ts|tsx|mts|js|mjs)$/.test(file);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(name)) out.push(path);
  }
  return out;
}

export function scanEdgeFunctions(functionsRoot, { includeTests = false } = {}) {
  const root = resolve(functionsRoot);
  const found = [];
  for (const file of walk(root)) {
    if (!includeTests && isTest(file)) continue;
    const source = readFileSync(file, "utf8");
    for (const spec of importSpecifiers(source)) {
      const hit = violationFor(file, spec, root);
      if (hit) found.push(hit);
    }
  }
  return found;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(process.argv[2] ?? "supabase/functions");
  const hits = scanEdgeFunctions(root);
  if (hits.length === 0) {
    console.log(`edge imports stay inside each function folder or _shared (${root})`);
    process.exit(0);
  }
  for (const hit of hits) {
    console.error(`${relative(process.cwd(), hit.file)}: ${hit.spec}`);
  }
  console.error(
    `${hits.length} edge import(s) leave the function folder and _shared. Lovable's deploy will not bundle them.`,
  );
  process.exit(1);
}
