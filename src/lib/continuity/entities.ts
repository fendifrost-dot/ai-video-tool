/**
 * Continuity entities — a place, a prop or a lighting state that several shots of a project share, described ONCE
 * (Fendi, 2026-10-03: "A storyboard shot should reference these entities rather than recreate them from prose…
 * If multiple shots reference PARIS_BLACK_RUNWAY, generation should use the same canonical continuity source.")
 *
 * The entity carries the canonical description, the constraints, and its reference pictures (the approved one and
 * the others — rows of project_assets, never copies). A shot points at entities from its own record
 * (`spec.continuity`), by key; a timed event may point at a lighting state. Wardrobe LOOKS are the existing Look
 * records and are pointed at the same way (`spec.wardrobe.lookId`): nothing here duplicates them.
 *
 * What an entity gives generation, said exactly (see `continuitySource`):
 *   • its WORDS — the canonical description and constraints go, verbatim and identical, into the picture request of
 *     every shot that points at it. This is what the image model used for stills can take: it reads no picture.
 *   • its PICTURE — a location's approved picture IS the place wherever a place picture is an input: every
 *     performance shot set there is restaged into that one picture, and it can be put on a shot as the shot's image.
 * Nothing here claims a prop's reference picture steers the still model — it does not take one.
 *
 * Pure module: no react, no supabase, no project knowledge.
 */
import { CAST_ROLES, IDENTITY_MODES, type CastFacts, type CastIdentityMode, type CastRole } from "@/lib/casting/cast";
import type { ShotEvent, ShotSpec } from "@/lib/treatment/shotSpec";

