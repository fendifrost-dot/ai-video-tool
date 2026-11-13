// Versioned production documents stored as project_assets. Not an EDL.
// edit_sequences remains the cut. These three are the shot list, the beat grid, and the rules QC reads.

export const FORMAT_VERSION = 1;
export const FORMAT_SHOT_LIST = "avt.shot_list";
export const FORMAT_BEAT_GRID = "avt.beat_grid";
export const FORMAT_PROJECT_RULES = "avt.project_rules";

export const SHOT_SUBJECTS = ["fendi_performance", "ai_broll", "no_fendi"] as const;
export type ShotSubject = (typeof SHOT_SUBJECTS)[number];
export const SHOT_STATUSES = ["open", "review", "approved", "locked"] as const;
export type ShotStatus = (typeof SHOT_STATUSES)[number];

/** Review pictures are this size. A rules file that asks for anything else is rejected. */
export const REVIEW_PREVIEW = { width: 1080, height: 1920, sar: "1:1" } as const;

export type ShotSlot = {
  slot: string;
  length_frames: number;
  subject: ShotSubject;
  wardrobe_swap: boolean;
  rules: string[];
  status: ShotStatus;
  approver: string | null;
};

export type ShotListDoc = {
  format: typeof FORMAT_SHOT_LIST;
  format_version: number;
  project_id: string;
  slots: ShotSlot[];
};

export type Beat = { frame: number; downbeat: boolean };
export type BeatSection = { name: string; in_frame: number; out_frame: number };
export type BeatGridDoc = {
  format: typeof FORMAT_BEAT_GRID;
  format_version: number;
  song_asset_id: string;
  fps: number;
  bpm: number;
  beats: Beat[];
  sections: BeatSection[];
};

export type BlackWindow = { in_frame: number; out_frame: number };
export type ProjectRulesDoc = {
  format: typeof FORMAT_PROJECT_RULES;
  format_version: number;
  project_id: string;
  face: "real_pixels_only";
  mouth: "no_alteration";
  likeness: "no_generated_likeness";
  preview: { width: 1080; height: 1920; sar: "1:1" };
  locked_looks: string[];
  plates: { id: string; asset_id: string }[];
  allowed_black_windows: BlackWindow[];
};

