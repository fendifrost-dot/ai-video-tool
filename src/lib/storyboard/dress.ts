/**
 * "Dress this shot" — put the scene's outfit on his real performance, for exactly the stretch of take one shot uses.
 *
 * Step 5 of the music-video workflow (Fendi, 15 Oct 2026): a performance shot whose scene wears an outfit he was not
 * filmed in is dressed by the approved route — the Higgsfield object-swap (docs/recipes/WARDROBE_SWAP_RECIPE.md,
 * run C and request 71ff19f4) — on a cut of the take, never on the whole take: the swap is billed per source second.
 *
 * Two cleanup problems are solved here and on the server, by rule, every time:
 *   • SPEED. The swap returns its clip about 7 % fast (3.71 s for a 4.00 s source). The server conforms the file back
 *     to the cut's own length before filing it (supabase/functions/_shared/mp4Retime.ts) — losslessly, in the
 *     container. The cut's length is recorded here so there is something exact to conform to.
 *   • SOFT TAIL. The last ~0.5 s of the swap often smears his face. The cut carries HANDLES — extra take before and
 *     after the shot — so that soft tail falls outside what the shot plays.
 *
 * Pacing: most final cuts are 1.5–2 s, and the swap takes at least 4 s of source and bills every started second. So
 * the handles below are MINIMUMS; the window then grows to fill the seconds that are billed anyway (it costs nothing
 * more), split between head and tail, clamped to the take. Over the minimum, a cut stays a hair under a whole second
 * (BILLING_GUARD) so a frame of rounding never starts another billed second. At the minimum it is exactly 4 s: the
 * provider refuses anything shorter at intake (3.954 s cuts were refused on 15 Oct 2026), and the frame-exact cutter
 * ends the file at the length asked for, so the file is 4.000 s, not 4 s plus a frame.
 *
 * Pure: no React, no Supabase. The browser side is dressSubmit.ts; the server side is _shared/jobProgress.ts.
 */
import { performanceToSong, type PerformanceSync } from "@/lib/sync/performanceSync";

// --- the one place the dress constants live -------------------------------------------------------------------------

/** Minimum take kept before the shot, seconds. */
export const DRESS_HEAD_HANDLE = 0.5;
/** Minimum take kept after the shot, seconds: covers the swap's soft last ~0.5 s with room to spare. */
export const DRESS_TAIL_HANDLE = 0.75;
/** What the object-swap accepts as a source, seconds (longer is trimmed by the provider). */
export const DRESS_MIN_SOURCE_SECONDS = 4;
export const DRESS_MAX_SOURCE_SECONDS = 30;
/** A cut is planned this far under a whole second, so a frame of rounding never bills one more second. */
export const DRESS_BILLING_GUARD = 0.05;
export const DRESS_RESOLUTION = "720p" as const;
/** List price per started SOURCE second at 720p, in tenths of a cent (68.1 ¢ = $0.681). */
export const DRESS_MILLS_PER_SECOND = 681;
export const DRESS_PROVIDER = "higgsfield" as const;
export const DRESS_ENDPOINT = "video-providers-higgsfield-model" as const;
export const DRESS_MODEL_VARIANT = "genjutsu-object-swap" as const;
/** The route name the job records (shotCompiler/types.ts DeferredRoute). */
export const DRESS_ROUTE = "genjutsu_swap" as const;
/** The most reference pictures sent: the approved full look used four (jacket product photo + cap front, side, detail). */
export const DRESS_MAX_REFERENCES = 4;
/** Bump when the words of buildDressPrompt change: a dressed take made with older words is then flagged stale. */
export const DRESS_PROMPT_VERSION = "dress-v1";
/** What a provider request id may look like: it ends up in a storage key (the server holds it to the same rule). */
export const DRESS_ID_RE = /^[A-Za-z0-9_-]+$/;

// --- the window --------------------------------------------------------------------------------------------------------

export type DressWindow = {
  /** The cut, on the take's own clock, seconds. */
  start: number;
  end: number;
  seconds: number;
  /** The shot's own stretch of the take inside it. */
  shotIn: number;
  shotOut: number;
  /** Take kept before and after the shot. */
  head: number;
  tail: number;
  /** Whole seconds the provider bills for this cut. */
  billedSeconds: number;
  /** Said when a handle came out shorter than its minimum because the take ends there. */
  notes: string[];
};

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** Whole seconds billed for a source of this length: every started second, never under the 4 s minimum. */
export function dressBilledSeconds(sourceSeconds: number): number {
  return Math.max(DRESS_MIN_SOURCE_SECONDS, Math.ceil(sourceSeconds - 1e-9));
}

