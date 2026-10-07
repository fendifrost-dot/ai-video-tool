/**
 * Treatment history — reading it and restoring from it (Fendi, 2026-10-03: "Every Generate, Regenerate, manual
 * edit/save, major AI rewrite must preserve the previous treatment version … Do NOT silently overwrite").
 *
 * The keeping itself is done by the database: a trigger on the project writes the version being replaced into
 * `treatment_versions`, whoever makes the write (migration 20261003180000). This module is the app's half: the shape
 * of a version, what to call it, and the ONE write that makes an old version current again — which the same trigger
 * then records, so a restore can itself be undone.
 *
 * Pure module.
 */
import { parseTreatmentDoc, withTreatmentDoc, type TreatmentMode } from "./treatmentDoc";

export type TreatmentVersion = {
  id: string;
  projectId: string;
  /** The video variation whose treatment this was (null on a row from before variations; the migration fills it). */
  variationId: string | null;
  /** When it stopped being the current treatment. */
  replacedAt: string;
  /** What replaced it: generate | edit | delete | restore | context (only notes, mood or visual direction changed). */
  replacedBy: string;
  text: string;
  mode: TreatmentMode | null;
  model: string | null;
  /** When that text was written. */
  writtenAt: string | null;
  notes: string;
  mood: string;
  visualStyle: string;
};

export type TreatmentVersionRow = {
  id: string;
  project_id: string;
  variation_id?: string | null;
  created_at: string;
  replaced_by: string | null;
  treatment_text: string | null;
  treatment_mode: string | null;
  treatment_model: string | null;
  treatment_updated_at: string | null;
  notes: string | null;
  mood: string | null;
  visual_style: string | null;
};

export function versionFromRow(row: TreatmentVersionRow): TreatmentVersion {
  return {
    id: row.id,
    projectId: row.project_id,
    variationId: row.variation_id ?? null,
    replacedAt: row.created_at,
    replacedBy: row.replaced_by || "edit",
    text: row.treatment_text ?? "",
    mode: row.treatment_mode === "manual" ? "manual" : row.treatment_mode === "ai" ? "ai" : null,
    model: row.treatment_model || null,
    writtenAt: row.treatment_updated_at || null,
    notes: row.notes ?? "",
    mood: row.mood ?? "",
    visualStyle: row.visual_style ?? "",
  };
}

const REPLACED: Record<string, string> = {
  generate: "replaced when the AI wrote a new treatment",
  edit: "replaced by an edit",
  delete: "the treatment that was deleted",
  restore: "replaced when an earlier version was restored",
  context: "the notes, mood or visual direction changed",
};

/** What happened to this version, in words. */
export function versionReason(v: Pick<TreatmentVersion, "replacedBy">): string {
  return REPLACED[v.replacedBy] ?? "replaced";
}

/** Who wrote a version's text. */
export function versionAuthor(v: Pick<TreatmentVersion, "mode" | "model" | "text">): string {
  if (!v.text.trim()) return "no treatment text";
  if (v.mode === "manual") return "written by you";
  return `written by the AI${v.model ? ` (${v.model})` : ""}`;
}

