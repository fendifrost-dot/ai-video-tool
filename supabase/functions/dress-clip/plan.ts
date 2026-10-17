// dress-clip — the pure half: from a clip already on a shot (a montage, a take) and the pieces to put on him, to the
// exact Genjutsu object-swap request and the dress record the job runner files it from. No network or database here;
// plan.test.ts holds it.
//
// Why (Fendi, 17 Oct 2026, on a montage re-shot with his shoes in the prompt): "I didn't really want the footage
// changed. I just wanted the swap on the shoes … go back to the original montage and use … the tool specifically to
// swap clothes within Higgsfield." The source is the WHOLE clip as it is filed — nothing is cut or re-shot — and only
// the named pieces are swapped. The result goes on the same shot UNSELECTED, beside the clip it was made from.

import {
  pieceKind,
  DRESS_ENDPOINT,
  DRESS_MAX_SOURCE_SECONDS,
  DRESS_MILLS_PER_SECOND,
  DRESS_MIN_SOURCE_SECONDS,
  DRESS_MODEL_VARIANT,
  DRESS_PROMPT_VERSION,
  DRESS_PROVIDER,
  DRESS_RESOLUTION,
  DRESS_ROUTE,
  buildDressPrompt,
  dressBilledSeconds,
  dressReferences,
  type DressPiece,
  type DressReference,
} from "../_shared/dressWords.ts";

export const STORYBOARD_RUN = "storyboard";

export type ClipFacts = {
  id: string;
  bucket: string;
  path: string;
  /** The file's own length, measured from its bytes (what the result is conformed to). */
  seconds: number;
  /** How the clip was made (its derived_from.method): a montage stays a montage on the board once its shoes change. */
  method: string | null;
  /** The clip's place on the song: its first frame's song time, and the drift. */
  sync: { id: string | null; offsetSeconds: number; driftPpm: number };
};

export type ShotFacts = { id: string; key: string; variationId: string | null };

export type DressClipInput = {
  projectId: string;
  clip: ClipFacts;
  shot: ShotFacts;
  pieces: readonly DressPiece[];
  /** Everything he wears in the shot: the piece he is NOT changing out of names him among other people (wearerOf). */
  worn?: readonly DressPiece[];
  sceneId?: string | null;
  outfit?: { id: string; key: string; name: string; version: number } | null;
};

export type DressClipPlan = {
  prompt: string;
  references: DressReference[];
  notSent: { pieceId: string; label: string; why: string }[];
  billedSeconds: number;
  estimateUsd: number;
  record: Record<string, unknown>;
  /** The provider request, less the signed URLs (the I/O half signs the clip and the pictures and adds them). */
  body: Record<string, unknown>;
  /** request_payload_json of the provider_jobs row: what the job runner reads to conform and file the result. */
  payload: Record<string, unknown>;
};