/** What a dress of this source length costs, exactly, at the list price. */
export function dressCost(sourceSeconds: number): {
  billedSeconds: number;
  usd: number;
  text: string;
} {
  const billedSeconds = dressBilledSeconds(sourceSeconds);
  const usd = (billedSeconds * DRESS_MILLS_PER_SECOND) / 1000;
  return {
    billedSeconds,
    usd,
    text: `${billedSeconds} s × $${(DRESS_MILLS_PER_SECOND / 1000).toFixed(3)} = $${usd.toFixed(3)}`,
  };
}

/**
 * The stretch of take to dress for a shot that plays [shotIn, shotOut) of it. Null-safe on the take's length (null =
 * unknown: nothing is clamped at the end). Refused — with the reason — when the take cannot give the swap its 4 s, or
 * the shot is too long for one swap.
 */
export function dressWindow(input: {
  shotIn: number;
  shotOut: number;
  takeSeconds: number | null;
  head?: number;
  tail?: number;
}): { ok: true; window: DressWindow } | { ok: false; why: string } {
  const head = input.head ?? DRESS_HEAD_HANDLE;
  const tail = input.tail ?? DRESS_TAIL_HANDLE;
  const { shotIn, shotOut } = input;
  if (!(shotOut > shotIn))
    return { ok: false, why: "the shot has no stretch of the take to dress" };
  const takeEnd = input.takeSeconds != null && input.takeSeconds > 0 ? input.takeSeconds : Infinity;
  if (takeEnd < DRESS_MIN_SOURCE_SECONDS)
    return {
      ok: false,
      why: `the take is ${takeEnd.toFixed(2)} s long; the swap needs at least ${DRESS_MIN_SOURCE_SECONDS} s of it`,
    };
  // the minimum handles, clamped to the take
  let start = Math.max(0, shotIn - head);
  let end = Math.min(takeEnd, shotOut + tail);
  const notes: string[] = [];
  if (shotIn - start < head - 1e-6)
    notes.push(
      `the take starts ${(shotIn - start).toFixed(2)} s before the shot, so the head handle is short`,
    );
  if (end - shotOut < tail - 1e-6)
    notes.push(
      `the take ends ${(end - shotOut).toFixed(2)} s after the shot, so the tail handle is short — the swap's soft last half-second may show`,
    );
  // fill the seconds that are billed anyway, a guard under the whole second; a window that already fits the minimum
  // is the minimum (3.98 s with handles is a 4 s cut, not a 4.95 s one)
  const natural = end - start;
  const billed = natural <= DRESS_MIN_SOURCE_SECONDS ? DRESS_MIN_SOURCE_SECONDS : dressBilledSeconds(natural + DRESS_BILLING_GUARD);
  if (billed > DRESS_MAX_SOURCE_SECONDS)
    return {
      ok: false,
      why: `${(shotOut - shotIn).toFixed(1)} s plus handles is longer than one swap carries (${DRESS_MAX_SOURCE_SECONDS} s): split the shot first`,
    };
  // never under the provider's minimum: Higgsfield refuses a source under 4.0 s at intake (it refused 3.954 s cuts
  // on 15 Oct 2026), so the guard only ever trims a window that is over the minimum
  const target = Math.min(Math.max(DRESS_MIN_SOURCE_SECONDS, billed - DRESS_BILLING_GUARD), takeEnd);
  const extra = target - (end - start);
  if (extra > 0) {
    // half before, half after; what one side cannot take (the take ends) goes to the other
    const before = Math.min(extra / 2, start);
    const after = Math.min(extra - before, takeEnd - end);
    const rest = extra - before - after;
    start -= before + Math.min(rest, start - before);
    end += after;
  }
  const seconds = end - start;
  if (seconds < DRESS_MIN_SOURCE_SECONDS - 1e-6)
    return {
      ok: false,
      why: `only ${seconds.toFixed(2)} s of take is available around this shot; the swap needs ${DRESS_MIN_SOURCE_SECONDS} s`,
    };
  return {
    ok: true,
    window: {
      start: r4(start),
      end: r4(end),
      seconds: r4(seconds),
      shotIn: r4(shotIn),
      shotOut: r4(shotOut),
      head: r4(shotIn - start),
      tail: r4(end - shotOut),
      billedSeconds: dressBilledSeconds(r4(seconds)),
      notes,
    },
  };
}

