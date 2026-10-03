/**
 * The storyboard box — one permanent record per box (Fendi, 2026-10-03).
 *
 * A box IS a `shots` row. Its identity is the row id and its stable text key (`spec_key`); neither is derived from
 * where the box sits on the board, so regenerating, splitting, merging or re-ordering never moves an edit or a piece
 * of footage onto another box. The row holds three things:
 *
 *   generated_json   what the generator last wrote for the box (a ShotSpec)
 *   override_json    only what the director changed (a ShotOverride, plus the box's type)
 *   spec_json        the two resolved — the one thing every downstream consumer reads
 *
 * and its window on the SONG clock (timestamp_start / timestamp_end). The window is the authority for time: the
 * resolved spec's timeline is always read from the row, never from inside the JSON.
 *
 * Pure module: no react, no supabase, no project knowledge. Everything here is a plan (what to write); the effects
 * live in src/lib/queries/storyboard.ts.
 */
import {
  SHOT_TYPES,
  parseShotSpec,
  safeParseShotSpec,
  shotRowToShotSpec,
  shotSpecToShotRow,
  type ShotKind,
  type ShotSpec,
  type ShotTypeLiteral,
} from "@/lib/treatment/shotSpec";
import { applyShotOverride, isEmptyOverride, type ShotOverride } from "@/lib/treatment/overrides";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** What the director changed on a box. A ShotOverride (without the key it used to hang off) plus the box's type. */
export type BoxOverride = Omit<ShotOverride, "specId"> & {
  /** "performance" (his real take plays here) or an insert kind. Null = the generated type. */
  shotType?: string | null;
  /**
   * The fields the DIRECTOR set by hand (as opposed to fields a per-box rewrite filled in). A rewrite replaces what a
   * rewrite wrote and keeps what he set; only these are told to the model as already decided.
   */
  manual?: OverrideField[] | null;
};

export const OVERRIDE_FIELDS = ["direction", "frame", "cameraMotion", "framing", "transitionIn", "requiredElements", "notes", "shotType"] as const;
export type OverrideField = (typeof OVERRIDE_FIELDS)[number];

export type BoxHistoryEntry = {
  at: string;
  /** What produced the entry: a regenerate from the treatment, a per-box rewrite, a split, a merge, a reset. */
  event: "treatment" | "rewrite" | "edit" | "reset" | "split" | "merge" | "migrated";
  /** The resolved scene before the change, so an earlier version can be read back. */
  purpose?: string;
  direction?: string;
  frame?: string;
  note?: string;
};

/** The columns of a `shots` row this module reads. */
export type BoxRow = {
  id: string;
  project_id: string;
  shot_number: number;
  song_section: string | null;
  timestamp_start: number | string | null;
  timestamp_end: number | string | null;
  shot_type?: string | null;
  scene_description?: string | null;
  notes?: string | null;
  spec_key: string | null;
  generated_json: unknown;
  override_json: unknown;
  spec_json?: unknown;
  locked: boolean | null;
  box_origin: string | null;
  history_json: unknown;
  created_at?: string;
  updated_at?: string;
};

export type StoryboardBox = {
  /** The permanent record id. */
  id: string;
  /** Stable text key: names files, jobs and the batch dialect's shot id. Never reassigned. */
  key: string;
  projectId: string;
  shotNumber: number;
  /** The box's window on the song clock, seconds. */
  start: number;
  end: number;
  section: string | null;
  /** Whole-board generation skips a locked box. */
  locked: boolean;
  origin: string | null;
  generated: ShotSpec;
  override: BoxOverride | null;
  /** generated + override, id = key, timeline = the row's window. */
  spec: ShotSpec;
  history: BoxHistoryEntry[];
  updatedAt: string;
};

export const HISTORY_MAX = 20;
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? (n as number) : 0;
};

// ---------------------------------------------------------------------------
// Resolve
// ---------------------------------------------------------------------------

function kindFor(shotType: ShotTypeLiteral): ShotKind {
  return shotType === "performance" ? "performance" : shotType === "b_roll" ? "broll" : "generated";
}