export type FormatResult<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rec(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function fail(error: string): FormatResult<never> {
  return { ok: false, error };
}

export function parseShotList(raw: unknown): FormatResult<ShotListDoc> {
  const doc = rec(raw);
  if (!doc) return fail("shot list must be an object");
  if (doc.format !== FORMAT_SHOT_LIST) return fail(`format must be ${FORMAT_SHOT_LIST}`);
  if (doc.format_version !== FORMAT_VERSION) return fail(`format_version must be ${FORMAT_VERSION}`);
  if (typeof doc.project_id !== "string" || !UUID.test(doc.project_id)) return fail("project_id must be a uuid");
  if (!Array.isArray(doc.slots) || doc.slots.length === 0) return fail("slots must be a non-empty array");
  const slots: ShotSlot[] = [];
  const seen = new Set<string>();
  for (const item of doc.slots) {
    const row = rec(item);
    if (!row) return fail("each slot must be an object");
    if (typeof row.slot !== "string" || row.slot.length === 0 || row.slot.length > 80) return fail("slot name is required");
    if (seen.has(row.slot)) return fail(`duplicate slot ${row.slot}`);
    seen.add(row.slot);
    if (typeof row.length_frames !== "number" || !Number.isInteger(row.length_frames) || row.length_frames <= 0) {
      return fail(`${row.slot} length_frames must be a positive integer`);
    }
    if (typeof row.subject !== "string" || !(SHOT_SUBJECTS as readonly string[]).includes(row.subject)) {
      return fail(`${row.slot} subject must be ${SHOT_SUBJECTS.join(", ")}`);
    }
    if (typeof row.wardrobe_swap !== "boolean") return fail(`${row.slot} wardrobe_swap must be boolean`);
    if (!Array.isArray(row.rules) || row.rules.some((r) => typeof r !== "string" || r.length === 0 || r.length > 80)) {
      return fail(`${row.slot} rules must be short strings`);
    }
    if (typeof row.status !== "string" || !(SHOT_STATUSES as readonly string[]).includes(row.status)) {
      return fail(`${row.slot} status must be ${SHOT_STATUSES.join(", ")}`);
    }
    if (row.approver !== null && typeof row.approver !== "string") return fail(`${row.slot} approver must be a string or null`);
    slots.push({
      slot: row.slot,
      length_frames: row.length_frames,
      subject: row.subject as ShotSubject,
      wardrobe_swap: row.wardrobe_swap,
      rules: row.rules as string[],
      status: row.status as ShotStatus,
      approver: typeof row.approver === "string" ? row.approver : null,
    });
  }
  return { ok: true, value: { format: FORMAT_SHOT_LIST, format_version: FORMAT_VERSION, project_id: doc.project_id, slots } };
}

export function parseBeatGrid(raw: unknown): FormatResult<BeatGridDoc> {
  const doc = rec(raw);
  if (!doc) return fail("beat grid must be an object");
  if (doc.format !== FORMAT_BEAT_GRID) return fail(`format must be ${FORMAT_BEAT_GRID}`);
  if (doc.format_version !== FORMAT_VERSION) return fail(`format_version must be ${FORMAT_VERSION}`);
  if (typeof doc.song_asset_id !== "string" || !UUID.test(doc.song_asset_id)) return fail("song_asset_id must be a uuid");
  if (typeof doc.fps !== "number" || !(doc.fps > 0) || doc.fps > 120) return fail("fps must be between 0 and 120");
  if (typeof doc.bpm !== "number" || !(doc.bpm > 0) || doc.bpm > 400) return fail("bpm must be between 0 and 400");
  if (!Array.isArray(doc.beats) || doc.beats.length === 0) return fail("beats must be a non-empty array");
  const beats: Beat[] = [];
  let prev = -1;
  for (const item of doc.beats) {
    const row = rec(item);
    if (!row) return fail("each beat must be an object");
    if (typeof row.frame !== "number" || !Number.isInteger(row.frame) || row.frame < 0) return fail("beat frame must be a non-negative integer");
    if (row.frame <= prev) return fail("beats must be strictly increasing");
    prev = row.frame;
    if (typeof row.downbeat !== "boolean") return fail("downbeat must be boolean");
    beats.push({ frame: row.frame, downbeat: row.downbeat });
  }
  if (!beats.some((b) => b.downbeat)) return fail("a beat grid needs at least one downbeat");
  if (!Array.isArray(doc.sections)) return fail("sections must be an array");
  const sections: BeatSection[] = [];
  for (const item of doc.sections) {
    const row = rec(item);
    if (!row) return fail("each section must be an object");
    if (typeof row.name !== "string" || row.name.length === 0) return fail("section name is required");
    if (typeof row.in_frame !== "number" || typeof row.out_frame !== "number" || !Number.isInteger(row.in_frame) || !Number.isInteger(row.out_frame)) {
      return fail("section frames must be integers");
    }
    if (row.out_frame <= row.in_frame || row.in_frame < 0) return fail(`section ${row.name} has a bad frame range`);
    sections.push({ name: row.name, in_frame: row.in_frame, out_frame: row.out_frame });
  }
  return {
    ok: true,
    value: {
      format: FORMAT_BEAT_GRID,
      format_version: FORMAT_VERSION,
      song_asset_id: doc.song_asset_id,
      fps: doc.fps,
      bpm: doc.bpm,
      beats,
      sections,
    },
  };
}

export function parseProjectRules(raw: unknown): FormatResult<ProjectRulesDoc> {
  const doc = rec(raw);
  if (!doc) return fail("rules must be an object");
  if (doc.format !== FORMAT_PROJECT_RULES) return fail(`format must be ${FORMAT_PROJECT_RULES}`);
  if (doc.format_version !== FORMAT_VERSION) return fail(`format_version must be ${FORMAT_VERSION}`);
  if (typeof doc.project_id !== "string" || !UUID.test(doc.project_id)) return fail("project_id must be a uuid");
  if (doc.face !== "real_pixels_only") return fail("face must be real_pixels_only");
  if (doc.mouth !== "no_alteration") return fail("mouth must be no_alteration");
  if (doc.likeness !== "no_generated_likeness") return fail("likeness must be no_generated_likeness");
  const preview = rec(doc.preview);
  if (!preview || preview.width !== REVIEW_PREVIEW.width || preview.height !== REVIEW_PREVIEW.height || preview.sar !== REVIEW_PREVIEW.sar) {
    return fail("preview must be 1080x1920 SAR 1:1");
  }
  if (!Array.isArray(doc.locked_looks) || doc.locked_looks.some((x) => typeof x !== "string")) return fail("locked_looks must be strings");
  if (!Array.isArray(doc.plates)) return fail("plates must be an array");
  const plates: { id: string; asset_id: string }[] = [];
  for (const item of doc.plates) {
    const row = rec(item);
    if (!row || typeof row.id !== "string" || typeof row.asset_id !== "string" || !UUID.test(row.asset_id)) {
      return fail("each plate needs an id and an asset_id uuid");
    }
    plates.push({ id: row.id, asset_id: row.asset_id });
  }
  if (!Array.isArray(doc.allowed_black_windows)) return fail("allowed_black_windows must be an array");
  const windows: BlackWindow[] = [];
  for (const item of doc.allowed_black_windows) {
    const row = rec(item);
    if (!row || typeof row.in_frame !== "number" || typeof row.out_frame !== "number" || row.out_frame <= row.in_frame || row.in_frame < 0) {
      return fail("a black window needs in_frame < out_frame");
    }
    windows.push({ in_frame: row.in_frame, out_frame: row.out_frame });
  }
  return {
    ok: true,
    value: {
      format: FORMAT_PROJECT_RULES,
      format_version: FORMAT_VERSION,
      project_id: doc.project_id,
      face: "real_pixels_only",
      mouth: "no_alteration",
      likeness: "no_generated_likeness",
      preview: { ...REVIEW_PREVIEW },
      locked_looks: doc.locked_looks as string[],
      plates,
      allowed_black_windows: windows,
    },
  };
}

/** Song frame for a beat index. Used by the beat-to-cut builder. Frames, not a new EDL. */
export function beatFrame(doc: BeatGridDoc, index: number): number | null {
  const beat = doc.beats[index];
  return beat ? beat.frame : null;
}