/** Where the dressed clip's first frame sits on the song: the cut's start, through the parent take's sync. */
export function dressedSongStart(
  cutStart: number,
  sync: Pick<PerformanceSync, "offsetSeconds" | "driftPpm">,
): number {
  return r4(performanceToSong(cutStart, sync as PerformanceSync));
}

// --- the reference pictures ------------------------------------------------------------------------------------------

export type DressPiece = {
  id: string;
  label: string;
  featureType: string;
  /** The product photo (reference_images[0] / storage_path). */
  storagePath: string | null;
  /** Every picture of the piece, the product photo included, with its angle. */
  images: { storagePath: string | null; angle?: string | null }[];
  /** The piece's construction, in words (character_features.dimensions_description). */
  construction: string | null;
};

export type DressReference = {
  pieceId: string;
  label: string;
  path: string;
  angle: string | null;
  role: "product" | "angle";
};

export type PieceKind = "outerwear" | "hat" | "eyewear" | "footwear" | "other";

const OUTERWEAR =
  /\b(jacket|coat|trench|blazer|parka|bomber|overshirt|anorak|windbreaker|outerwear|puffer|gilet|cardigan)\b/i;
const HAT = /\b(cap|hat|beanie|beret|bucket|snapback|visor|durag|du-rag|headwear)\b/i;
const EYEWEAR = /\b(glasses|sunglasses|eyewear|shades|spectacles)\b/i;
const FOOTWEAR = /\b(sneakers?|shoes?|boots?|loafers?|trainers?|slides?|sandals?)\b/i;

export function pieceKind(p: Pick<DressPiece, "label" | "featureType">): PieceKind {
  if (HAT.test(p.label)) return "hat";
  if (EYEWEAR.test(p.label)) return "eyewear";
  if (p.featureType === "wardrobe_footwear" || FOOTWEAR.test(p.label)) return "footwear";
  if (p.featureType === "wardrobe_outerwear" || OUTERWEAR.test(p.label)) return "outerwear";
  return "other";
}

const KIND_ORDER: Record<PieceKind, number> = { outerwear: 0, hat: 1, eyewear: 2, other: 2, footwear: 3 };
const ANGLE_ORDER = ["front", "three-quarter", "side", "detail", "back", "other"];
const angleRank = (a: string | null | undefined) => {
  const i = ANGLE_ORDER.indexOf(a ?? "other");
  return i < 0 ? ANGLE_ORDER.length : i;
};

/**
 * The pictures the swap is given, in order, and the pieces that could not go. Deterministic:
 *   1. the outerwear's product photo first (the jacket or coat is the main swap), then the hat, then the other
 *      pieces — each piece's product photo, in the outfit's own order within a kind;
 *   2. then, while there is room, the hat's and the shoes' other angles (the approved full look sent its front, side
 *      and detail).
 * A garment goes with its product photo ONLY: the extra crops of the v1 jacket (website arrows, a lighter on-model
 * jacket) made the edit copy the wrong garment. At most DRESS_MAX_REFERENCES pictures.
 */