function asShotType(v: unknown): ShotTypeLiteral | null {
  return typeof v === "string" && (SHOT_TYPES as readonly string[]).includes(v) ? (v as ShotTypeLiteral) : null;
}

/** True when the override states nothing at all (so the box reads as generated). */
export function isEmptyBoxOverride(o: BoxOverride | null | undefined): boolean {
  if (!o) return true;
  return isEmptyOverride({ ...o, specId: "" } as ShotOverride) && !asShotType(o.shotType);
}

/** A stored override_json value → BoxOverride (null when it holds nothing usable). */
export function parseBoxOverride(value: unknown): BoxOverride | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x : null);
  const o: BoxOverride = {
    direction: str(v.direction),
    frame: str(v.frame),
    cameraMotion: (v.cameraMotion && typeof v.cameraMotion === "object" ? v.cameraMotion : null) as BoxOverride["cameraMotion"],
    framing: str(v.framing),
    transitionIn: (v.transitionIn && typeof v.transitionIn === "object" ? v.transitionIn : null) as BoxOverride["transitionIn"],
    requiredElements: Array.isArray(v.requiredElements) ? (v.requiredElements.filter((x) => typeof x === "string") as string[]) : null,
    notes: str(v.notes),
    shotType: asShotType(v.shotType),
    manual: Array.isArray(v.manual) ? (v.manual.filter((f) => (OVERRIDE_FIELDS as readonly unknown[]).includes(f)) as OverrideField[]) : null,
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : undefined,
  };
  return isEmptyBoxOverride(o) ? null : o;
}

/**
 * The one resolve: generated + override, on the box's own key and window.
 * Everything that reads a box — the card, the compiler, Review, the export — reads this.
 */
export function resolveSpec(
  generated: ShotSpec,
  override: BoxOverride | null | undefined,
  window: { start: number; end: number },
  key: string,
): ShotSpec {
  const base: ShotSpec = { ...generated, id: key, timeline: { start: window.start, end: Math.max(window.start, window.end) } };
  if (isEmptyBoxOverride(override) || !override) return base;
  let spec = applyShotOverride(base, { ...override, specId: key } as ShotOverride);
  const shotType = asShotType(override.shotType);
  if (shotType && shotType !== spec.shotType) {
    spec = { ...spec, shotType, kind: kindFor(shotType), origin: "override" };
  }
  return spec;
}

function parseHistory(value: unknown): BoxHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((e): e is BoxHistoryEntry => !!e && typeof e === "object" && typeof (e as { at?: unknown }).at === "string");
}

/** A `shots` row → the box it is. Null for a row that is not on the storyboard (no spec_key). */
export function boxFromRow(row: BoxRow): StoryboardBox | null {
  if (!row.spec_key) return null;
  const start = num(row.timestamp_start);
  const end = Math.max(start, num(row.timestamp_end));
  // A box whose generated_json cannot be read is still a box: fall back to the row's own text columns rather than
  // dropping it from the board (it holds a window, and maybe footage).
  const generated =
    safeParseShotSpec(
      row.generated_json && typeof row.generated_json === "object"
        ? { ...(row.generated_json as object), id: row.spec_key, timeline: { start, end } }
        : null,
    ) ??
    shotRowToShotSpec({
      id: row.spec_key,
      timestamp_start: start,
      timestamp_end: end,
      shot_type: (row.shot_type ?? null) as never,
      scene_description: row.scene_description ?? null,
    } as never);
  const override = parseBoxOverride(row.override_json);
  return {
    id: row.id,
    key: row.spec_key,
    projectId: row.project_id,
    shotNumber: row.shot_number,
    start,
    end,
    section: row.song_section,
    locked: !!row.locked,
    origin: row.box_origin,
    generated,
    override,
    spec: resolveSpec(generated, override, { start, end }, row.spec_key),
    history: parseHistory(row.history_json),
    updatedAt: row.updated_at ?? "",
  };
}

/** Boxes in the order the song plays them. Position is DERIVED from this; it is never an identity. */
export function orderBoxes<T extends { start: number; key: string }>(boxes: readonly T[]): T[] {
  return [...boxes].sort((a, b) => (a.start !== b.start ? a.start - b.start : a.key.localeCompare(b.key)));
}