export type Refusal = { ok: false; status: number; error: string; detail: string };
const refuse = (status: number, error: string, detail: string): Refusal => ({
  ok: false,
  status,
  error,
  detail,
});
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function planDressClip(input: DressClipInput): { ok: true; plan: DressClipPlan } | Refusal {
  const { clip, shot } = input;
  if (!(clip.seconds > 0))
    return refuse(422, "clip_length_unknown", "the clip's length could not be read");
  if (clip.seconds < DRESS_MIN_SOURCE_SECONDS - 0.05)
    return refuse(
      422,
      "clip_too_short",
      `the clip is ${clip.seconds.toFixed(2)} s; the swap needs at least ${DRESS_MIN_SOURCE_SECONDS} s`,
    );
  if (clip.seconds > DRESS_MAX_SOURCE_SECONDS)
    return refuse(
      422,
      "clip_too_long",
      `the clip is ${clip.seconds.toFixed(2)} s; the swap takes at most ${DRESS_MAX_SOURCE_SECONDS} s`,
    );
  if (input.pieces.length === 0)
    return refuse(
      422,
      "no_pieces",
      "nothing to swap: name the pieces, or give the shot an outfit with shoes on file",
    );
  const { sent, notSent } = dressReferences(input.pieces);
  if (sent.length === 0)
    return refuse(
      422,
      "no_pictures",
      `none of the pieces has a photograph on file (${notSent.map((n) => n.label).join(", ")})`,
    );
  const wearer = wearerOf(input.worn ?? [], input.pieces);
  const prompt = buildDressPrompt(input.pieces, sent, { wearer });
  const seconds = r4(clip.seconds);
  const billedSeconds = dressBilledSeconds(seconds);
  const estimateUsd = (billedSeconds * DRESS_MILLS_PER_SECOND) / 1000;
  const songStart = r4(clip.sync.offsetSeconds);
  // the dress record the job runner files from (jobProgress.ts dressedFrom): the whole clip is the cut
  const record = {
    version: 1,
    provider: DRESS_PROVIDER,
    modelVariant: DRESS_MODEL_VARIANT,
    resolution: DRESS_RESOLUTION,
    promptVersion: DRESS_PROMPT_VERSION,
    prompt,
    references: sent.map((r) => ({ pieceId: r.pieceId, path: r.path, angle: r.angle })),
    sourceAssetId: clip.id,
    syncId: clip.sync.id,
    sync: { offsetSeconds: clip.sync.offsetSeconds, driftPpm: clip.sync.driftPpm },
    window: [0, seconds],
    shotWindow: [0, seconds],
    handles: { head: 0, tail: 0 },
    songStart,
    sourceSeconds: seconds,
    sourcePath: clip.path,
    cutAssetId: null,
    outfit: input.outfit ?? null,
    sceneId: input.sceneId ?? null,
    shotId: shot.id,
    shotKey: shot.key,
    billedSeconds,
    estimateUsd,
    imported: null,
    // what the clip was before its pieces changed: the board keeps naming it that (a montage stays a montage)
    sourceMethod: clip.method,
    wearer,
    swapped: sent.map((r) => r.pieceId).filter((id, i, a) => a.indexOf(id) === i),
    submittedBy: "dress-clip",
  };
  const body = {
    mode: "video_to_video",
    modelVariant: DRESS_MODEL_VARIANT,
    resolution: DRESS_RESOLUTION,
    promptText: prompt,
    duration: billedSeconds,
    avt_project_id: input.projectId,
  };
  const settings = {
    batchRun: STORYBOARD_RUN,
    batchShotId: `${shot.key}_swap`,
    route: DRESS_ROUTE,
    kind: "angle",
    estimateUsd,
    lookPreset: "none",
    sourcePath: clip.path,
    sourceWindow: [0, seconds],
    sourceAssetId: clip.id,
    sourceSeconds: seconds,
    dress: record,
  };
  const payload = {
    promptText: prompt,
    mode: "video_to_video",
    modelVariant: DRESS_MODEL_VARIANT,
    resolution: DRESS_RESOLUTION,
    duration: billedSeconds,
    shotId: shot.id,
    referenceImagePaths: sent.map((r) => r.path),
    settings,
  };
  return {
    ok: true,
    plan: { prompt, references: sent, notSent, billedSeconds, estimateUsd, record, body, payload },
  };
}

/** The endpoint the I/O half calls through proxy-provider-call. */
export const SWAP_ENDPOINT = DRESS_ENDPOINT;

/** A wardrobe picture row (character_features) as a piece. */
export function pieceOf(row: {
  id: string;
  label: string | null;
  feature_type: string;
  storage_path: string | null;
  dimensions_description?: string | null;
  reference_images?: unknown;
}): DressPiece {
  const images = (Array.isArray(row.reference_images) ? row.reference_images : [])
    .map((r) => r as { storage_path?: unknown; angle?: unknown })
    .map((r) => ({
      storagePath: typeof r.storage_path === "string" && r.storage_path ? r.storage_path : null,
      angle: typeof r.angle === "string" ? r.angle : null,
    }));
  return {
    id: row.id,
    label: (row.label ?? "").trim(),
    featureType: row.feature_type,
    storagePath: row.storage_path ?? images[0]?.storagePath ?? null,
    images: images.length
      ? images
      : row.storage_path
        ? [{ storagePath: row.storage_path, angle: "front" }]
        : [],
    construction: row.dimensions_description?.trim() || null,
  };
}

/**
 * How he is told apart from everyone else in the frame: the outerwear (else any other piece) he keeps on while the
 * swap changes something else. A montage puts other people in the place — dice players, passengers — and "the man's
 * shoes" put his Pradas on a bystander's feet (c041, 17 Oct 2026). Null when nothing he wears is left to name him.
 */
export function wearerOf(
  worn: readonly DressPiece[],
  swapping: readonly DressPiece[],
): string | null {
  const changing = new Set(swapping.map((p) => p.id));
  const kept = worn.filter((p) => !changing.has(p.id) && p.label.trim());
  const pick =
    kept.find((p) => pieceKind(p) === "outerwear") ??
    kept.find((p) => pieceKind(p) === "hat") ??
    kept.find((p) => pieceKind(p) === "other");
  return pick ? pick.label.trim() : null;
}
