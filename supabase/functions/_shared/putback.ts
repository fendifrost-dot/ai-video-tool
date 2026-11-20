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
    reproduces: "YSL c033 5482b35b and c041 6f4edd50: clothes from the swap, his face his own pixels. The recipe's setting (docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md: 'AVT_HEAD_ZOOM=4 is the setting of both approved results'). The 18 Oct file's decoded MD5 predates the swap-rate interpolation and is not expected to match; the gate is the proof and the face counts",
  },
  hyenas_verse_creature: {
    args: ["--base", "swap", "--retime", "auto", "--hat-gap-fill", "off"],
    env: { AVT_HEAD_ZOOM: "3" },
    reproduces: "Hyenas verse: a creature or prop swapped in beside him, the swap frame kept, his face put back (docs/handoffs/HANDOFF_GROKBOT_HYENAS_PERFORMANCE_IN_SET_2026-11-13.md:137; face found 96/96; Fendi on verse 0.9: 'Perfect')",
  },
};

export const PUTBACK_PRESET_NAMES = Object.keys(PUTBACK_PRESETS);

/** The two model files the script needs, with the sha256 each must have (docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md). */
export const PUTBACK_MODELS: Readonly<Record<string, string>> = {
  "selfie_multiclass_256x256.tflite": "c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0",
  "face_landmarker.task": "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff",
};

/** What one job may be handed. Over a limit, the job fails with the number before the script starts. */
export const PUTBACK_LIMITS = {
  maxSeconds: 12,
  maxFrames: 1000,
  maxLongSide: 3840,
  /**
   * frames x width x height of ONE input. The script holds both clips in memory as raw frames (3 bytes a pixel), so
   * this is what decides whether a job fits the host: 520 million is about 1.56 GB a clip, and admits the approved
   * c033 window (240 frames of 1080x1920 = 498 million) and nothing much larger. A 4K source is cropped first, as
   * the recipe says.
   */
  maxPixelFrames: 520_000_000,
  /** The two inputs must cover the same stretch: the swap is the Dress output CONFORMED to the take's window. */
  maxDurationGapSeconds: 0.15,
  /** Script wall time. With the two downloads (2 min each) it stays under the queue's 20-minute stale limit. */
  timeoutMs: 12 * 60 * 1000,
  downloadTimeoutMs: 2 * 60 * 1000,
  maxBytes: 1024 * 1024 * 1024,
  /** The video codecs a put-back input may be; anything else is refused before the script starts. */
  codecs: ["h264", "hevc", "prores"],
} as const;

/** The modules body_only_swap.py imports from its own folder: hashed with it, so "unchanged" can be checked. */
export const PUTBACK_SCRIPT_FILES = ["body_only_swap.py", "segmenters.py", "swap_rate.py", "face_track.py", "head_fit.py", "silhouette.py"] as const;

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
  /** What else the script said it did to the swap's timing or picture (stretched, retimed, interpolated, re-rendered). */
  notes: string[];
};

/** The script's printout, read. It changes nothing in the script: these are the lines it has always printed. */
export function parsePutbackProof(stdout: string): PutbackProof {
  const text = String(stdout ?? "");
  const proof = text.match(/frames (\d+) swap frames aligned (\d+) max \|out-original\| on face\/hair\/skin: (-?\d+(?:\.\d+)?)/);
  const faceFound = [...text.matchAll(/scene (\d+-\d+): his face on (\d+) of (\d+) frames/g)].map((m) => ({ scene: m[1], found: Number(m[2]), of: Number(m[3]) }));
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const warnings = lines.filter((l) => l.startsWith("WARNING")).slice(0, 20).map((l) => l.slice(0, 300));
  const notes = lines.filter((l) => /stretched|retimed to the take|swap interpolated|re-rendered by the generator|scenes aligned by their cuts/.test(l) && !l.startsWith("WARNING")).slice(0, 20).map((l) => l.slice(0, 300));
  return {
    proofMax: proof ? Number(proof[3]) : null,
    frames: proof ? Number(proof[1]) : null,
    swapFramesAligned: proof ? Number(proof[2]) : null,
    faceFound,
    warnings,
    notes,
  };
}

/** On how many of the frames his face was found, over all scenes (null when the script printed no face line). */
export function faceCoverage(proof: PutbackProof): { found: number; of: number; share: number } | null {
  if (proof.faceFound.length === 0) return null;
  const found = proof.faceFound.reduce((n, f) => n + f.found, 0);
  const of = proof.faceFound.reduce((n, f) => n + f.of, 0);
  return { found, of, share: of > 0 ? found / of : 0 };
}