export function boxesFromRows(rows: readonly BoxRow[]): StoryboardBox[] {
  return orderBoxes(rows.map(boxFromRow).filter((b): b is StoryboardBox => !!b));
}

// ---------------------------------------------------------------------------
// Write plans
// ---------------------------------------------------------------------------

/** The columns written for a box. One shape for every write, so the JSON and the legacy text columns cannot drift. */
export type BoxWrite = {
  spec_key: string;
  timestamp_start: number;
  timestamp_end: number;
  song_section: string | null;
  shot_type: string;
  scene_description: string | null;
  camera_direction: string | null;
  lighting: string | null;
  wardrobe: string | null;
  environment: string | null;
  notes: string | null;
  generated_json: ShotSpec;
  override_json: BoxOverride | null;
  spec_json: ShotSpec;
  locked: boolean;
  box_origin: string | null;
  history_json: BoxHistoryEntry[];
};

export function withHistory(history: readonly BoxHistoryEntry[], entry: BoxHistoryEntry): BoxHistoryEntry[] {
  return [...history, entry].slice(-HISTORY_MAX);
}

function snapshot(spec: ShotSpec, event: BoxHistoryEntry["event"], at: string, note?: string): BoxHistoryEntry {
  return {
    at,
    event,
    purpose: spec.purpose,
    direction: spec.performanceDirection || undefined,
    frame: spec.openingFrame || undefined,
    ...(note ? { note } : {}),
  };
}

/** Everything a row needs to say about one box. */
export function boxWrite(input: {
  key: string;
  start: number;
  end: number;
  section: string | null;
  generated: ShotSpec;
  override: BoxOverride | null;
  locked: boolean;
  origin: string | null;
  history: BoxHistoryEntry[];
}): BoxWrite {
  const start = round2(input.start);
  const end = round2(Math.max(input.start, input.end));
  const override = isEmptyBoxOverride(input.override) ? null : input.override;
  const generated = parseShotSpec({ ...input.generated, id: input.key, timeline: { start, end } });
  const spec = resolveSpec(generated, override, { start, end }, input.key);
  const row = shotSpecToShotRow(spec);
  return {
    spec_key: input.key,
    timestamp_start: start,
    timestamp_end: end,
    song_section: input.section,
    shot_type: (row.shot_type as string) ?? "b_roll",
    scene_description: row.scene_description ?? null,
    camera_direction: row.camera_direction ?? null,
    lighting: row.lighting ?? null,
    wardrobe: row.wardrobe ?? null,
    environment: row.environment ?? null,
    // The legacy shot-list pages read `notes`; the key stays findable there for anything that still greps for it.
    notes: [`TKEY:${input.key}`, spec.performanceDirection].filter(Boolean).join("\n"),
    generated_json: generated,
    override_json: override,
    spec_json: spec,
    locked: input.locked,
    box_origin: input.origin,
    history_json: input.history,
  };
}

/** A box as it stands → its write (used after any in-place change). */
export function writeOf(box: StoryboardBox, patch: Partial<Pick<StoryboardBox, "start" | "end" | "section" | "generated" | "override" | "locked" | "origin" | "history">> = {}): BoxWrite {
  return boxWrite({
    key: box.key,
    start: patch.start ?? box.start,
    end: patch.end ?? box.end,
    section: patch.section !== undefined ? patch.section : box.section,
    generated: patch.generated ?? box.generated,
    override: patch.override !== undefined ? patch.override : box.override,
    locked: patch.locked ?? box.locked,
    origin: patch.origin !== undefined ? patch.origin : box.origin,
    history: patch.history ?? box.history,
  });
}

// --- materialise: treatment clips (+ old overrides) → rows ------------------

export type ExistingShotRow = { id: string; spec_key: string | null; notes: string | null; shot_number: number };

export type MaterializePlan = {
  /** Rows that already exist for a key (a box, or a legacy "Commit to shot list" row carrying TKEY:<key>). */
  updates: { id: string; write: BoxWrite }[];
  /** Keys with no row yet. shot_number is assigned by the writer (max + 1…): it is a label, not an identity. */
  inserts: BoxWrite[];
};

