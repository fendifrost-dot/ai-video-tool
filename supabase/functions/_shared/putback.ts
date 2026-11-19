// The put-back job: what may be asked for, and what its result proves.
//
// The put-back itself is scripts/edit/body_only_swap.py, run UNCHANGED by a worker (workers/edit-render/putback.mjs).
// This file is the contract both sides share: the closed list of presets a job may name, the limits on its inputs,
// the model files it needs, and how the script's own printout is read. A job is a preset and two asset ids; nothing
// in a job row reaches the command line any other way (docs/design/DRESS_AND_PLACE_PIPELINE_2026-11.md §5).
//
// Pure: no I/O, no Deno or Node API. Used by avt-mcp (to refuse a bad job before it is queued), by
// edit-render-worker-api (to decide what a claimed job is handed) and by the worker.

export type PutbackPreset = {
  /** Flags after the three positional arguments (original, swap, out_dir). */
  args: readonly string[];
  /** AVT_* settings of the script. Nothing else is ever set from a job. */
  env: Readonly<Record<string, string>>;
  /** The approved result this preset reproduces, and where that is written. */
  reproduces: string;
};

/**
 * The presets. Each is named after the approved result it reproduces. A new setting is a new preset, with its
 * reason, reviewed like code: there is no free-form override at run time.
 */
export const PUTBACK_PRESETS: Readonly<Record<string, PutbackPreset>> = {
  c033_showroom: {
    args: ["--base", "original"],
    env: { AVT_HEAD_ZOOM: "4" },
    reproduces: "YSL c033 5482b35b and c041 6f4edd50: clothes from the swap, his face his own pixels (docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md, 'AVT_HEAD_ZOOM=4 is the setting of both approved results')",
  },
  full_body: {
    args: ["--base", "original"],
    env: { AVT_HEAD_ZOOM: "3" },
    reproduces: "a clothing swap on a full-body frame (docs/PROBLEM_INDEX.md, 'Face found on few frames': 3 on full body)",
  },
  hyenas_verse_creature: {
    args: ["--base", "swap", "--retime", "auto", "--hat-gap-fill", "off"],
    env: { AVT_HEAD_ZOOM: "3" },
    reproduces: "Hyenas verse: a creature or prop swapped in beside him, the swap frame kept, his face put back (docs/handoffs/HANDOFF_GROKBOT_HYENAS_PERFORMANCE_IN_SET_2026-11-13.md:137; face found 96/96)",
  },
};

export const PUTBACK_PRESET_NAMES = Object.keys(PUTBACK_PRESETS);

/** The two model files the script needs, with the sha256 each must have (docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md). */
export const PUTBACK_MODELS: Readonly<Record<string, string>> = {
  "selfie_multiclass_256x256.tflite": "c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0",
  "face_landmarker.task": "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff",
};

/** What one job may be handed. Over a limit, the job fails with the number before the script starts. */
export const PUTBACK_LIMITS = { maxSeconds: 12, maxFrames: 1000, maxLongSide: 3840, timeoutMs: 20 * 60 * 1000, maxBytes: 1024 * 1024 * 1024 } as const;

/** The script, relative to the repo root, and the file it always writes (rename on filing). */
export const PUTBACK_SCRIPT = "scripts/edit/body_only_swap.py";
export const PUTBACK_OUTPUT = "c033_body_only_swap.mp4";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PutbackPlan = { preset: string; originalAssetId: string; swapAssetId: string; args: string[]; env: Record<string, string> };
export type PutbackResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * A put-back job, checked: `settings` holds `preset` and nothing else; the inputs are exactly two different asset ids,
 * the original take's window first and the swap of that same window second.
 */
export function planPutback(settings: unknown, inputAssetIds: unknown): PutbackResult<PutbackPlan> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return { ok: false, error: "a put-back needs settings: { preset }" };
  const keys = Object.keys(settings as Record<string, unknown>);
  const extra = keys.filter((k) => k !== "preset");
  if (extra.length) return { ok: false, error: `a put-back takes a preset and nothing else (not: ${extra.slice(0, 6).join(", ")})` };
  const name = (settings as Record<string, unknown>).preset;
  // own keys only: "constructor" or "__proto__" is not a preset
  if (typeof name !== "string" || !Object.prototype.hasOwnProperty.call(PUTBACK_PRESETS, name)) {
    return { ok: false, error: `preset must be one of ${PUTBACK_PRESET_NAMES.join(", ")}` };
  }
  if (!Array.isArray(inputAssetIds) || inputAssetIds.length !== 2 || inputAssetIds.some((id) => typeof id !== "string" || !UUID.test(id))) {
    return { ok: false, error: "a put-back takes exactly two asset ids: the original window, then its swap" };
  }
  const [originalAssetId, swapAssetId] = inputAssetIds as string[];
  if (originalAssetId.toLowerCase() === swapAssetId.toLowerCase()) return { ok: false, error: "the original and the swap are the same asset" };
  const preset = PUTBACK_PRESETS[name];
  return { ok: true, value: { preset: name, originalAssetId, swapAssetId, args: [...preset.args], env: { ...preset.env } } };
}

