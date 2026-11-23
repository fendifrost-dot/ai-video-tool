/**
 * Effects preview: the small copies post files of what it has built, and which of them is on screen at a moment of
 * the song (docs/design/EFFECTS_PREVIEW.md).
 *
 * A copy is one `project_assets` row whose `metadata_json.effects_preview` says which stretch of the SONG it is the
 * picture of. The players lay the newest copy over the board at that stretch and play the board everywhere else.
 * Pure module: no storage, no clock of its own.
 */

/** `metadata_json.effects_preview` of a preview copy, as filed. */
export type EffectsPreviewRecord = {
  /** A slug that names the stretch across versions ("storm_verse"). */
  section: string;
  /** Whole number from 1; the highest of a section is the one shown. */
  version: number;
  /** Seconds on the song clock. Frame 0 of the file is the picture at `songStart`. */
  songStart: number;
  songEnd: number;
  fps: number;
  frames: number | null;
  /** A name for people; the section slug when absent. */
  label: string | null;
  /** When post made the copy (ISO), when it said. */
  madeAt: string | null;
  /** What it was made from, carried for the record. */
  builtFrom: Record<string, unknown> | null;
};

/** A copy the player can use: the record, and where the file is. */
export type EffectsPreview = EffectsPreviewRecord & {
  assetId: string;
  bucket: string;
  path: string;
  createdAt: string;
};

/** One stretch of the song and the copy that is on screen for it. Spans never overlap. */
export type EffectsSpan = { start: number; end: number; preview: EffectsPreview };

const SECTION_RE = /^[a-z0-9][a-z0-9_]*$/;
/** Where a copy's file must be: the exports bucket, in an `effects_preview` folder. A record on any other file is not played. */
export const EFFECTS_BUCKET = "project-exports";
export const EFFECTS_FOLDER = "/effects_preview/";
/** The most sections the layer is built from (the newest). Real projects have a handful; the cap bounds a hostile or runaway set of rows. */
export const MAX_SECTIONS = 50;
/** A copy may be off its stated length by this many frames before it is called out (a muxer rounds the last one). */
export const FRAME_TOLERANCE = 1;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Read `metadata_json.effects_preview`. Null when it is absent or is not a usable record. */
export function parseEffectsPreview(meta: unknown): EffectsPreviewRecord | null {
  const r = (meta as { effects_preview?: unknown } | null)?.effects_preview as Record<string, unknown> | null | undefined;
  if (!r || typeof r !== "object") return null;
  const section = typeof r.section === "string" ? r.section : "";
  const version = num(r.version);
  const songStart = num(r.song_start);
  const songEnd = num(r.song_end);
  const fps = num(r.fps);
  if (!SECTION_RE.test(section)) return null;
  if (version == null || !Number.isInteger(version) || version < 1) return null;
  if (songStart == null || songEnd == null || songStart < 0 || songEnd <= songStart) return null;
  if (fps == null || fps <= 0) return null;
  const frames = num(r.frames);
  return {
    section,
    version,
    songStart,
    songEnd,
    fps,
    frames: frames != null && Number.isInteger(frames) && frames > 0 ? frames : null,
    label: typeof r.label === "string" && r.label.trim() ? r.label.trim() : null,
    madeAt: typeof r.made_at === "string" && Number.isFinite(Date.parse(r.made_at)) ? r.made_at : null,
    builtFrom: r.built_from && typeof r.built_from === "object" && !Array.isArray(r.built_from) ? (r.built_from as Record<string, unknown>) : null,
  };
}

/** Whether a row carries an `effects_preview` key at all (so a record that does not parse can be counted, not hidden). */
export function claimsEffectsPreview(meta: unknown): boolean {
  return (meta as { effects_preview?: unknown } | null)?.effects_preview != null;
}

type AssetLike = {
  id: string;
  bucket: string;
  path: string;
  isVideo: boolean;
  createdAt: string;
  approvalStatus?: string | null;
  effectsPreview?: EffectsPreviewRecord | null;
};

/** Whether a file is where a copy is filed: the exports bucket, an `effects_preview` folder, no path tricks. */
export function isEffectsPreviewFile(bucket: string, path: string): boolean {
  return bucket === EFFECTS_BUCKET && path.includes(EFFECTS_FOLDER) && !path.split("/").includes("..");
}

/** The project's usable copies: a video, with a record, filed where copies are filed, not rejected. */
export function effectsPreviewsOf(assets: Iterable<AssetLike>): EffectsPreview[] {
  const out: EffectsPreview[] = [];
  for (const a of assets) {
    if (!a.effectsPreview || !a.isVideo || a.approvalStatus === "rejected") continue;
    if (!isEffectsPreviewFile(a.bucket, a.path)) continue;
    out.push({ ...a.effectsPreview, assetId: a.id, bucket: a.bucket, path: a.path, createdAt: a.createdAt });
  }
  return out;
}

const madeMs = (p: EffectsPreview): number => {
  const made = p.madeAt ? Date.parse(p.madeAt) : NaN;
  if (Number.isFinite(made)) return made;
  const created = Date.parse(p.createdAt);
  return Number.isFinite(created) ? created : 0;
};