/** The first words of a version, for a list. */
export function versionExcerpt(v: Pick<TreatmentVersion, "text" | "notes">, max = 150): string {
  const s = (v.text.trim() || v.notes.trim()).replace(/\s+/g, " ");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export type TreatmentSnapshot = { text: string; notes: string; mood: string; visualStyle: string };

/** The brief as it stands on the project now. */
export function currentSnapshot(project: { treatment_json?: unknown; notes?: string | null; mood?: string | null; visual_style?: string | null } | null | undefined): TreatmentSnapshot {
  const doc = parseTreatmentDoc(project?.treatment_json);
  const parts = [project?.notes, doc.notes].map((s) => (s ?? "").trim()).filter(Boolean);
  return {
    text: doc.text,
    notes: parts.filter((p, i) => parts.indexOf(p) === i).join("\n\n"),
    mood: project?.mood ?? "",
    visualStyle: project?.visual_style ?? "",
  };
}

const same = (a: string, b: string) => a.trim() === b.trim();

/**
 * The context fields — notes, mood, visual direction — that are still word for word what stood beside an EARLIER
 * treatment text. `versions` is newest first (what the query returns).
 *
 * Why it is worth saying: these fields are the director's own, they are sent to every writer and to the reviewer,
 * and nothing changes them when the treatment is replaced. A treatment rewritten into a different video keeps the
 * last video's places, wardrobe rules and look riding along beside it. They are his to change — so the page says
 * which ones have not moved since the treatment did, instead of rewriting them or quietly obeying them.
 */
export function contextFromEarlierTreatment(versions: readonly TreatmentVersion[], now: TreatmentSnapshot): ("notes" | "mood" | "visual")[] {
  if (!now.text.trim()) return [];
  const replaced = versions.find((v) => v.text.trim() && !same(v.text, now.text));
  if (!replaced) return [];
  const out: ("notes" | "mood" | "visual")[] = [];
  if (now.visualStyle.trim() && same(replaced.visualStyle, now.visualStyle)) out.push("visual");
  if (now.mood.trim() && same(replaced.mood, now.mood)) out.push("mood");
  if (now.notes.trim() && same(replaced.notes, now.notes)) out.push("notes");
  return out;
}

/** What differs between a version and the current brief — what a restore would change. Empty = nothing. */
export function versionDiffers(v: TreatmentVersion, now: TreatmentSnapshot): ("text" | "notes" | "mood" | "visual")[] {
  const out: ("text" | "notes" | "mood" | "visual")[] = [];
  if (!same(v.text, now.text)) out.push("text");
  if (!same(v.notes, now.notes)) out.push("notes");
  if (!same(v.mood, now.mood)) out.push("mood");
  if (!same(v.visualStyle, now.visualStyle)) out.push("visual");
  return out;
}

export type RestoreWrite = { treatment_json: Record<string, unknown>; notes: string | null; mood: string | null; visual_style: string | null };

/**
 * The one write that makes a version current again: its text (as it was written — the director's stays the
 * director's), and the notes, mood and visual direction that stood beside it. Everything else in the treatment
 * record is kept: the storyboard fingerprint is left alone, so the page says truthfully that the shots were written
 * from a different text; the shots themselves are records of their own and are not touched.
 */
export function restoreWrite(version: TreatmentVersion, currentTreatmentJson: unknown, at: string): RestoreWrite {
  const doc = parseTreatmentDoc(currentTreatmentJson);
  const treatment_json = withTreatmentDoc(
    currentTreatmentJson,
    { ...doc, text: version.text, mode: version.mode ?? (version.text.trim() ? "manual" : doc.mode), model: version.mode === "manual" ? null : version.model, updatedAt: version.writtenAt || at, notes: "" },
    { what: "restore", at },
  );
  return {
    treatment_json,
    notes: version.notes.trim() || null,
    mood: version.mood.trim() || null,
    visual_style: version.visualStyle.trim() || null,
  };
}

// ---------------------------------------------------------------------------
// The keeping rule, stated in TypeScript
// ---------------------------------------------------------------------------

export type ProjectBrief = { treatment_json?: unknown; notes?: string | null; mood?: string | null; visual_style?: string | null };

/**
 * The rule the database trigger applies on every update of a project (migration 20261003180000,
 * `keep_treatment_version`), stated here for the tests and for the local stand-in backend: given the project as it
 * was and as it is about to be, the version that must be kept — or null when the write does not replace anything
 * worth keeping. The SQL is the authority; this mirrors it line for line.
 */
export function keptVersion(before: ProjectBrief, after: ProjectBrief): Omit<TreatmentVersionRow, "id" | "project_id" | "created_at"> | null {
  const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const textOf = (j: Record<string, unknown>) => {
    const t = obj(j.treatment);
    if (typeof t.text === "string") return t.text;
    const legacy = [str(j.concept).trim(), str(j.narrative).trim()].filter(Boolean).join("\n\n");
    return legacy || str(j.text).trim();
  };
  const oldJson = obj(before.treatment_json);
  const newJson = obj(after.treatment_json);
  const oldT = obj(oldJson.treatment);
  const newT = obj(newJson.treatment);
  const oldText = textOf(oldJson);
  const newText = textOf(newJson);
  const oldDocNotes = str(oldT.notes).trim();
  const newDocNotes = str(newT.notes).trim();
  const oldNotes = (before.notes ?? "").trim();
  const textChanged = oldText !== newText;
  const contextChanged =
    oldNotes !== (after.notes ?? "").trim() || oldDocNotes !== newDocNotes || (before.mood ?? "") !== (after.mood ?? "") || (before.visual_style ?? "") !== (after.visual_style ?? "");
  if (!textChanged && !contextChanged) return null;
  if (oldText === "" && oldNotes === "" && oldDocNotes === "" && !(before.mood ?? "") && !(before.visual_style ?? "")) return null;
  const labelled = str(newT.change) && str(newT.change_at) !== str(oldT.change_at) ? str(newT.change) : null;
  const notes = oldDocNotes === "" || oldDocNotes === oldNotes ? oldNotes : [oldNotes, oldDocNotes].filter(Boolean).join("\n\n");
  return {
    replaced_by: !textChanged ? "context" : (labelled ?? (newText === "" ? "delete" : "edit")),
    treatment_text: oldText,
    treatment_mode: str(oldT.mode) || null,
    treatment_model: str(oldT.model) || str(oldJson.model) || null,
    treatment_updated_at: str(oldT.updated_at) || str(oldJson.generated_at) || null,
    notes: notes || null,
    mood: before.mood ?? null,
    visual_style: before.visual_style ?? null,
  };
}
