/**
 * CAST — who is in a shot, decided once per video variation and pointed at by key.
 *
 * ── WHY THIS IS A CONTINUITY ENTITY AND NOT A NEW TABLE ────────────────────────
 * A cast member is a continuity entity of kind `character`. It is not a parallel system, and that
 * is deliberate: `continuity_entities` already carries, tested and deployed, every property a cast
 * record needs and that a new table would have had to re-earn —
 *
 *   • VARIATION SCOPE. `variation_id`, a unique key per variation, a fill trigger, and a place in
 *     `duplicate_variation()`. Two variations of one song can be cast completely differently and
 *     neither can silently change the other. A new table would have had to re-implement all of it.
 *   • APPROVED REFERENCES. `approved_asset_id` + `reference_asset_ids`, already rows of
 *     `project_assets`, never copies.
 *   • THE WAY A SHOT POINTS. `spec.continuity` already references entities by key; `spec.cast` does
 *     the same thing with the same discipline, so a cast member is described ONCE.
 *   • ARCHIVING without breaking the shots that already name it.
 *
 * ── WHAT THIS IS NOT ───────────────────────────────────────────────────────────
 * It is NOT an identity authority and holds no likeness of anyone. The primary artist's identity
 * lives where it already lives — `artists` (`identity_profile_json`, `continuity_rules`,
 * `forbidden_inaccuracies`), `character_features` (the locked Character DNA) and `artist_looks`.
 * A cast member of role `primary_artist` carries `artistId` and **defers** to those records; it
 * never restates them. Casting says WHO IS IN THE SHOT. The artist record says WHO THEY ARE.
 *
 * ── DEMOGRAPHICS ───────────────────────────────────────────────────────────────
 * Appearance is the entity's own `description`: free text, written by the director, carried verbatim
 * into every request. Nothing here infers appearance from an image, and nothing populates it from a
 * genre, a style or any other assumption. An empty description means the director has not said, and
 * that is reported as unsaid — never filled in.
 *
 * Pure module: no react, no supabase, no project knowledge.
 */
import type { ContinuityEntity, EntityIndex } from "@/lib/continuity/entities";
import type { ShotSpec } from "@/lib/treatment/shotSpec";

/** What a cast member is to the production. Decides what a missing reference means, not who they are. */
export const CAST_ROLES = ["primary_artist", "recurring", "fictional", "background"] as const;
export type CastRole = (typeof CAST_ROLES)[number];

export const ROLE_LABEL: Record<CastRole, string> = {
  primary_artist: "Primary artist",
  recurring: "Recurring character",
  fictional: "New character",
  background: "Background / group",
};

/**
 * How much of a real person must survive generation. Same three words as
 * `src/lib/prompts/realism.ts` on purpose — one vocabulary for identity across the app, so a shot
 * and a prompt modifier cannot disagree about what "preserve" means.
 */
export const IDENTITY_MODES = ["preserve", "recurring", "invent"] as const;
export type CastIdentityMode = (typeof IDENTITY_MODES)[number];

export const IDENTITY_LABEL: Record<CastIdentityMode, string> = {
  preserve: "Preserve this exact person",
  recurring: "Keep consistent with the approved reference",
  invent: "Invent — no reference to match",
};

/** The character-only columns. Null on a location, a prop or a lighting state. */
export type CastFacts = {
  role: CastRole;
  identityMode: CastIdentityMode;
  /** `artists.id` when this cast member IS the artist. The likeness lives there, never here. */
  artistId: string | null;
};

/** True when this entity is a cast member. Narrows `cast` to non-null. */
export function isCastMember(e: ContinuityEntity): e is ContinuityEntity & { cast: CastFacts } {
  return e.kind === "character" && e.cast != null;
}

// ---------------------------------------------------------------------------
// What a shot says about one cast member
// ---------------------------------------------------------------------------
/**
 * A shot's direction for one person. The key names the entity; everything else is this shot's
 * business and is NOT stored on the entity — the same character stands differently in every shot.
 */
export type CastRef = {
  key: string;
  action: string;
  placement: string;
  framing: string;
  /** Overrides the entity's mode for this shot only. Null = use the entity's. */
  identityMode: CastIdentityMode | null;
};

export type ResolvedCastMember = {
  ref: CastRef;
  entity: ContinuityEntity & { cast: CastFacts };
  /** The mode actually in force here: the shot's override, else the entity's. */
  mode: CastIdentityMode;
};

export type ShotCast = {
  members: ResolvedCastMember[];
  /** The director said this shot's casting is deliberately open. */
  open: boolean;
  /** The director said there are no people in this shot. */
  none: boolean;
  /** Keys the shot names that this variation does not have, or that are not characters. Never dropped silently. */
  missing: string[];
};

export const NO_CAST: ShotCast = { members: [], open: false, none: false, missing: [] };