/**
 * Whether a result may be filed as a clip. The proof line alone is not enough: it measures only the pixels the script
 * chose to protect, so it prints 0 when it protected NOTHING (his face found on no frame: the glasses and the face
 * then come from the swap). So: the proof was printed and is exactly 0, AND the script said on how many frames it
 * found his face, AND it found him in every scene. A low share is not refused (the handoff: "or the count shown"):
 * it is recorded and said on the asset.
 */
export function putbackPasses(proof: PutbackProof): { ok: true } | { ok: false; why: string } {
  if (proof.proofMax === null) return { ok: false, why: "the script did not print its proof line" };
  if (proof.proofMax !== 0) return { ok: false, why: `max |out-original| on face/hair/skin is ${proof.proofMax}, not 0: his face is not his own pixels` };
  if (!(proof.frames !== null && proof.frames > 0)) return { ok: false, why: "the proof line names no frames" };
  const cover = faceCoverage(proof);
  if (!cover) return { ok: false, why: "the script did not say on how many frames it found his face: a proof of 0 with no face protects nothing" };
  const empty = proof.faceFound.find((f) => f.found === 0);
  if (empty) return { ok: false, why: `his face was found on 0 of ${empty.of} frames in scene ${empty.scene}: nothing of him was protected there, so the 0 proves nothing (try the other preset, or a closer window)` };
  return { ok: true };
}

/** Below this share of frames with his face found, the result is filed with a plain warning on it. */
export const LOW_FACE_SHARE = 0.9;

/** A probed input held against the limits. */
export function checkPutbackInput(label: string, probe: { seconds: number; frames: number; width: number; height: number; codec?: string }): string | null {
  const L = PUTBACK_LIMITS;
  if (!(probe.seconds > 0) || !(probe.frames > 0)) return `${label}: no video in it`;
  if (probe.codec !== undefined && !(L.codecs as readonly string[]).includes(probe.codec)) return `${label}: its video is ${probe.codec || "of no known codec"}; a put-back reads ${L.codecs.join(", ")}`;
  if (probe.frames * probe.width * probe.height > L.maxPixelFrames) return `${label}: ${probe.frames} frames of ${probe.width}x${probe.height} is more than this job holds in memory (${Math.round(L.maxPixelFrames / 1e6)} million pixel-frames; the approved c033 window is 498). Cut a shorter window or crop the 4K source to him first`;
  if (probe.seconds > L.maxSeconds) return `${label}: ${probe.seconds.toFixed(2)} s is over the ${L.maxSeconds} s a put-back takes`;
  if (probe.frames > L.maxFrames) return `${label}: ${probe.frames} frames is over ${L.maxFrames}`;
  if (Math.max(probe.width, probe.height) > L.maxLongSide) return `${label}: ${probe.width}x${probe.height} is over ${L.maxLongSide} px on the long side`;
  return null;
}

/** The two inputs held against each other: the swap must be conformed to the take's own window. */
export function checkPutbackPair(original: { seconds: number }, swap: { seconds: number }): string | null {
  const gap = Math.abs(original.seconds - swap.seconds);
  return gap > PUTBACK_LIMITS.maxDurationGapSeconds
    ? `the swap is ${swap.seconds.toFixed(3)} s and the take's window ${original.seconds.toFixed(3)} s: the swap is not conformed to the window (docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md, "Do not")`
    : null;
}