export function dressReferences(
  pieces: readonly DressPiece[],
  cap = DRESS_MAX_REFERENCES,
): { sent: DressReference[]; notSent: { pieceId: string; label: string; why: string }[] } {
  const ordered = pieces
    .map((p, i) => ({ p, i, kind: pieceKind(p) }))
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.i - b.i);
  const notSent: { pieceId: string; label: string; why: string }[] = [];
  const primaries: { pieceId: string; ref: DressReference }[] = [];
  for (const { p } of ordered) {
    const path = p.storagePath ?? p.images.find((x) => x.storagePath)?.storagePath ?? null;
    if (!path) {
      notSent.push({ pieceId: p.id, label: p.label, why: "it has no photograph on file" });
      continue;
    }
    if (primaries.length >= cap) {
      notSent.push({
        pieceId: p.id,
        label: p.label,
        why: `the swap is given at most ${cap} pictures`,
      });
      continue;
    }
    const angle = p.images.find((x) => x.storagePath === path)?.angle ?? null;
    primaries.push({
      pieceId: p.id,
      ref: { pieceId: p.id, label: p.label, path, angle, role: "product" },
    });
  }
  const extras = new Map<string, DressReference[]>();
  let room = cap - primaries.length;
  for (const { p, kind } of ordered) {
    // the hat's other angles (and a pair of shoes': a shoe reads differently from the side and the back)
    if ((kind !== "hat" && kind !== "footwear") || room <= 0 || !primaries.some((x) => x.pieceId === p.id)) continue;
    const primary = primaries.find((x) => x.pieceId === p.id)!.ref.path;
    const seen = new Set([primary]);
    const more = p.images
      .filter(
        (x): x is { storagePath: string; angle?: string | null } =>
          !!x.storagePath && !seen.has(x.storagePath),
      )
      .map((x, i) => ({ x, i }))
      .sort((a, b) => angleRank(a.x.angle) - angleRank(b.x.angle) || a.i - b.i)
      .filter(({ x }) => (seen.has(x.storagePath) ? false : (seen.add(x.storagePath), true)))
      .slice(0, room)
      .map(({ x }) => ({
        pieceId: p.id,
        label: p.label,
        path: x.storagePath,
        angle: x.angle ?? null,
        role: "angle" as const,
      }));
    room -= more.length;
    extras.set(p.id, more);
  }
  const sent = primaries.flatMap(({ pieceId, ref }) => [ref, ...(extras.get(pieceId) ?? [])]);
  return { sent, notSent };
}

// --- the words -------------------------------------------------------------------------------------------------------

const REGION: Record<PieceKind, (label: string) => string> = {
  outerwear: (l) =>
    /\bcoat\b/i.test(l) ? "coat" : /\btrench\b/i.test(l) ? "trench coat" : "jacket",
  hat: (l) => (/\bcap\b/i.test(l) ? "cap" : "hat"),
  eyewear: () => "glasses",
  footwear: () => "shoes",
  other: (l) => l.trim().toLowerCase(),
};

function sentence(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t ? (/[.!?]$/.test(t) ? t : `${t}.`) : "";
}

function imageList(nums: number[]): string {
  if (nums.length === 1) return `reference image ${nums[0]}`;
  return `reference images ${nums[0]}–${nums[nums.length - 1]}`;
}

/**
 * The words the swap is given, from the outfit's pieces alone — the recipe's approved pattern: "Replace ONLY …", the
 * construction of each piece, and "Keep everything else exactly as in the source video …". Same pieces in, same words
 * out. Versioned by DRESS_PROMPT_VERSION.
 */
export function buildDressPrompt(
  pieces: readonly DressPiece[],
  references: readonly DressReference[],
): string {
  const sentIds = [...new Set(references.map((r) => r.pieceId))];
  const worn = sentIds
    .map((id) => pieces.find((p) => p.id === id))
    .filter((p): p is DressPiece => !!p);
  if (worn.length === 0)
    throw new Error("no piece of the outfit has a photograph to send — nothing to dress him in");
  const kinds = worn.map((p) => pieceKind(p));
  const regions = [...new Set(worn.map((p, i) => REGION[kinds[i]](p.label)))];
  const regionWords =
    regions.length === 1
      ? regions[0]
      : `${regions.slice(0, -1).join(", ")} and ${regions[regions.length - 1]}`;
  const which = worn.map((p) => {
    const nums = references.map((r, i) => (r.pieceId === p.id ? i + 1 : 0)).filter(Boolean);
    return `the ${p.label.trim()} (${imageList(nums)})`;
  });
  const truth = worn.map((p) => {
    const words = p.construction?.trim();
    return `${p.label.trim()}: ${words ? sentence(words) : "exactly as in its reference pictures — colour, fabric, stripes, logo and its placement."}`;
  });
  const keep = [
    "his face",
    "hair",
    ...(kinds.includes("eyewear") ? [] : ["glasses"]),
    "skin",
    "hands",
    "the rest of his clothes",
    "the room",
    "the lighting",
    "the camera move",
    "his performance timing",
  ];
  return [
    `Replace ONLY the man's ${regionWords} with the exact ${worn.length === 1 ? "piece" : "pieces"} shown in the reference images: ${which.join("; ")}.`,
    `Garment truth — ${truth.join(" ")}`,
    `Keep everything else exactly as in the source video: ${keep.slice(0, -1).join(", ")} and ${keep[keep.length - 1]}.`,
    `Each new piece must follow his body motion and the original folds and shadows; no other change.`,
  ].join(" ");
}