/** The key a legacy committed row was written for (`TKEY:c006` in its notes), if any. */
export function legacyKeyOf(notes: string | null | undefined): string | null {
  const m = /(?:^|\n)TKEY:([A-Za-z0-9_.-]+)/.exec(notes ?? "");
  return m ? m[1] : null;
}

/**
 * Turn a generated treatment into box records, carrying every saved edit across.
 *
 * `specs` are the generator's specs for the board (already through the coverage planner); `overrides` are the
 * director's saved edits keyed by the same keys (the old shot_overrides rows); `sections` is the section each key
 * sits in. A key that already has a row is updated IN PLACE — its id, and so everything attached to it, is kept.
 */
export function planMaterialize(input: {
  specs: readonly ShotSpec[];
  overrides?: Record<string, ShotOverride | BoxOverride | null | undefined> | null;
  sections?: Record<string, string | null | undefined>;
  existing: readonly ExistingShotRow[];
  at: string;
  origin?: string;
}): MaterializePlan {
  const byKey = new Map<string, ExistingShotRow>();
  for (const r of input.existing) if (r.spec_key) byKey.set(r.spec_key, r);
  for (const r of input.existing) {
    if (r.spec_key) continue;
    const k = legacyKeyOf(r.notes);
    if (k && !byKey.has(k)) byKey.set(k, r);
  }
  const plan: MaterializePlan = { updates: [], inserts: [] };
  for (const spec of input.specs) {
    const raw = input.overrides?.[spec.id] ?? null;
    const override = raw ? parseBoxOverride(raw) : null;
    const write = boxWrite({
      key: spec.id,
      start: spec.timeline.start,
      end: spec.timeline.end,
      section: input.sections?.[spec.id] ?? null,
      generated: spec,
      override,
      // A box the director already edited is his: the next whole-board generation must not rewrite it.
      locked: !!override,
      origin: input.origin ?? "treatment",
      history: [{ at: input.at, event: "migrated", note: override ? "carried a saved edit across" : undefined }],
    });
    const row = byKey.get(spec.id);
    if (row) plan.updates.push({ id: row.id, write });
    else plan.inserts.push(write);
  }
  return plan;
}

// --- regenerate from the treatment -------------------------------------------

/**
 * A new generated spec for an existing box. The box keeps its id, key, window, footage and lock; only what the
 * generator wrote changes, and what it replaced is kept in the box's history. A locked box is never passed here —
 * `unlockedForGeneration` decides.
 */
export function applyGenerated(box: StoryboardBox, generated: ShotSpec, at: string, section?: string | null): BoxWrite {
  return writeOf(box, {
    generated,
    section: section !== undefined ? section : box.section,
    history: withHistory(box.history, snapshot(box.spec, "treatment", at)),
  });
}

/** The boxes a whole-board generation may rewrite: not locked, not edited, and holding no footage. */
export function unlockedForGeneration(boxes: readonly StoryboardBox[], boxIdsWithMedia: ReadonlySet<string>): StoryboardBox[] {
  return boxes.filter((b) => !b.locked && !b.override && !boxIdsWithMedia.has(b.id));
}

// --- the director's edit ------------------------------------------------------

/** Save (or clear) the director's edit of one box. An edit locks the box; clearing it hands the box back. */
export function applyOverride(box: StoryboardBox, override: BoxOverride | null, at: string, event: "edit" | "rewrite" | "reset" = "edit"): BoxWrite {
  const next = isEmptyBoxOverride(override) ? null : { ...override!, updatedAt: at };
  return writeOf(box, {
    override: next,
    locked: next ? true : false,
    history: withHistory(box.history, snapshot(box.spec, next ? event : "reset", at)),
  });
}

// --- split / merge -------------------------------------------------------------

/** A new key that no box on the project has. Readable (it descends from its parent) but never positional. */
export function nextKey(existing: ReadonlySet<string> | readonly string[], parentKey: string): string {
  const taken = existing instanceof Set ? existing : new Set(existing as readonly string[]);
  const stem = parentKey.replace(/_\d+$/, "");
  for (let n = 2; n < 10_000; n++) {
    const k = `${stem}_${n}`;
    if (!taken.has(k)) return k;
  }
  throw new Error("could not find a free box key");
}