/**
 * Resolve a shot's cast against the variation's entities.
 *
 * A key that resolves to a non-character entity goes to `missing` rather than being coerced: a shot
 * that points at a prop as if it were a person is a mistake to show, not to paper over.
 */
export function resolveCast(spec: Pick<ShotSpec, "cast">, index: EntityIndex): ShotCast {
  const refs = spec.cast ?? { members: [], open: false, none: false };
  const missing: string[] = [];
  const members: ResolvedCastMember[] = [];
  for (const ref of refs.members ?? []) {
    const e = index.get(ref.key);
    if (!e || e.kind !== "character" || !e.cast) {
      missing.push(ref.key);
      continue;
    }
    const entity = e as ContinuityEntity & { cast: CastFacts };
    members.push({ ref, entity, mode: ref.identityMode ?? entity.cast.identityMode });
  }
  return { members, open: refs.open === true, none: refs.none === true, missing };
}

// ---------------------------------------------------------------------------
// Readiness — said BEFORE anything is generated
// ---------------------------------------------------------------------------
export type CastProblemLevel = "blocking" | "warning" | "unsaid";

export type CastProblem = {
  level: CastProblemLevel;
  /** The cast key it is about, or null for the shot as a whole. */
  key: string | null;
  text: string;
  /** What would clear it. Never empty — a problem with no remedy is a complaint. */
  fix: string;
};

/**
 * What is wrong with this shot's casting, before a request is built.
 *
 * The distinction the director actually needs is between a shot whose casting is **open on purpose**
 * and one that is **simply unsaid**. Both produce whatever the model feels like; only one of them is
 * a decision. An empty cast with neither `open` nor `none` set is reported as `unsaid`, every time.
 */
export function castProblems(cast: ShotCast): CastProblem[] {
  const out: CastProblem[] = [];

  if (cast.none && cast.members.length > 0) {
    out.push({
      level: "blocking",
      key: null,
      text: "the shot is marked as having no people, and also names cast members",
      fix: "clear the cast list, or un-mark 'no people'",
    });
  }
  if (cast.open && cast.members.length > 0) {
    out.push({
      level: "warning",
      key: null,
      text: "the shot is marked open casting, and also names cast members",
      fix: "open casting applies to the rest of the frame; confirm that is what was meant",
    });
  }
  if (!cast.none && !cast.open && cast.members.length === 0 && cast.missing.length === 0) {
    out.push({
      level: "unsaid",
      key: null,
      text: "nobody is cast and the shot is not marked 'no people' or 'open casting' — whoever appears will be the model's choice, not a decision",
      fix: "cast someone, or mark the shot 'no people' or 'open casting' so the silence is on purpose",
    });
  }

  for (const key of cast.missing) {
    out.push({
      level: "blocking",
      key,
      text: `this shot casts ${key}, which this variation has no character for`,
      fix: `create a character with key ${key} in this variation, or remove it from the shot`,
    });
  }

  for (const m of cast.members) {
    const { entity, mode } = m;
    const hasReference = !!entity.approvedAssetId || entity.referenceAssetIds.length > 0;
    const isArtist = entity.cast.role === "primary_artist" && !!entity.cast.artistId;

    // "preserve" and "recurring" both mean: match a person who already exists. Without a picture
    // there is nothing to match, and the request would quietly become an invention.
    if ((mode === "preserve" || mode === "recurring") && !hasReference && !isArtist) {
      out.push({
        level: "blocking",
        key: entity.key,
        text: `${entity.name} is set to ${mode === "preserve" ? "preserve this exact person" : "keep consistent with the approved reference"}, but has no approved or reference picture`,
        fix: `approve a reference image for ${entity.name}, or set this shot's identity to invent`,
      });
    }

    if (entity.cast.role === "primary_artist" && !entity.cast.artistId) {
      out.push({
        level: "blocking",
        key: entity.key,
        text: `${entity.name} is cast as the primary artist but is linked to no artist record, so their identity has no source`,
        fix: "link this cast member to the artist, or change the role",
      });
    }

    if (mode === "invent" && hasReference) {
      out.push({
        level: "warning",
        key: entity.key,
        text: `${entity.name} has a reference picture but this shot is set to invent, so the picture will not be matched`,
        fix: "set the identity to preserve or recurring if the reference is meant to be used",
      });
    }

    if (!entity.description.trim() && mode === "invent") {
      out.push({
        level: "unsaid",
        key: entity.key,
        text: `${entity.name} has no appearance description and nothing to match, so their appearance is entirely the model's choice`,
        fix: `describe ${entity.name} on the character record`,
      });
    }

    if (entity.archived) {
      out.push({
        level: "warning",
        key: entity.key,
        text: `${entity.name} is archived but still cast in this shot`,
        fix: "un-archive the character, or remove them from the shot",
      });
    }
  }

  return out;
}

/** Nothing may be generated while this is true. */
export function castBlocks(cast: ShotCast): boolean {
  return castProblems(cast).some((p) => p.level === "blocking");
}