// --- what the job and the dressed take record -------------------------------------------------------------------------

/**
 * Everything a dressed take was made from — the dependency chain, so it can later be called current or stale:
 * scene → outfit (id + version) → the stretch of source footage (take, sync, window with handles) → the processing
 * (prompt version, reference paths) → the resulting media → its place on the timeline (the shot).
 */
export type DressRecord = {
  version: 1;
  provider: typeof DRESS_PROVIDER;
  modelVariant: string;
  resolution: string;
  promptVersion: string;
  prompt: string;
  references: { pieceId: string; path: string; angle: string | null }[];
  /** The parent take and the sync that placed it on the song when it was dressed. */
  sourceAssetId: string;
  syncId: string | null;
  sync: { offsetSeconds: number; driftPpm: number };
  /** The cut that was dressed, on the parent take's clock — handles included. */
  window: [number, number];
  /** The shot's own stretch of the take when it was dressed. */
  shotWindow: [number, number];
  handles: { head: number; tail: number };
  /** The song time of the dressed clip's first frame (= the cut's start through the sync). */
  songStart: number;
  /** The cut's measured length: what the server conforms the result to. */
  sourceSeconds: number;
  /** The uploaded cut (project-clips), or the asset it was registered as when it came from outside the app. */
  sourcePath: string | null;
  cutAssetId: string | null;
  /** The scene's outfit as it was dressed. */
  outfit: { id: string; key: string; name: string; version: number } | null;
  sceneId: string | null;
  shotId: string;
  shotKey: string;
  billedSeconds: number;
  estimateUsd: number;
  /** Set when an already-finished swap was filed rather than submitted (no money moved here). */
  imported?: { requestId: string; resultUrl: string } | null;
};

/** Read a dress record back from a job's settings or an asset's derived_from (anything malformed reads as null). */
export function dressRecordOf(v: unknown): DressRecord | null {
  const r = v as Partial<DressRecord> | null | undefined;
  if (!r || typeof r !== "object") return null;
  const pair = (w: unknown): w is [number, number] =>
    Array.isArray(w) &&
    w.length === 2 &&
    typeof w[0] === "number" &&
    typeof w[1] === "number" &&
    w[1] > w[0];
  if (
    typeof r.sourceAssetId !== "string" ||
    !pair(r.window) ||
    typeof r.songStart !== "number" ||
    typeof r.sourceSeconds !== "number" ||
    typeof r.promptVersion !== "string"
  )
    return null;
  return r as DressRecord;
}

// --- current or stale -------------------------------------------------------------------------------------------------

/**
 * A provider's answer, with every link taken out before it is kept on the job: signed source and reference links,
 * CDN links, and whatever the provider echoes of its inputs. The row is read by the whole project; a link that lets
 * anyone fetch a private file does not belong in it. Pure.
 */
export function scrubEnvelope(env: unknown): unknown {
  const isUrl = (v: unknown) => typeof v === "string" && /^https?:\/\//i.test(v.trim());
  const walk = (v: unknown): unknown => {
    if (isUrl(v)) return undefined;
    if (Array.isArray(v)) return v.map(walk).filter((x) => x !== undefined);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (/^input/i.test(k)) continue; // whatever the provider echoes of what it was given
        const w = walk(x);
        if (w !== undefined) out[k] = w;
      }
      return out;
    }
    return v;
  };
  return walk(env);
}

export type DressStaleCode =
  | "outfit_reassigned"
  | "outfit_version_changed"
  | "window_outside"
  | "sync_changed"
  | "take_changed"
  | "references_changed"
  | "prompt_changed"
  | "prompt_version_changed";
export type DressStaleness = {
  state: "current" | "stale";
  reasons: { code: DressStaleCode; text: string }[];
};

/** How far a shot may sit past the dressed range before it counts as outside (about a frame). */
export const DRESS_WINDOW_SLACK = 0.02;

/**
 * Whether a dressed take still matches the shot it is on, from the state now. It only FLAGS: nothing is regenerated
 * or spent because of it. Stale when the scene's outfit changed version or is another outfit now, when the shot's
 * stretch of the take moved outside the dressed cut (handles included), when the parent take's sync changed, or when
 * the dress words have a newer version.
 */