/** What is recorded on the filed asset (`metadata_json.putback`): the proof, and everything needed to make it again. */
export function putbackRecord(input: {
  plan: PutbackPlan;
  proof: PutbackProof;
  /** sha256 over the script and every module it imports from its folder (PUTBACK_SCRIPT_FILES), in that order. */
  scriptSha256: string;
  inputSha256: { original: string; swap: string };
  seconds: number | null;
  /** The interpreter and libraries that ran it, and ffmpeg (it interpolates the swap and encodes the result). */
  versions?: Record<string, string> | null;
  /** The worker checkout: its commit, and whether it had uncommitted changes. */
  repo?: { commit: string; dirty: boolean } | null;
  output?: { frames: number; width: number; height: number; seconds: number } | null;
}): Record<string, unknown> {
  const cover = faceCoverage(input.proof);
  return {
    method: "FACE_PRESERVING_CLOTHING_SWAP",
    script: PUTBACK_SCRIPT,
    script_files: [...PUTBACK_SCRIPT_FILES],
    script_sha256: input.scriptSha256,
    versions: input.versions ?? null,
    repo: input.repo ?? null,
    output: input.output ?? null,
    face_share: cover ? Math.round(cover.share * 1000) / 1000 : null,
    face_low: cover ? cover.share < LOW_FACE_SHARE : null,
    notes: input.proof.notes,
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
 * The two files of a put-back, resolved from the asset rows the SERVER read. An input is handed over only when:
 * its row belongs to the same user and the same project as the job; it sits in an allowed bucket; its path is a
 * plain storage path under THAT USER'S own folder and that project (`{user}/{project}/…`); and the swap's own record
 * ties it to the original (`swapBinding` below) — so the two cannot be handed in reversed, and a raw provider file
 * cannot stand in for the conformed one. The worker never names a path.
 *
 * What this does not settle while every bucket and `project_assets` are open (RISK-001 / SEC-4): a stranger can
 * plant a file under the owner's folder with a row to match. It reaches a worker only if the OWNER then queues a
 * put-back naming it, since only the owner's own door makes a job.
 */
export function putbackInputItems(
  plan: PutbackPlan,
  rows: readonly Record<string, unknown>[],
  job: { userId: string; projectId: string },
  bucketOf: (row: Record<string, unknown>) => string,
  allowedBuckets: readonly string[],
): PutbackResult<{ original: PutbackItem; swap: PutbackItem; binding: SwapBinding }> {
  const rowOf = (assetId: string) => rows.find((r) => typeof r.id === "string" && r.id.toLowerCase() === assetId.toLowerCase());
  const item = (assetId: string, label: string): PutbackResult<PutbackItem> => {
    const row = rowOf(assetId);
    if (!row) return { ok: false, error: `${label} (${assetId.slice(0, 8)}) is not an asset of this project` };
    if (row.user_id !== job.userId || row.project_id !== job.projectId) return { ok: false, error: `${label} (${assetId.slice(0, 8)}) belongs to another project or owner` };
    const path = typeof row.file_url === "string" ? row.file_url.trim() : "";
    const parts = path.split("/");
    if (!path || /^[a-z]+:\/\//i.test(path) || path.startsWith("/") || parts.some((p) => p === "" || p === "." || p === "..") || parts[0] !== job.userId || parts[1] !== job.projectId) {
      return { ok: false, error: `${label} (${assetId.slice(0, 8)}) has no storage path inside this owner's folder of this project` };
    }
    const bucket = bucketOf(row);
    if (!allowedBuckets.includes(bucket)) return { ok: false, error: `${label} (${assetId.slice(0, 8)}) is in a bucket a put-back does not read` };
    return { ok: true, value: { assetId, bucket, path } };
  };
  const original = item(plan.originalAssetId, "the original");
  if (!original.ok) return original;
  const swap = item(plan.swapAssetId, "the swap");
  if (!swap.ok) return swap;
  const binding = swapBinding(rowOf(plan.swapAssetId)?.metadata_json, plan.originalAssetId, { path: original.value.path, metadata: rowOf(plan.originalAssetId)?.metadata_json });
  if (!binding) {
    return { ok: false, error: `the swap (${plan.swapAssetId.slice(0, 8)}) does not say it was made from the original (${plan.originalAssetId.slice(0, 8)}): a put-back takes the window, then the swap made from that same window, in that order. A dress-clip result says so by itself (it names the window file it sent, or the same take and window); a swap made another way (a creature or prop through the provider call, a pasted region) is filed with metadata_json.swap_of = { asset_id: <the window's asset id> }` };
  }
  return { ok: true, value: { original: original.value, swap: swap.value, binding } };
}

/**
 * How a swap is tied to the window it was made from, strongest first:
 * - `dress_source`: the swap's own Dress record names the exact file sent to the provider
 *   (`derived_from.dress.sourcePath`), and that file is the original's. This is what dress-clip writes: its
 *   `derived_from.asset_id` is the TAKE the window was cut from, never the window (c033: take 70304981, window file
 *   `dress/storyboard_c033_…_src.mp4`, registered afterwards as asset c45e30c6).
 * - `derived_from`: the swap's `derived_from.asset_id` is the original itself (a clip sent whole).
 * - `same_window`: both were cut from the same take over the same window (`derived_from.asset_id` and
 *   `source_window` agree to a millisecond), and the swap carries a Dress record while the original does not — so
 *   the pair cannot be handed in reversed.
 * - `swap_of`: declared by whoever files a swap made another way — the creature or prop swap of
 *   docs/recipes/CREATURE_OR_PROP_SWAP_ON_HIS_TAKE.md goes through the provider call, and a pasted region is a
 *   local file — so those lanes are not shut out; the declaration is the filer's word, and is recorded as such.
 * It is a consistency check on the owner's own job (the two cannot be handed in reversed or from different takes),
 * not an access control: the rows it reads are the owner's, and are writable while SEC-4 is open.
 */
export type SwapBinding = "dress_source" | "derived_from" | "same_window" | "swap_of";
type Derived = { asset_id?: unknown; source_window?: unknown; method?: unknown; dress?: { sourcePath?: unknown } };
const windowOf = (v: unknown): [number, number] | null =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n)) ? [v[0] as number, v[1] as number] : null;
export function swapBinding(
  swapMetadata: unknown,
  originalAssetId: string,
  original?: { path?: string | null; metadata?: unknown },
): SwapBinding | null {
  const meta = (swapMetadata ?? {}) as { derived_from?: Derived; swap_of?: { asset_id?: unknown } };
  const from = meta.derived_from;
  const same = (v: unknown) => typeof v === "string" && v.toLowerCase() === originalAssetId.toLowerCase();
  const sent = from?.dress?.sourcePath;
  if (original?.path && typeof sent === "string" && sent === original.path) return "dress_source";
  if (same(from?.asset_id)) return "derived_from";
  const origFrom = ((original?.metadata ?? {}) as { derived_from?: Derived }).derived_from;
  const w1 = windowOf(from?.source_window);
  const w2 = windowOf(origFrom?.source_window);
  const isDress = (d: Derived | undefined) => !!d && (d.method === "dressed" || (!!d.dress && typeof d.dress === "object"));
  if (
    isDress(from) && !isDress(origFrom) &&
    w1 && w2 && typeof from?.asset_id === "string" && typeof origFrom?.asset_id === "string" &&
    from.asset_id.toLowerCase() === origFrom.asset_id.toLowerCase() &&
    Math.abs(w1[0] - w2[0]) < 0.001 && Math.abs(w1[1] - w2[1]) < 0.001
  ) return "same_window";
  if (same(meta.swap_of?.asset_id)) return "swap_of";
  return null;
}