export type PutbackProof = {
  /** `max |out-original| on face/hair/skin`: 0 is the only pass. Null when the script never printed it. */
  proofMax: number | null;
  frames: number | null;
  swapFramesAligned: number | null;
  /** Per scene: on how many frames HIS face was found. A low count is shown with the result, never hidden. */
  faceFound: { scene: string; found: number; of: number }[];
  /** The script's own warnings, kept with the job. */
  warnings: string[];
};

/** The script's printout, read. It changes nothing in the script: these are the lines it has always printed. */
export function parsePutbackProof(stdout: string): PutbackProof {
  const text = String(stdout ?? "");
  const proof = text.match(/frames (\d+) swap frames aligned (\d+) max \|out-original\| on face\/hair\/skin: (-?\d+(?:\.\d+)?)/);
  const faceFound = [...text.matchAll(/scene (\d+-\d+): his face on (\d+) of (\d+) frames/g)].map((m) => ({ scene: m[1], found: Number(m[2]), of: Number(m[3]) }));
  const warnings = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith("WARNING")).slice(0, 20).map((l) => l.slice(0, 300));
  return {
    proofMax: proof ? Number(proof[3]) : null,
    frames: proof ? Number(proof[1]) : null,
    swapFramesAligned: proof ? Number(proof[2]) : null,
    faceFound,
    warnings,
  };
}

/** Whether a result may be filed as a clip: the proof was printed and is exactly 0. Anything else fails the job. */
export function putbackPasses(proof: PutbackProof): { ok: true } | { ok: false; why: string } {
  if (proof.proofMax === null) return { ok: false, why: "the script did not print its proof line" };
  if (proof.proofMax !== 0) return { ok: false, why: `max |out-original| on face/hair/skin is ${proof.proofMax}, not 0: his face is not his own pixels` };
  return { ok: true };
}

/** A probed input held against the limits. */
export function checkPutbackInput(label: string, probe: { seconds: number; frames: number; width: number; height: number }): string | null {
  const L = PUTBACK_LIMITS;
  if (!(probe.seconds > 0) || !(probe.frames > 0)) return `${label}: no video in it`;
  if (probe.seconds > L.maxSeconds) return `${label}: ${probe.seconds.toFixed(2)} s is over the ${L.maxSeconds} s a put-back takes`;
  if (probe.frames > L.maxFrames) return `${label}: ${probe.frames} frames is over ${L.maxFrames}`;
  if (Math.max(probe.width, probe.height) > L.maxLongSide) return `${label}: ${probe.width}x${probe.height} is over ${L.maxLongSide} px on the long side`;
  return null;
}

/** What is recorded on the filed asset (`metadata_json.putback`): the proof, and everything needed to make it again. */
export function putbackRecord(input: {
  plan: PutbackPlan;
  proof: PutbackProof;
  scriptSha256: string;
  inputSha256: { original: string; swap: string };
  seconds: number | null;
}): Record<string, unknown> {
  return {
    method: "FACE_PRESERVING_CLOTHING_SWAP",
    script: PUTBACK_SCRIPT,
    script_sha256: input.scriptSha256,
    preset: input.plan.preset,
    args: input.plan.args,
    env: input.plan.env,
    model_sha256: { ...PUTBACK_MODELS },
    original_asset_id: input.plan.originalAssetId,
    swap_asset_id: input.plan.swapAssetId,
    input_sha256: input.inputSha256,
    proof_max: input.proof.proofMax,
    frames: input.proof.frames,
    swap_frames_aligned: input.proof.swapFramesAligned,
    face_found: input.proof.faceFound,
    warnings: input.proof.warnings,
    run_seconds: input.seconds,
    // Fendi approves in his words; a worker never does
    approved: false,
  };
}

// ── the server's side: what a claimed put-back is handed, and what it may file ─────────────────────────────────────

export type PutbackItem = { assetId: string; bucket: string; path: string };

/**
 * The two files of a put-back, resolved from the asset rows the SERVER read. An input is handed over only when its
 * row belongs to the same user and the same project as the job, sits in an allowed bucket, and its path is a plain
 * storage path inside that project. The worker never names a path.
 */
