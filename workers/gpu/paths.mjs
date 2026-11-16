// Path jail for the Mac GPU worker. Cache and scratch stay under one folder.
// iCloud paths are refused. Nothing outside the root is deleted.
import path from "node:path";

export const GPU_ROOT = "/Volumes/T7/AVT_GPU_Worker";

const ICLOUD = /Mobile Documents|com~apple~CloudDocs|CloudDocs/i;

export function isIcloud(value) {
  return ICLOUD.test(String(value ?? ""));
}

export function assertWorkerRoot(root, { allowNonT7 = false } = {}) {
  if (!root || typeof root !== "string") throw new Error("AVT_GPU_ROOT is required");
  if (isIcloud(root)) throw new Error("iCloud paths are refused");
  const resolved = path.resolve(root);
  if (isIcloud(resolved)) throw new Error("iCloud paths are refused");
  if (!allowNonT7 && resolved !== GPU_ROOT) {
    throw new Error(`AVT_GPU_ROOT must be ${GPU_ROOT}`);
  }
  return resolved;
}

export function assertInside(root, target, options) {
  const base = assertWorkerRoot(root, options);
  if (typeof target !== "string" || target.length === 0) throw new Error("path is required");
  if (isIcloud(target)) throw new Error("iCloud paths are refused");
  const resolved = path.resolve(target);
  if (isIcloud(resolved)) throw new Error("iCloud paths are refused");
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error("path is outside the GPU worker root");
  }
  return resolved;
}

/** Scratch for one job may be removed after the upload sha256 matches. Models and the rest of the T7 stay. */
export function assertScratch(root, target, options) {
  const base = assertWorkerRoot(root, options);
  const resolved = assertInside(base, target, options);
  const scratch = path.join(base, "scratch");
  if (resolved !== scratch && !resolved.startsWith(scratch + path.sep)) {
    throw new Error("only scratch under the GPU worker root is deleted");
  }
  if (resolved === scratch) throw new Error("the scratch directory itself is kept");
  return resolved;
}