/** True when an asset is a whole-frame Dress output (its face is the generator's), not a take and not a put-back. */
export function isWholeFrameDress(metadata: unknown): boolean {
  const d = ((metadata ?? {}) as { derived_from?: { method?: unknown; putback?: unknown; dress?: unknown } }).derived_from;
  return !!d && (d.method === "dressed" || !!d.dress) && d.putback !== true;
}

const HEX64 = /^[0-9a-f]{64}$/;
const sameList = (a: unknown, b: readonly string[]) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);
const sameMap = (a: unknown, b: Readonly<Record<string, string>>) =>
  !!a && typeof a === "object" && !Array.isArray(a) && Object.keys(a as object).length === Object.keys(b).length && Object.entries(b).every(([k, v]) => (a as Record<string, unknown>)[k] === v);

/**
 * The record a worker sends back, checked again at the door before anything is filed. What this check is: the
 * worker's own statement, held against THIS job — its preset, the preset's exact flags and settings (a record that
 * says it ran anything else is refused, never rewritten), its two assets — with the proof exactly 0, his face found
 * in every scene, and the hashes present. What it is not: the server does not run the script and does not hash the
 * uploaded file, so whoever holds a worker's secret can file a clip with this record on it. The asset says so.
 */
export function acceptPutbackRecord(raw: unknown, plan: PutbackPlan): PutbackResult<Record<string, unknown>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "the put-back came back without its proof record" };
  const r = raw as Record<string, unknown>;
  if (r.proof_max !== 0) return { ok: false, error: `the put-back's proof is ${String(r.proof_max)}, not 0: nothing is filed` };
  if (r.preset !== plan.preset || r.original_asset_id !== plan.originalAssetId || r.swap_asset_id !== plan.swapAssetId) return { ok: false, error: "the proof record is for another job" };
  if (!sameList(r.args, plan.args) || !sameMap(r.env, plan.env)) return { ok: false, error: `the worker did not run preset ${plan.preset} as it is written (its flags or settings differ): nothing is filed` };
  const sha = (r.input_sha256 ?? {}) as Record<string, unknown>;
  if (typeof r.script_sha256 !== "string" || !HEX64.test(r.script_sha256) || typeof sha.original !== "string" || !HEX64.test(sha.original) || typeof sha.swap !== "string" || !HEX64.test(sha.swap)) {
    return { ok: false, error: "the proof record lacks the hashes of the script and the inputs" };
  }
  const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
  const faceFound = (Array.isArray(r.face_found) ? r.face_found : [])
    .slice(0, 50)
    .map((f) => f as Record<string, unknown>)
    .filter((f) => f && typeof f.scene === "string" && typeof f.found === "number" && typeof f.of === "number")
    .map((f) => ({ scene: String(f.scene).slice(0, 24), found: int(f.found) ?? 0, of: int(f.of) ?? 0 }));
  const frames = int(r.frames);
  if (!frames) return { ok: false, error: "the proof record names no frames: nothing is filed" };
  if (faceFound.length === 0) return { ok: false, error: "the proof record does not say on how many frames his face was found: nothing is filed" };
  const empty = faceFound.find((f) => f.found === 0);
  if (empty) return { ok: false, error: `his face was found on 0 of ${empty.of} frames in scene ${empty.scene}: nothing is filed` };
  const out = (r.output ?? {}) as Record<string, unknown>;
  if (int(out.frames) !== frames) return { ok: false, error: `the file has ${int(out.frames) === null ? "no stated" : String(out.frames)} frames and the proof is for ${frames}: nothing is filed` };
  const found = faceFound.reduce((n, f) => n + f.found, 0);
  const of = faceFound.reduce((n, f) => n + f.of, 0);
  const share = of > 0 ? found / of : 0;
  const strs = (v: unknown, n: number) => (Array.isArray(v) ? v : []).filter((w): w is string => typeof w === "string").slice(0, n).map((w) => w.slice(0, 300));
  const versions = r.versions && typeof r.versions === "object" && !Array.isArray(r.versions)
    ? Object.fromEntries(Object.entries(r.versions as Record<string, unknown>).filter(([k, v]) => /^[a-z]{2,12}$/.test(k) && typeof v === "string").slice(0, 8).map(([k, v]) => [k, String(v).slice(0, 40)]))
    : null;
  const repo = (r.repo ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    value: {
      method: "FACE_PRESERVING_CLOTHING_SWAP",
      script: PUTBACK_SCRIPT,
      script_files: [...PUTBACK_SCRIPT_FILES],
      script_sha256: r.script_sha256,
      preset: plan.preset,
      args: [...plan.args],
      env: { ...plan.env },
      model_sha256: { ...PUTBACK_MODELS },
      versions,
      repo: typeof repo.commit === "string" && /^[0-9a-f]{7,40}$/.test(repo.commit) ? { commit: repo.commit, dirty: repo.dirty === true } : null,
      original_asset_id: plan.originalAssetId,
      swap_asset_id: plan.swapAssetId,
      input_sha256: { original: sha.original, swap: sha.swap },
      proof_max: 0,
      proof_measured: "on the frames before the final encode, by the worker; not re-run and not re-hashed by the server",
      frames,
      swap_frames_aligned: int(r.swap_frames_aligned),
      face_found: faceFound,
      face_share: Math.round(share * 1000) / 1000,
      face_low: share < LOW_FACE_SHARE,
      output: int(out.frames) !== null ? { frames: int(out.frames), width: int(out.width), height: int(out.height), seconds: typeof out.seconds === "number" ? out.seconds : null } : null,
      warnings: strs(r.warnings, 20),
      notes: strs(r.notes, 20),
      run_seconds: typeof r.run_seconds === "number" && Number.isFinite(r.run_seconds) ? r.run_seconds : null,
      approved: false,
    },
  };
}