// ---------------------------------------------------------------------------
// What the request carries
// ---------------------------------------------------------------------------
const sentence = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t ? (/[.!?]$/.test(t) ? t : `${t}.`) : "";
};

const MODE_CLAUSE: Record<CastIdentityMode, string> = {
  preserve:
    "render this exact person as in the reference — do not substitute or idealise their features",
  recurring: "keep this character consistent with the approved reference",
  invent: "a new person invented for this video; they match no existing reference",
};

export type CastSource = {
  /** The lines the request carries, in cast order. */
  lines: string[];
  /** `project_assets` ids the route should attach, in priority order, de-duped. */
  referenceAssetIds: string[];
  /** `artists.id` whose Character DNA the route should pull, when the artist is in the shot. */
  artistIds: string[];
  /** Said to the director before generation. Includes everything NOT carried. */
  notes: string[];
};

/**
 * The cast half of a picture or clip request.
 *
 * One line per person, in the order they were cast, each carrying: who they are (the entity's own
 * words, identical in every shot — that is the continuity), what they do here, where they stand and
 * how they are framed, and what must survive of their identity.
 *
 * `open` and `none` are stated too. A model told nothing about people invents them; a model told
 * "no people" has been given a direction.
 */
export function castSource(cast: ShotCast): CastSource {
  const lines: string[] = [];
  const referenceAssetIds: string[] = [];
  const artistIds: string[] = [];
  const notes: string[] = [];
  const seenAsset = new Set<string>();
  const seenArtist = new Set<string>();

  if (cast.none) lines.push("No people appear in this shot.");
  else if (cast.open && cast.members.length === 0)
    lines.push("Casting is deliberately open for this shot.");

  for (const { ref, entity, mode } of cast.members) {
    const who = [sentence(entity.description), sentence(entity.constraints)]
      .filter(Boolean)
      .join(" ");
    const parts = [`${entity.name}${who ? ` — ${who}` : ""}`];
    if (ref.action.trim()) parts.push(`Action: ${sentence(ref.action)}`);
    if (ref.placement.trim()) parts.push(`Placement: ${sentence(ref.placement)}`);
    if (ref.framing.trim()) parts.push(`Framing: ${sentence(ref.framing)}`);
    parts.push(`Identity: ${MODE_CLAUSE[mode]}.`);
    lines.push(parts.join(" "));

    if (mode !== "invent") {
      for (const id of [entity.approvedAssetId, ...entity.referenceAssetIds]) {
        if (id && !seenAsset.has(id)) {
          seenAsset.add(id);
          referenceAssetIds.push(id);
        }
      }
      const aid = entity.cast.artistId;
      if (aid && !seenArtist.has(aid)) {
        seenArtist.add(aid);
        artistIds.push(aid);
      }
    }

    if (!who)
      notes.push(
        `${entity.name} has no description on their character record, so the request says only their name and this shot's direction.`,
      );
  }

  for (const key of cast.missing)
    notes.push(
      `This shot casts ${key}, which this variation does not have — nothing about them is in the request.`,
    );

  return { lines, referenceAssetIds, artistIds, notes };
}

// ---------------------------------------------------------------------------
// Does the route this is going to actually support it?
// ---------------------------------------------------------------------------
export type RouteCastCheck = {
  /** References the route will NOT receive, with the reason. Never silent. */
  dropped: { assetIds: string[]; reason: string } | null;
  warnings: string[];
};

/**
 * What a given provider will and will not honour from this cast.
 *
 * The failure this exists to prevent: a shot says "preserve this exact person", the route cannot
 * take a reference image, the request goes anyway, and the result is a stranger that nobody can
 * explain. `supportsReferenceImage` comes from `provider_capabilities`, the same table
 * `applyCapability` already reads — this does not invent a second answer, it only reports it where
 * a human can see it before paying.
 */
export function castRouteCheck(
  source: CastSource,
  cap: { provider: string; supportsReferenceImage: boolean } | null,
): RouteCastCheck {
  if (!cap)
    return {
      dropped: null,
      warnings: [
        "the provider for this shot is not known yet, so reference support cannot be checked",
      ],
    };
  const warnings: string[] = [];
  let dropped: RouteCastCheck["dropped"] = null;

  if (source.referenceAssetIds.length > 0 && !cap.supportsReferenceImage) {
    dropped = {
      assetIds: source.referenceAssetIds,
      reason: `${cap.provider} does not accept a reference image, so ${source.referenceAssetIds.length} identity reference(s) will not be sent — the wording stays, the likeness is not matched`,
    };
    warnings.push(
      `This shot asks to match a real person, but ${cap.provider} cannot take their picture. Use a provider that supports reference images, or accept that the person will be invented.`,
    );
  }

  if (source.artistIds.length > 0 && !cap.supportsReferenceImage) {
    warnings.push(
      `${cap.provider} cannot take the artist's Character DNA; their likeness is carried only as words.`,
    );
  }

  return { dropped, warnings };
}