export const ENTITY_KINDS = ["location", "prop", "lighting", "character"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const KIND_LABEL: Record<EntityKind, string> = { location: "Location", prop: "Prop", lighting: "Lighting state", character: "Character" };
export const KIND_PLURAL: Record<EntityKind, string> = { location: "Locations", prop: "Props", lighting: "Lighting states", character: "Cast" };

export type ContinuityEntity = {
  id: string;
  projectId: string;
  /** The video variation this entity belongs to (null only on a row from before variations). */
  variationId: string | null;
  kind: EntityKind;
  /** Its identity inside the project — what shots point at. Never changes once shots use it. */
  key: string;
  name: string;
  /** The canonical description every shot that points at it is generated from. */
  description: string;
  /** What must always / never be true of it when it is drawn. */
  constraints: string;
  /** The approved reference picture (project_assets.id). */
  approvedAssetId: string | null;
  /** Its other reference pictures, uploaded or generated for it (project_assets ids). */
  referenceAssetIds: string[];
  /**
   * The character-only facts, non-null exactly when `kind === "character"`. A cast member is an
   * entity so it inherits variation scope, duplication and approved references; see
   * `src/lib/casting/cast.ts` for why this is not a table of its own.
   */
  cast: CastFacts | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EntityRow = {
  id: string;
  project_id: string;
  variation_id?: string | null;
  kind: string;
  key: string;
  name: string;
  description: string | null;
  constraints: string | null;
  approved_asset_id: string | null;
  reference_asset_ids: string[] | null;
  archived: boolean | null;
  cast_role?: string | null;
  identity_mode?: string | null;
  artist_id?: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * The character columns, read defensively: a row whose kind is `character` but whose role or mode is
 * missing or unrecognised still becomes a cast member, with the safest defaults. Dropping the row
 * would lose a character the shots already point at; guessing a likeness would be worse, so the
 * fallback is the mode that matches nobody.
 */
function castFactsFromRow(row: EntityRow): CastFacts | null {
  if (row.kind !== "character") return null;
  const role = (CAST_ROLES as readonly string[]).includes(row.cast_role ?? "") ? (row.cast_role as CastRole) : "fictional";
  const identityMode = (IDENTITY_MODES as readonly string[]).includes(row.identity_mode ?? "")
    ? (row.identity_mode as CastIdentityMode)
    : "invent";
  return { role, identityMode, artistId: row.artist_id ?? null };
}

export function entityFromRow(row: EntityRow): ContinuityEntity | null {
  if (!(ENTITY_KINDS as readonly string[]).includes(row.kind)) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    variationId: row.variation_id ?? null,
    kind: row.kind as EntityKind,
    key: row.key,
    name: row.name,
    description: (row.description ?? "").trim(),
    constraints: (row.constraints ?? "").trim(),
    approvedAssetId: row.approved_asset_id ?? null,
    referenceAssetIds: Array.isArray(row.reference_asset_ids) ? row.reference_asset_ids.filter((x) => typeof x === "string") : [],
    cast: castFactsFromRow(row),
    archived: row.archived === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** "Paris Black Runway" → "PARIS_BLACK_RUNWAY". Empty when the name has nothing a key can be made of. */
export function entityKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** A key for a new entity that no entity of the project has. */
export function uniqueKey(name: string, taken: ReadonlySet<string> | readonly string[]): string {
  const used = taken instanceof Set ? taken : new Set(taken as readonly string[]);
  const base = entityKey(name) || "ENTITY";
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const k = `${base.slice(0, 56)}_${n}`;
    if (!used.has(k)) return k;
  }
  return `${base.slice(0, 40)}_${Date.now()}`;
}

export type EntityIndex = ReadonlyMap<string, ContinuityEntity>;

/** The project's entities by key. Archived ones stay findable — a shot that points at one still says what it meant. */
export function indexEntities(entities: readonly ContinuityEntity[]): EntityIndex {
  return new Map(entities.map((e) => [e.key, e]));
}

export type LookRef = { id: string; name: string; description: string | null };

export type ShotContinuity = {
  location: ContinuityEntity | null;
  props: ContinuityEntity[];
  lighting: ContinuityEntity | null;
  look: LookRef | null;
  /** Keys the shot points at that the project no longer has (or that are of another kind). Never silently dropped. */
  missing: string[];
};

export const NO_CONTINUITY: ShotContinuity = { location: null, props: [], lighting: null, look: null, missing: [] };

/** What a shot's references resolve to. */
export function resolveContinuity(spec: Pick<ShotSpec, "continuity" | "wardrobe">, index: EntityIndex, looks: readonly LookRef[] = []): ShotContinuity {
  const missing: string[] = [];
  const get = (key: string | null | undefined, kind: EntityKind): ContinuityEntity | null => {
    if (!key) return null;
    const e = index.get(key);
    if (!e || e.kind !== kind) {
      missing.push(key);
      return null;
    }
    return e;
  };
  const refs = spec.continuity ?? { location: null, props: [], lighting: null };
  const location = get(refs.location, "location");
  const props = (refs.props ?? []).map((k) => get(k, "prop")).filter((e): e is ContinuityEntity => !!e);
  const lighting = get(refs.lighting, "lighting");
  const lookId = spec.wardrobe?.lookId ?? null;
  const look = lookId ? (looks.find((l) => l.id === lookId) ?? null) : null;
  if (lookId && !look && looks.length > 0) missing.push(`look ${lookId}`);
  return { location, props, lighting, look, missing };
}

/** True when the shot points at anything. */
export function hasContinuity(c: ShotContinuity): boolean {
  return !!(c.location || c.props.length || c.lighting || c.look);
}

const sentence = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t ? (/[.!?]$/.test(t) ? t : `${t}.`) : "";
};

/** One entity as the words a picture request carries: its description, then its constraints. Always the same string. */
export function canonicalWords(e: Pick<ContinuityEntity, "description" | "constraints">): string {
  return [sentence(e.description), sentence(e.constraints)].filter(Boolean).join(" ");
}

/**
 * The lines a shot's picture request carries for the entities it points at. Identical, word for word, in every shot
 * that points at the same entity — that is the continuity. Empty when the shot points at nothing with words.
 * `forPlate` = the picture is an empty place for a real performance to be put into: the place and the light go in;
 * a prop goes in only as part of the place (it is there to be seen), and the look does not (nobody is drawn).
 */
export function continuityLines(c: ShotContinuity, opts: { forPlate?: boolean } = {}): string[] {
  const out: string[] = [];
  if (c.location && canonicalWords(c.location)) out.push(`The place — the same place in every shot set there: ${canonicalWords(c.location)}`);
  for (const p of c.props) if (canonicalWords(p)) out.push(`${p.name} — the same object in every shot it is in: ${canonicalWords(p)}`);
  if (c.lighting && canonicalWords(c.lighting)) out.push(`The light: ${canonicalWords(c.lighting)}`);
  if (!opts.forPlate && c.look) out.push(`Wardrobe — ${c.look.name}${c.look.description?.trim() ? `: ${sentence(c.look.description)}` : "."}`);
  return out;
}

export type ContinuitySource = {
  /** The lines the picture request carries (continuityLines). */
  lines: string[];
  /** The approved picture of the shot's location: the place wherever a place picture is an input. */
  placeAssetId: string | null;
  /** The location whose picture that is. */
  placeOf: { key: string; name: string } | null;
  /** Said to the director before anything is generated: what the entities do and do not hold. */
  notes: string[];
};

/**
 * The canonical continuity source of one shot: the words every request carries and the picture that is the place.
 * The notes say plainly what is NOT held (a location with no approved picture, a prop picture the still model
 * cannot read, a reference the project no longer has).
 */
export function continuitySource(c: ShotContinuity, opts: { forPlate?: boolean } = {}): ContinuitySource {
  const notes: string[] = [];
  if (c.location && !c.location.approvedAssetId) notes.push(`${c.location.name} has no approved picture yet — its description holds the place, a picture does not.`);
  for (const p of c.props) if (p.approvedAssetId) notes.push(`${p.name}'s picture is its reference for the eye; the image model reads only its description.`);
  for (const k of c.missing) notes.push(`This shot points at ${k}, which this project does not have.`);
  return {
    lines: continuityLines(c, opts),
    placeAssetId: c.location?.approvedAssetId ?? null,
    placeOf: c.location?.approvedAssetId ? { key: c.location.key, name: c.location.name } : null,
    notes,
  };
}

/**
 * A shot's events with the lighting states they point at filled in: an event that switches to a lighting state and
 * says nothing else about the light takes the state's canonical description as its lighting phrase — so the strip,
 * the timed script and a split all say the same words every other use of that state says.
 */
export function withLightingStates<T extends ShotEvent>(events: readonly T[], index: EntityIndex): T[] {
  return events.map((e) => {
    if (!e.lightingState || e.lighting.trim()) return e;
    const state = index.get(e.lightingState);
    if (!state || state.kind !== "lighting" || !state.description) return e;
    return { ...e, lighting: state.description.replace(/\s+/g, " ").trim().slice(0, 140) };
  });
}

/** Which shots point at each entity (by key), in board order — "used by shots 13, 15, 18". */
export function entityUsage(shots: readonly { number: number; spec: Pick<ShotSpec, "continuity" | "events"> }[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const add = (key: string | null | undefined, n: number) => {
    if (!key) return;
    const list = out.get(key) ?? [];
    if (!list.includes(n)) list.push(n);
    out.set(key, list);
  };
  for (const s of shots) {
    add(s.spec.continuity?.location, s.number);
    for (const p of s.spec.continuity?.props ?? []) add(p, s.number);
    add(s.spec.continuity?.lighting, s.number);
    for (const e of s.spec.events ?? []) add(e.lightingState, s.number);
  }
  return out;
}

/** The picture request of an entity's own reference picture: the entity alone, from its canonical words. */
export function referencePrompt(e: Pick<ContinuityEntity, "kind" | "name" | "description" | "constraints">): string {
  const words = canonicalWords(e);
  if (!words) throw new Error(`${e.name} has no description to draw from — write one first.`);
  if (e.kind === "location") return `An empty set, photographed with nobody in it: no people, no figures, no faces. ${words} A wide, level establishing view that shows the whole place.`;
  if (e.kind === "prop") return `${words} The object alone, whole and in focus, on a plain dark surface, nothing else in the picture, no hands, no people.`;
  // an invented likeness, drawn once so every shot they are in is held to the same face and build; a real person's
  // likeness is never drawn from words (the controller refuses a preserved character before this is reached)
  // the description says who the person is AND where they appear in the video; the picture is the person only.
  // Seen live (THE_RIDER, 8 Oct 2026): fed the whole description, the model drew her scenes — fire, a security
  // monitor, on-screen camera labels — and the reference then carries those into every shot she is cast in.
  if (e.kind === "character")
    return `A casting reference picture of one person, standing alone and facing the camera, the whole figure in view, face clearly visible, even soft studio light, a plain uncluttered background. The person is described here; where the description tells what they do or where they appear in the video, that says who they are, not what to draw: ${words} Draw only the person: no place, vehicle, animal, screen, monitor, fire, crowd or event from the description, nobody else in the picture, no inset pictures, no on-screen text, labels or timestamps.`;
  throw new Error("A lighting state is a description shots are lit by — it has no picture of its own.");
}

/**
 * Why an entity's reference picture may not be drawn from its words, or null when it may. A real person's likeness
 * (the artist, or anyone set to keep their real identity) comes from their own photographs, never from a generator.
 */
export function entityPictureRefusal(e: Pick<ContinuityEntity, "kind" | "name" | "cast">): string | null {
  if (e.kind === "lighting") return "A lighting state is a description shots are lit by — it has no picture of its own.";
  if (e.kind !== "character") return null;
  if (e.cast?.artistId) return `${e.name} is linked to the artist record — their likeness comes from the artist's own photographs, not a drawing.`;
  if (e.cast?.identityMode === "preserve") return `${e.name} keeps a real person's identity — that comes from real photographs, not a drawing. Link the artist, or set them to recurring to draw an invented likeness.`;
  return null;
}

/** What an edit to an entity may change. The key is not here: shots point at it. */
export type EntityPatch = Partial<Pick<ContinuityEntity, "name" | "description" | "constraints" | "approvedAssetId" | "referenceAssetIds" | "archived">> & {
  /** Character only. Changing a cast member's role or identity mode is an edit like any other. */
  cast?: Partial<CastFacts>;
};

/** The entity's reference pictures with one more, without doubles; the first picture an entity gets is approved. */
export function withReference(e: Pick<ContinuityEntity, "approvedAssetId" | "referenceAssetIds">, assetId: string, approve = false): EntityPatch {
  const referenceAssetIds = e.referenceAssetIds.includes(assetId) ? e.referenceAssetIds : [...e.referenceAssetIds, assetId];
  return { referenceAssetIds, approvedAssetId: approve || !e.approvedAssetId ? assetId : e.approvedAssetId };
}
