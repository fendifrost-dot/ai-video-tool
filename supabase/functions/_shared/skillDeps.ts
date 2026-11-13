// Skill dependency constraints compared with a worker's installed tools.
// A stored skill does not run. The worker that accepts a job must satisfy these.

export type SkillDependency = { name: string; constraint: string };
export type ToolManifest = Record<string, string>;

/** Geometry Nodes skills (EL4CTEO, gokayfem) target Blender 5.2 or newer. 4.2.3 stays on disk as a fallback binary, not as this dependency. */
export const BLENDER_SKILL_DEPENDENCY: SkillDependency = { name: "blender", constraint: ">=5.2" };

const CONSTRAINT = /^(>=|==|<=|>|<)\s*(\d+(?:\.\d+){0,2})$/;

export function parseDependencies(raw: unknown): { ok: true; value: SkillDependency[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "dependencies must be an array" };
  const value: SkillDependency[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return { ok: false, error: "each dependency must be an object" };
    const row = item as Record<string, unknown>;
    if (typeof row.name !== "string" || !/^[a-z0-9][a-z0-9._-]{0,40}$/i.test(row.name)) {
      return { ok: false, error: "dependency name must be a tool name such as blender or ffmpeg" };
    }
    if (typeof row.constraint !== "string" || !CONSTRAINT.test(row.constraint.replace(/\s+/g, ""))) {
      return { ok: false, error: `${row.name} constraint must look like >=5.2` };
    }
    value.push({ name: row.name.toLowerCase(), constraint: row.constraint.replace(/\s+/g, "") });
  }
  return { ok: true, value };
}

function parts(version: string): number[] {
  return version.split(".").map((n) => Number(n));
}

export function compareVersions(a: string, b: string): number {
  const left = parts(a);
  const right = parts(b);
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i++) {
    const d = (left[i] ?? 0) - (right[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function dependencySatisfied(dep: SkillDependency, installed: string | undefined): boolean {
  if (!installed || !/^\d+(?:\.\d+){0,2}$/.test(installed)) return false;
  const match = CONSTRAINT.exec(dep.constraint);
  if (!match) return false;
  const op = match[1];
  const want = match[2];
  const cmp = compareVersions(installed, want);
  if (op === ">=") return cmp >= 0;
  if (op === ">") return cmp > 0;
  if (op === "==") return cmp === 0;
  if (op === "<=") return cmp <= 0;
  return cmp < 0;
}

export type Compatibility = { ok: boolean; missing: { name: string; constraint: string; installed: string | null }[] };

/** Empty dependencies are compatible with any manifest. Missing tools are listed, not guessed. */
export function checkCompatibility(deps: readonly SkillDependency[], manifest: ToolManifest): Compatibility {
  const missing = deps
    .filter((dep) => !dependencySatisfied(dep, manifest[dep.name]))
    .map((dep) => ({ name: dep.name, constraint: dep.constraint, installed: manifest[dep.name] ?? null }));
  return { ok: missing.length === 0, missing };
}