export function putbackInputItems(
  plan: PutbackPlan,
  rows: readonly Record<string, unknown>[],
  job: { userId: string; projectId: string },
  bucketOf: (row: Record<string, unknown>) => string,
  allowedBuckets: readonly string[],
): PutbackResult<{ original: PutbackItem; swap: PutbackItem }> {
  const item = (assetId: string, label: string): PutbackResult<PutbackItem> => {
    const row = rows.find((r) => typeof r.id === "string" && r.id.toLowerCase() === assetId.toLowerCase());
    if (!row) return { ok: false, error: `${label} (${assetId.slice(0, 8)}) is not an asset of this project` };
    if (row.user_id !== job.userId || row.project_id !== job.projectId) return { ok: false, error: `${label} (${assetId.slice(0, 8)}) belongs to another project or owner` };
    const path = typeof row.file_url === "string" ? row.file_url.trim() : "";
    const parts = path.split("/");
    if (!path || /^[a-z]+:\/\//i.test(path) || path.startsWith("/") || parts.some((p) => p === "" || p === "." || p === "..") || parts[1] !== job.projectId) {
      return { ok: false, error: `${label} (${assetId.slice(0, 8)}) has no storage path inside this project` };
    }
    const bucket = bucketOf(row);
    if (!allowedBuckets.includes(bucket)) return { ok: false, error: `${label} (${assetId.slice(0, 8)}) is in a bucket a put-back does not read` };
    return { ok: true, value: { assetId, bucket, path } };
  };
  const original = item(plan.originalAssetId, "the original");
  if (!original.ok) return original;
  const swap = item(plan.swapAssetId, "the swap");
  if (!swap.ok) return swap;
  return { ok: true, value: { original: original.value, swap: swap.value } };
}

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * The record a worker sends back, checked again at the door before anything is filed: the proof must be exactly 0,
 * and the record must be for THIS job (its preset, its two assets). Only known fields are kept.
 */
export function acceptPutbackRecord(raw: unknown, plan: PutbackPlan): PutbackResult<Record<string, unknown>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "the put-back came back without its proof record" };
  const r = raw as Record<string, unknown>;
  if (r.proof_max !== 0) return { ok: false, error: `the put-back's proof is ${String(r.proof_max)}, not 0: nothing is filed` };
  if (r.preset !== plan.preset || r.original_asset_id !== plan.originalAssetId || r.swap_asset_id !== plan.swapAssetId) return { ok: false, error: "the proof record is for another job" };
  const sha = (r.input_sha256 ?? {}) as Record<string, unknown>;
  if (typeof r.script_sha256 !== "string" || !HEX64.test(r.script_sha256) || typeof sha.original !== "string" || !HEX64.test(sha.original) || typeof sha.swap !== "string" || !HEX64.test(sha.swap)) {
    return { ok: false, error: "the proof record lacks the hashes of the script and the inputs" };
  }
  const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
  const faceFound = (Array.isArray(r.face_found) ? r.face_found : [])
    .slice(0, 50)
    .map((f) => f as Record<string, unknown>)
    .filter((f) => f && typeof f.scene === "string" && typeof f.found === "number" && typeof f.of === "number")
    .map((f) => ({ scene: String(f.scene).slice(0, 24), found: int(f.found), of: int(f.of) }));
  return {
    ok: true,
    value: {
      method: "FACE_PRESERVING_CLOTHING_SWAP",
      script: PUTBACK_SCRIPT,
      script_sha256: r.script_sha256,
      preset: plan.preset,
      args: [...plan.args],
      env: { ...plan.env },
      model_sha256: { ...PUTBACK_MODELS },
      original_asset_id: plan.originalAssetId,
      swap_asset_id: plan.swapAssetId,
      input_sha256: { original: sha.original, swap: sha.swap },
      proof_max: 0,
      frames: int(r.frames),
      swap_frames_aligned: int(r.swap_frames_aligned),
      face_found: faceFound,
      warnings: (Array.isArray(r.warnings) ? r.warnings : []).filter((w): w is string => typeof w === "string").slice(0, 20).map((w) => w.slice(0, 300)),
      run_seconds: typeof r.run_seconds === "number" && Number.isFinite(r.run_seconds) ? r.run_seconds : null,
      approved: false,
    },
  };
}

/** The kinds a worker may ask for at this door. Anything else in a claim is dropped. */
export const CLAIMABLE_KINDS = ["edit", "putback"] as const;
export function claimKinds(raw: unknown): string[] {
  const asked = Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : [];
  const kinds = CLAIMABLE_KINDS.filter((k) => asked.includes(k));
  return kinds.length ? [...kinds] : ["edit"];
}

/** What the owner's door (SQL `queue_putback_job`) is called with: the plan's own fields, nothing free-form. */
export function queuePutbackArgs(projectId: string, plan: PutbackPlan): { p_project_id: string; p_original_asset_id: string; p_swap_asset_id: string; p_preset: string } {
  return { p_project_id: projectId, p_original_asset_id: plan.originalAssetId, p_swap_asset_id: plan.swapAssetId, p_preset: plan.preset };
}