/** The note written on the filed asset: what was done, what the proof is, and a plain warning when his face was found on few frames. */
export function putbackNote(record: Record<string, unknown>): string {
  const low = record.face_low === true ? ` WARNING: his face was found on only ${Math.round(Number(record.face_share) * 100)} % of the frames; look at the face sheet before using it.` : "";
  // the proof is against the ORIGINAL it was given: when that is itself a whole-frame Dress output, the face it kept
  // is the generator's, and "his face" must not be said
  const whole = record.original_is_whole_frame_dress === true;
  const face = whole ? "the face of the ORIGINAL IT WAS GIVEN, which is itself a whole-frame Dress output — so not his own pixels: WARNING, run the put-back from the take" : "his face from the take";
  const dirty = (record.repo as { dirty?: unknown } | null)?.dirty === true ? " WARNING: the worker's copy of the script had uncommitted changes." : "";
  const declared = record.binding === "swap_of" ? " The swap's link to the window was declared by whoever filed it." : "";
  return `Put-back (free, worker), preset ${String(record.preset)}: clothes from the swap, ${face}. The script's proof printed 0 (max |out-original| on face/hair/skin, measured by the worker on the frames before the final encode).${low}${dirty}${declared} Not approved: the director judges it.`;
}

/** Where a put-back's file goes: one object per attempt, so a retry never replaces what an earlier attempt uploaded. */
export const putbackOutputPath = (userId: string, projectId: string, jobId: string, attempt: number) =>
  `${userId}/${projectId}/renders/${jobId}_a${Math.max(1, Math.round(attempt))}.mp4`;

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
