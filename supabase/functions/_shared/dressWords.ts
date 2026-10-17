// Deno copy of the pure words of a dress (the Genjutsu object swap) — src/lib/storyboard/dress.ts: the pieces' kinds,
// the pictures sent and their order, the prompt, the billed seconds and the envelope scrub. Edge functions deploy from
// this folder alone and cannot import "@/…", so the words live twice; dressWords.test.ts holds the two copies together
// word for word, so a swap sent from the server (dress-clip) says exactly what the storyboard's Dress button says.
//
// Also here: which pieces a shot wears (wornPieces — wardrobe/outfits.ts resolveOutfit + effectiveGarments), shared by
// montage-shot (its shoes) and dress-clip (what to swap).

export const DRESS_MIN_SOURCE_SECONDS = 4;
export const DRESS_MAX_SOURCE_SECONDS = 30;
export const DRESS_RESOLUTION = "720p" as const;
export const DRESS_MILLS_PER_SECOND = 681;
export const DRESS_PROVIDER = "higgsfield" as const;
export const DRESS_ENDPOINT = "video-providers-higgsfield-model" as const;
export const DRESS_MODEL_VARIANT = "genjutsu-object-swap" as const;
export const DRESS_ROUTE = "genjutsu_swap" as const;
export const DRESS_MAX_REFERENCES = 4;
export const DRESS_PROMPT_VERSION = "dress-v1";

export type DressPiece = {
  id: string;
  label: string;
  featureType: string;
  storagePath: string | null;
  images: { storagePath: string | null; angle?: string | null }[];
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

const KIND_ORDER: Record<PieceKind, number> = {
  outerwear: 0,
  hat: 1,
  eyewear: 2,
  other: 2,
  footwear: 3,
};
const ANGLE_ORDER = ["front", "three-quarter", "side", "detail", "back", "other"];
const angleRank = (a: string | null | undefined) => {
  const i = ANGLE_ORDER.indexOf(a ?? "other");
  return i < 0 ? ANGLE_ORDER.length : i;
};

/** Whole seconds billed for a source of this length: every started second, never under the 4 s minimum. */
export function dressBilledSeconds(sourceSeconds: number): number {
  return Math.max(DRESS_MIN_SOURCE_SECONDS, Math.ceil(sourceSeconds - 1e-9));
}

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
    if (
      (kind !== "hat" && kind !== "footwear") ||
      room <= 0 ||
      !primaries.some((x) => x.pieceId === p.id)
    )
      continue;
    const primary = primaries.find((x) => x.pieceId === p.id)!.ref.path;
    const seen = new Set([primary]);
    const more = p.images
      .filter((x): x is { storagePath: string; angle?: string | null } => !!x.storagePath)
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

export function buildDressPrompt(
  pieces: readonly DressPiece[],
  references: readonly DressReference[],
  opts: { wearer?: string | null } = {},
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
  // other people in the frame (a montage's crowd): he is named by what he keeps on, and nobody else changes
  const wearer = opts.wearer?.trim() || null;
  const whose = wearer
    ? `the ${regionWords} of the man wearing the ${wearer}`
    : `the man's ${regionWords}`;
  return [
    `Replace ONLY ${whose} with the exact ${worn.length === 1 ? "piece" : "pieces"} shown in the reference images: ${which.join("; ")}.`,
    `Garment truth — ${truth.join(" ")}`,
    `Keep everything else exactly as in the source video: ${keep.slice(0, -1).join(", ")} and ${keep[keep.length - 1]}.`,
    `Each new piece must follow his body motion and the original folds and shadows; no other change.`,
    ...(wearer
      ? [
          `Only he changes: every other person in the frame keeps their own clothes and shoes exactly as in the source video.`,
        ]
      : []),
  ].join(" ");
}

/** The provider's answer without a single link in it (dress.ts scrubEnvelope): the row is read by the whole project. */
export function scrubEnvelope(env: unknown): unknown {
  const isUrl = (v: unknown) => typeof v === "string" && /^https?:\/\//i.test(v.trim());
  const walk = (v: unknown): unknown => {
    if (isUrl(v)) return undefined;
    if (Array.isArray(v)) return v.map(walk).filter((x) => x !== undefined);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (/^input/i.test(k)) continue;
        const w = walk(x);
        if (w !== undefined) out[k] = w;
      }
      return out;
    }
    return v;
  };
  return walk(env);
}

/**
 * Which outfit's pieces he wears in the shot (wardrobe/outfits.ts resolveOutfit + effectiveGarments): the shot's own
 * garments when it names any; else, by the shot's outfit mode, none / its exception outfit / its scene's outfit.
 * Answers the pieces when they are already known, else the outfit key to look up.
 */
export function wornPieces(
  spec: Record<string, unknown>,
  sceneOutfitKey: string | null,
): { ids: string[] } | { outfitKey: string } | { none: true } {
  const w = (spec.wardrobe ?? {}) as Record<string, unknown>;
  const own = Array.isArray(w.garments)
    ? w.garments.filter((g): g is string => typeof g === "string")
    : [];
  if (own.length > 0) return { ids: own };
  const mode = typeof w.outfitMode === "string" ? w.outfitMode : "inherit";
  if (mode === "none") return { none: true };
  const key =
    mode === "exception" ? (typeof w.outfitKey === "string" ? w.outfitKey : null) : sceneOutfitKey;
  return key ? { outfitKey: key } : { none: true };
}