export function dressStaleness(
  record: Pick<DressRecord, "outfit" | "window" | "sync" | "syncId" | "promptVersion"> & {
    imported?: DressRecord["imported"];
    sourceAssetId?: string;
    references?: readonly { path: string }[];
    prompt?: string;
  },
  now: {
    outfit: { id: string; key: string; name: string; version: number } | null;
    sync: { id: string; offsetSeconds: number; driftPpm: number } | null;
    /** The shot's stretch of the parent take now (null = the take no longer covers the shot). */
    shotRange: { start: number; end: number } | null;
    promptVersion?: string;
    /** The take the shot would be dressed from now (absent = not checked). */
    sourceAssetId?: string | null;
    /** The pictures a dress would send now, in order, and the words — what the pieces resolve to today. */
    references?: readonly { path: string }[];
    prompt?: string;
  },
): DressStaleness {
  const reasons: DressStaleness["reasons"] = [];
  const made = record.outfit;
  if (!now.outfit)
    reasons.push({
      code: "outfit_reassigned",
      text: made
        ? `dressed in “${made.name}”; the shot now wears no outfit`
        : "dressed with no outfit recorded",
    });
  else if (!made || made.id !== now.outfit.id || made.key !== now.outfit.key)
    reasons.push({
      code: "outfit_reassigned",
      text: `dressed in “${made?.name ?? "an unrecorded outfit"}”; the shot now wears “${now.outfit.name}”`,
    });
  else if (now.outfit.version !== made.version)
    reasons.push({
      code: "outfit_version_changed",
      text: `dressed in “${made.name}” v${made.version}; it is now v${now.outfit.version}`,
    });
  if (!now.shotRange)
    reasons.push({ code: "window_outside", text: "the take no longer covers this shot" });
  else if (
    now.shotRange.start < record.window[0] - DRESS_WINDOW_SLACK ||
    now.shotRange.end > record.window[1] + DRESS_WINDOW_SLACK
  )
    reasons.push({
      code: "window_outside",
      text: `the shot now plays ${now.shotRange.start.toFixed(2)}–${now.shotRange.end.toFixed(2)} s of the take; the dressed cut is ${record.window[0].toFixed(2)}–${record.window[1].toFixed(2)} s`,
    });
  if (!now.sync)
    reasons.push({ code: "sync_changed", text: "the take is no longer matched to the song" });
  else if (
    (record.syncId && record.syncId !== now.sync.id) ||
    Math.abs(now.sync.offsetSeconds - record.sync.offsetSeconds) > 1e-3 ||
    Math.abs(now.sync.driftPpm - record.sync.driftPpm) > 0.5
  )
    reasons.push({
      code: "sync_changed",
      text: "the take's match to the song changed since it was dressed",
    });
  if (
    now.sourceAssetId !== undefined &&
    record.sourceAssetId &&
    now.sourceAssetId !== record.sourceAssetId
  )
    reasons.push({
      code: "take_changed",
      text: now.sourceAssetId
        ? "the shot is now dressed from another take"
        : "the shot no longer has a take to dress",
    });
  // a replaced garment photo, or a piece added or taken off, changes what would be sent
  if (now.references && record.references) {
    const then = record.references.map((r) => r.path);
    const paths = now.references.map((r) => r.path);
    if (then.length !== paths.length || then.some((p, i) => p !== paths[i]))
      reasons.push({
        code: "references_changed",
        text: "the outfit's pictures changed since it was dressed",
      });
  }
  // a finished swap filed from outside was approved by eye with its own words: the tool's words moving on does not age it
  const current = now.promptVersion ?? DRESS_PROMPT_VERSION;
  if (!record.imported && record.promptVersion !== current)
    reasons.push({
      code: "prompt_version_changed",
      text: `dressed with words ${record.promptVersion}; the tool now uses ${current}`,
    });
  else if (
    !record.imported &&
    now.prompt !== undefined &&
    record.prompt !== undefined &&
    now.prompt !== record.prompt
  )
    reasons.push({
      code: "prompt_changed",
      text: "the outfit's description changed since it was dressed, so the words would differ",
    });
  return { state: reasons.length ? "stale" : "current", reasons };
}

// --- the request ------------------------------------------------------------------------------------------------------

export type DressRequest = {
  endpoint: typeof DRESS_ENDPOINT;
  provider: typeof DRESS_PROVIDER;
  modelVariant: string;
  body: Record<string, unknown>;
};