export const MIN_BOX_SECONDS = 0.5;

export type SplitPlan = { first: BoxWrite; second: BoxWrite };

/**
 * Split one box at a song time into two permanent records that cover exactly the original window. The first keeps
 * the original record (id, key, footage); the second is a new record with a new key and a copy of the scene, so
 * neither half is ever empty or overlapping.
 */
export function planSplit(box: StoryboardBox, atSeconds: number, existingKeys: readonly string[], at: string): SplitPlan {
  const cut = round2(atSeconds);
  if (!(cut - box.start >= MIN_BOX_SECONDS && box.end - cut >= MIN_BOX_SECONDS)) {
    throw new Error(`a split leaves both halves at least ${MIN_BOX_SECONDS} s — choose a point inside the box`);
  }
  const key2 = nextKey(existingKeys, box.key);
  const note = `split at ${cut.toFixed(2)} s`;
  return {
    first: writeOf(box, { end: cut, history: withHistory(box.history, snapshot(box.spec, "split", at, note)) }),
    second: boxWrite({
      key: key2,
      start: cut,
      end: box.end,
      section: box.section,
      generated: box.generated,
      override: box.override,
      locked: box.locked,
      origin: "split",
      history: [{ at, event: "split", note: `${note} from ${box.key}` }],
    }),
  };
}

/**
 * Merge a box with the one that follows it. The earlier record survives and takes the whole window; the later
 * record's scene is written into the survivor's history so nothing it said is lost. The caller moves the later
 * record's footage onto the survivor before removing that record.
 */
export function planMerge(box: StoryboardBox, next: StoryboardBox, at: string): BoxWrite {
  if (Math.abs(next.start - box.end) > 0.02) throw new Error("only the box that follows directly can be merged in");
  return writeOf(box, {
    end: next.end,
    locked: box.locked || next.locked,
    history: withHistory(box.history, snapshot(next.spec, "merge", at, `merged ${next.key} (${next.start.toFixed(2)}–${next.end.toFixed(2)} s) into ${box.key}`)),
  });
}

// ---------------------------------------------------------------------------
// Who wrote which field
// ---------------------------------------------------------------------------

function stated(o: BoxOverride | null | undefined, f: OverrideField): boolean {
  if (!o) return false;
  switch (f) {
    case "direction":
      return !!o.direction?.trim();
    case "frame":
      return !!o.frame?.trim();
    case "cameraMotion":
      return !!(o.cameraMotion?.type || o.cameraMotion?.description?.trim());
    case "framing":
      return !!o.framing;
    case "transitionIn":
      return !!(o.transitionIn?.preset || o.transitionIn?.type);
    case "requiredElements":
      return !!o.requiredElements?.length;
    case "notes":
      return !!o.notes?.trim();
    case "shotType":
      return !!asShotType(o.shotType);
  }
}

/**
 * The fields the director set by hand. An override written before `manual` existed (the old shot_overrides rows) has
 * no record of who wrote what; every field it states is treated as his, which is the safe reading.
 */
export function directorSet(o: BoxOverride | null | undefined): Set<OverrideField> {
  if (!o) return new Set();
  if (!o.manual) return new Set(OVERRIDE_FIELDS.filter((f) => stated(o, f)));
  return new Set(o.manual.filter((f) => stated(o, f)));
}

/**
 * The override after the director saves the editor: every field whose value he changed becomes his; a field he left
 * exactly as a rewrite wrote it stays the rewrite's; a field he emptied is no longer stated at all.
 */
export function editedOverride(prev: BoxOverride | null, next: BoxOverride): BoxOverride {
  const his = directorSet(prev);
  const manual = OVERRIDE_FIELDS.filter((f) => {
    if (!stated(next, f)) return false;
    const same = JSON.stringify((prev as Record<string, unknown> | null)?.[f] ?? null) === JSON.stringify((next as Record<string, unknown>)[f] ?? null);
    return same ? his.has(f) : true;
  });
  return { ...next, manual };
}

/**
 * The override after a per-box rewrite: what the rewrite returned replaces the fields the director did not set; the
 * fields he set by hand are kept exactly.
 */