/** Newer first: by when it was made, then by when it was filed, then by id so the order never depends on the input's. */
function newerFirst(a: EffectsPreview, b: EffectsPreview): number {
  return madeMs(b) - madeMs(a) || Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0);
}

/** Per section, the copy that counts: the highest version; of two filings of that version, the newer. */
export function currentPreviews(previews: readonly EffectsPreview[]): EffectsPreview[] {
  const bySection = new Map<string, EffectsPreview>();
  for (const p of previews) {
    const held = bySection.get(p.section);
    if (!held || p.version > held.version || (p.version === held.version && newerFirst(p, held) < 0)) bySection.set(p.section, p);
  }
  return [...bySection.values()];
}

/**
 * The stretches of the song that have a copy, in song order, never overlapping. Where two sections overlap the one
 * made later is on top; the other shows only where it is not covered. A sliver shorter than a frame is dropped.
 */
export function effectsLayer(previews: readonly EffectsPreview[]): EffectsSpan[] {
  const stack = currentPreviews(previews).sort(newerFirst).slice(0, MAX_SECTIONS);
  const taken: EffectsSpan[] = [];
  for (const p of stack) {
    const minLen = 1 / p.fps;
    let free: [number, number][] = [[p.songStart, p.songEnd]];
    for (const t of taken) {
      free = free.flatMap(([a, b]): [number, number][] => {
        if (t.end <= a || t.start >= b) return [[a, b]];
        const parts: [number, number][] = [];
        if (t.start > a) parts.push([a, t.start]);
        if (t.end < b) parts.push([t.end, b]);
        return parts;
      });
    }
    for (const [a, b] of free) if (b - a >= minLen - 1e-9) taken.push({ start: a, end: b, preview: p });
  }
  return taken.sort((x, y) => x.start - y.start);
}

/** The span on screen at song time `t` (start inclusive, end exclusive), or null: the board plays. */
export function effectsAt(spans: readonly EffectsSpan[], t: number): EffectsSpan | null {
  for (const s of spans) {
    if (t < s.start - 1e-6) return null;
    if (t < s.end - 1e-6) return s;
  }
  return null;
}

/**
 * Where a copy's own playhead belongs at song time `t`: `t - songStart`, held inside the file. `fileSeconds` is the
 * element's real length when the player knows it; a copy that is shorter than it says holds its last frame.
 */
export function effectsMediaTime(preview: Pick<EffectsPreviewRecord, "songStart" | "songEnd">, t: number, fileSeconds: number | null = null): { at: number; hold: "ran_out" | null } {
  const stated = preview.songEnd - preview.songStart;
  const real = fileSeconds != null && Number.isFinite(fileSeconds) && fileSeconds > 0 ? fileSeconds : null;
  const length = real != null ? Math.min(stated, real) : stated;
  const wanted = Math.max(0, t - preview.songStart);
  const last = Math.max(0, length - 0.05);
  return wanted >= length - 0.04 ? { at: last, hold: "ran_out" } : { at: wanted, hold: null };
}

/** The spans cut to a window of the song (a section of the board being looked at on its own). */
export function clipSpans(spans: readonly EffectsSpan[], start: number, end: number): EffectsSpan[] {
  return spans.flatMap((s) => {
    const a = Math.max(s.start, start);
    const b = Math.min(s.end, end);
    return b > a + 1e-6 ? [{ ...s, start: a, end: b }] : [];
  });
}

/** How much of a window of the song has a copy, in seconds and as a share of the window. */
export function effectsCoverage(spans: readonly EffectsSpan[], start: number, end: number): { seconds: number; share: number } {
  const window = Math.max(0, end - start);
  const seconds = clipSpans(spans, start, end).reduce((sum, s) => sum + (s.end - s.start), 0);
  return { seconds, share: window > 0 ? seconds / window : 0 };
}

/** What is wrong with a record as filed, in words. Empty = nothing. The maker script prints the same checks. */
export function effectsPreviewIssues(p: EffectsPreviewRecord, fileSeconds: number | null = null): string[] {
  const out: string[] = [];
  const stated = p.songEnd - p.songStart;
  const expected = Math.round(stated * p.fps);
  if (p.frames != null && Math.abs(p.frames - expected) > FRAME_TOLERANCE) out.push(`${p.frames} frames filed for a ${stated.toFixed(3)} s stretch at ${p.fps} fps (${expected} expected)`);
  if (fileSeconds != null && Number.isFinite(fileSeconds) && Math.abs(fileSeconds - stated) > (FRAME_TOLERANCE + 0.5) / p.fps) out.push(`the file is ${fileSeconds.toFixed(3)} s long, the record says ${stated.toFixed(3)} s`);
  return out;
}

/** "Storm verse · v3": what the strip and the badge call a copy. */
export function effectsLabel(p: Pick<EffectsPreviewRecord, "section" | "version" | "label">): string {
  return `${p.label ?? p.section.replace(/_/g, " ")} · v${p.version}`;
}