/** The provider request for one dress — what goes through proxy-provider-call. Pure. */
export function composeDressRequest(input: {
  prompt: string;
  sourceUrl: string;
  referenceUrls: readonly string[];
  billedSeconds: number;
  projectId: string;
}): DressRequest {
  if (input.referenceUrls.length === 0)
    throw new Error("the swap needs at least one reference picture");
  return {
    endpoint: DRESS_ENDPOINT,
    provider: DRESS_PROVIDER,
    modelVariant: DRESS_MODEL_VARIANT,
    body: {
      mode: "video_to_video",
      modelVariant: DRESS_MODEL_VARIANT,
      referenceVideoUrl: input.sourceUrl,
      referenceImageUrls: [...input.referenceUrls],
      resolution: DRESS_RESOLUTION,
      promptText: input.prompt,
      // the source's billed length: Control Center's own estimate is made from it (the output follows the source)
      duration: input.billedSeconds,
      avt_project_id: input.projectId,
    },
  };
}

// --- one shot, planned -------------------------------------------------------------------------------------------------

export type DressPlan = {
  window: DressWindow;
  references: DressReference[];
  notSent: { pieceId: string; label: string; why: string }[];
  prompt: string;
  cost: ReturnType<typeof dressCost>;
};

/**
 * Everything a dress of one shot will send, decided before anything is cut or paid for: the window with its handles,
 * the pictures, the words and the exact cost. Refused with the reason when the shot cannot be dressed.
 */
export function planDress(input: {
  shotIn: number;
  shotOut: number;
  takeSeconds: number | null;
  pieces: readonly DressPiece[];
  head?: number;
  tail?: number;
}): { ok: true; plan: DressPlan } | { ok: false; why: string } {
  if (input.pieces.length === 0)
    return { ok: false, why: "the scene's outfit has no pieces to dress him in" };
  const w = dressWindow(input);
  if (!w.ok) return w;
  const { sent, notSent } = dressReferences(input.pieces);
  if (sent.length === 0)
    return { ok: false, why: "no piece of the outfit has a photograph on file" };
  return {
    ok: true,
    plan: {
      window: w.window,
      references: sent,
      notSent,
      prompt: buildDressPrompt(input.pieces, sent),
      cost: dressCost(w.window.seconds),
    },
  };
}

/** The settings a dress job carries (provider_jobs.request_payload_json.settings): the storyboard's run, this shot, the record. */
export function dressJobSettings(input: {
  batchRun: string;
  shotKey: string;
  record: DressRecord;
  madeFrom?: unknown;
}): Record<string, unknown> {
  const r = input.record;
  return {
    batchRun: input.batchRun,
    batchShotId: input.shotKey,
    route: DRESS_ROUTE,
    kind: "angle",
    estimateUsd: r.estimateUsd,
    lookPreset: "none",
    sourcePath: r.sourcePath,
    sourceWindow: r.window,
    sourceAssetId: r.sourceAssetId,
    sourceSeconds: r.sourceSeconds,
    dress: r,
    ...(input.madeFrom ? { madeFrom: input.madeFrom } : {}),
  };
}

export type DressImport = {
  projectId: string;
  variationId: string | null;
  userId: string;
  shot: { id: string; key: string };
  /** The take the swapped cut came from, and its sync to the song now. */
  parentTakeId: string;
  parentSync: { id: string; offsetSeconds: number; driftPpm: number };
  /** The cut that was swapped, on the parent take's clock. */
  window: [number, number];
  /** The cut's own measured length (what the result is conformed to). Defaults to the window's length. */
  sourceSeconds?: number;
  /** The shot's stretch of the parent take when it was swapped (defaults to the window: no handles). */
  shotWindow?: [number, number];
  /** The cut as it was registered in the project, when it was (an asset of its own). */
  cutAssetId?: string | null;
  requestId: string;
  resultUrl: string;
  outfit: DressRecord["outfit"];
  sceneId?: string | null;
  references: DressRecord["references"];
  prompt: string;
  promptVersion: string;
  batchRun: string;
};

/**
 * File a swap that already finished (no money moves here): the provider_jobs row that hands it to the server exactly
 * as if the tool had submitted it and the provider had just answered — status succeeded, the provider's request id,
 * its result URL — so provider-jobs-tick downloads it, conforms it to the cut's length, files it as a dressed take in
 * sync and puts it on its shot unselected. Pure: the caller inserts the row.
 */