export function rewrittenOverride(prev: BoxOverride | null, written: Partial<BoxOverride>): BoxOverride {
  const his = directorSet(prev);
  const take = <K extends keyof BoxOverride>(k: K & OverrideField): BoxOverride[K] | null =>
    his.has(k) ? ((prev?.[k] ?? null) as BoxOverride[K] | null) : ((written[k] ?? null) as BoxOverride[K] | null);
  return {
    direction: take("direction"),
    frame: take("frame"),
    cameraMotion: take("cameraMotion"),
    framing: take("framing"),
    transitionIn: take("transitionIn"),
    requiredElements: take("requiredElements"),
    notes: prev?.notes ?? null,
    shotType: prev?.shotType ?? null,
    manual: [...his],
  };
}

// ---------------------------------------------------------------------------
// What a per-box rewrite is told
// ---------------------------------------------------------------------------

/** One line about a box — what its neighbours are told so two boxes in a row do not stage the same picture. */
export function oneLine(spec: ShotSpec, max = 160): string {
  const text = (spec.origin === "override" && spec.performanceDirection ? spec.performanceDirection : spec.purpose).replace(/\s+/g, " ").trim();
  const kind = spec.shotType === "performance" ? "performance" : "insert";
  return `${kind}: ${text.length > max ? `${text.slice(0, max - 1)}…` : text}`;
}

export function neighbourSummaries(boxes: readonly StoryboardBox[], id: string): { before: string | null; after: string | null } {
  const ordered = orderBoxes(boxes);
  const i = ordered.findIndex((b) => b.id === id);
  return {
    before: i > 0 ? oneLine(ordered[i - 1].spec) : null,
    after: i >= 0 && i < ordered.length - 1 ? oneLine(ordered[i + 1].spec) : null,
  };
}

/**
 * The locked facts a rewrite is given alongside the treatment. STRUCTURED MACHINE CONTEXT, not prose: the treatment
 * tells the story; this stops the rewrite drifting off what is already decided (the window, the take that plays
 * here, the footage already on the box, the look, the fields the director set).
 */
export type BoxMachineContext = {
  song_window_seconds: [number, number];
  section: string | null;
  box_type: string;
  performance_source: { take: string; source_range_seconds: [number, number] } | null;
  assigned_media: { role: string; name: string; selected: boolean }[];
  look: { name: string; description: string } | null;
  locked_by_director: { framing?: string; camera_move?: string; must_be_in_frame?: string[] };
  constraints: string[];
};

export function machineContext(input: {
  box: StoryboardBox;
  performance?: { takeName: string; range: { start: number; end: number } } | null;
  media?: { role: string; name: string; selected: boolean }[];
  look?: { name?: string | null; description?: string | null } | null;
  constraints?: (string | null | undefined)[];
}): BoxMachineContext {
  const { box } = input;
  const o = box.override;
  const his = directorSet(o);
  const locked: BoxMachineContext["locked_by_director"] = {};
  if (o?.framing && his.has("framing")) locked.framing = o.framing;
  if (his.has("cameraMotion") && (o?.cameraMotion?.type || o?.cameraMotion?.description))
    locked.camera_move = [o.cameraMotion?.type, o.cameraMotion?.description].filter(Boolean).join(" — ");
  if (o?.requiredElements?.length && his.has("requiredElements")) locked.must_be_in_frame = o.requiredElements;
  const lookName = (input.look?.name ?? box.spec.wardrobe.name ?? "").trim();
  const lookDescription = (input.look?.description ?? box.spec.wardrobe.description ?? "").trim();
  return {
    song_window_seconds: [round2(box.start), round2(box.end)],
    section: box.section,
    box_type: box.spec.shotType,
    performance_source: input.performance
      ? { take: input.performance.takeName, source_range_seconds: [round2(input.performance.range.start), round2(input.performance.range.end)] }
      : null,
    assigned_media: input.media ?? [],
    look: lookName || lookDescription ? { name: lookName, description: lookDescription } : null,
    locked_by_director: locked,
    constraints: (input.constraints ?? []).map((c) => (c ?? "").trim()).filter(Boolean),
  };
}
