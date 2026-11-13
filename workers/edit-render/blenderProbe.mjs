// Capability probe for the edit-render box. Tests pass a fake spawn.
// Nothing here launches Blender unless the caller supplies the real spawn.
import { spawn } from "node:child_process";
import { BLENDER_SKILL_DEPENDENCY } from "../../supabase/functions/_shared/skillDeps.ts";

export const DEFAULT_BLENDER = "/workspace/tools/blender/current/blender";
export { BLENDER_SKILL_DEPENDENCY };

export function blenderBin() {
  return process.env.AVT_BLENDER || DEFAULT_BLENDER;
}

/** First version token in `blender --version` output. "Blender 5.2.4" and "Blender 4.2.3 LTS" both match. */
export function parseBlenderVersion(text) {
  const match = String(text).match(/Blender\s+(\d+\.\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}

function spawnBlender(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(err || `blender exited ${code}`));
      else resolve(out);
    });
  });
}

/**
 * tool_versions.blender comes from `blender --version`.
 * spawnImpl is injectable so CI never starts the binary.
 */
export async function capabilityManifest({ bin = blenderBin(), spawnImpl = spawnBlender, extra = {} } = {}) {
  let blender = null;
  try {
    blender = parseBlenderVersion(await spawnImpl(bin, ["--version"]));
  } catch {
    blender = null;
  }
  const tool_versions = { ...extra };
  if (blender) tool_versions.blender = blender;
  return {
    blender_bin: bin,
    tool_versions,
    capability_manifest: { cpu: true, gpu: false, blender_bin: bin },
    skill_dependency: BLENDER_SKILL_DEPENDENCY,
  };
}