export function planDressImport(input: DressImport): Record<string, unknown> {
  const [start, end] = input.window;
  if (!(end > start)) throw new Error("the swapped window is empty");
  if (!/^https:\/\//.test(input.resultUrl)) throw new Error("the result URL must be https");
  if (!DRESS_ID_RE.test(input.requestId))
    throw new Error("the provider's request id must be a plain id (letters, digits, _ -)");
  const sourceSeconds = input.sourceSeconds ?? r4(end - start);
  const shotWindow = input.shotWindow ?? input.window;
  const billedSeconds = dressBilledSeconds(sourceSeconds);
  const record: DressRecord = {
    version: 1,
    provider: DRESS_PROVIDER,
    modelVariant: DRESS_MODEL_VARIANT,
    resolution: DRESS_RESOLUTION,
    promptVersion: input.promptVersion,
    prompt: input.prompt,
    references: input.references,
    sourceAssetId: input.parentTakeId,
    syncId: input.parentSync.id,
    sync: { offsetSeconds: input.parentSync.offsetSeconds, driftPpm: input.parentSync.driftPpm },
    window: [r4(start), r4(start + sourceSeconds)],
    shotWindow: [r4(shotWindow[0]), r4(shotWindow[1])],
    handles: {
      head: r4(Math.max(0, shotWindow[0] - start)),
      tail: r4(Math.max(0, start + sourceSeconds - shotWindow[1])),
    },
    songStart: dressedSongStart(start, input.parentSync),
    sourceSeconds: r4(sourceSeconds),
    sourcePath: null,
    cutAssetId: input.cutAssetId ?? null,
    outfit: input.outfit,
    sceneId: input.sceneId ?? null,
    shotId: input.shot.id,
    shotKey: input.shot.key,
    billedSeconds,
    estimateUsd: (billedSeconds * DRESS_MILLS_PER_SECOND) / 1000,
    imported: { requestId: input.requestId, resultUrl: input.resultUrl },
  };
  return {
    user_id: input.userId,
    project_id: input.projectId,
    ...(input.variationId ? { variation_id: input.variationId } : {}),
    provider: DRESS_PROVIDER,
    status: "succeeded",
    external_job_id: input.requestId,
    request_payload_json: {
      promptText: input.prompt,
      mode: "video_to_video",
      modelVariant: DRESS_MODEL_VARIANT,
      resolution: DRESS_RESOLUTION,
      shotId: input.shot.id,
      referenceImagePaths: input.references.map((r) => r.path),
      imported: true,
      settings: dressJobSettings({ batchRun: input.batchRun, shotKey: input.shot.key, record }),
    },
    response_payload_json: {
      status: "succeeded",
      resultUrl: input.resultUrl,
      providerJobId: input.requestId,
      imported: true,
    },
  };
}

// --- one dress at a time per shot ------------------------------------------------------------------------------------

export type LiveJobRow = {
  id: string;
  status: string;
  finalized_at?: string | null;
  request_payload_json: unknown;
};

/**
 * A dress of this shot that is still running (queued or running, not finished by the server) — and, when a window
 * is given, of the same stretch of take. The storyboard disables the button on it; the submit refuses on it. Pure.
 */
export function findLiveDressJob(
  rows: readonly LiveJobRow[],
  shot: { shotId?: string; shotKey?: string; window?: [number, number] },
): LiveJobRow | null {
  for (const r of rows) {
    if (!(r.status === "queued" || r.status === "running") || r.finalized_at) continue;
    const payload = (r.request_payload_json ?? {}) as {
      shotId?: unknown;
      settings?: { route?: unknown; batchShotId?: unknown; dress?: unknown };
    };
    if (payload.settings?.route !== DRESS_ROUTE) continue;
    if (shot.shotId && payload.shotId !== shot.shotId) continue;
    if (shot.shotKey && payload.settings?.batchShotId !== shot.shotKey) continue;
    if (shot.window) {
      const rec = dressRecordOf(payload.settings?.dress);
      if (
        !rec ||
        Math.abs(rec.window[0] - shot.window[0]) > DRESS_WINDOW_SLACK ||
        Math.abs(rec.window[1] - shot.window[1]) > DRESS_WINDOW_SLACK
      )
        continue;
    }
    return r;
  }
  return null;
}
