/**
 * The treatment — ONE authoritative text per project (Fendi, 2026-10-03).
 *
 * It lives in `video_projects.treatment_json` under `treatment`, written by the AI or typed by the director, and it
 * is the only creative brief any generation reads. Whatever the director typed is stored as typed: a generator's
 * restatement never replaces it.
 *
 * `treatment_json` is a shared jsonb that older readers still open (`text`, `concept`, `narrative`, `clips`). Those
 * keys are kept in step so nothing downstream reads a stale treatment, but none of them is an authority any more:
 * the text is `treatment.text`, and the boxes are `shots` rows (src/lib/storyboard/boxes.ts).
 *
 * Pure module.
 */

export type TreatmentMode = "ai" | "manual";

export type TreatmentDoc = {
  text: string;
  /** Who last wrote the text. An AI treatment the director then edits becomes "manual": it is his now. */
  mode: TreatmentMode;
  updatedAt: string;
  model: string | null;
  /** Optional notes for the writer (constraints, must-haves). Mood and visual direction are project fields. */
  notes: string;
  /** The treatment text the storyboard boxes were last written from, as a fingerprint, and when. */
  storyboard: { from: string; at: string; written: number; kept: number } | null;
  /** When the director said the real footage is all in (Setup). Null = not confirmed. */
  footageConfirmedAt: string | null;
};

/** A short fingerprint of a text (whitespace-insensitive), to tell "the boxes were written from THIS treatment". */
export function fingerprint(text: string): string {
  const s = text.replace(/\s+/g, " ").trim();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Read the treatment out of `treatment_json`, whatever wrote it:
 *   • the current shape (`treatment: { text, … }`);
 *   • a structured treatment from the old builder (`concept` + `narrative`) — the two joined ARE its treatment;
 *   • the first prose envelope (`text`).
 * Always returns a doc (empty text when nothing is saved), so Setup's confirmation has somewhere to live.
 */
export function parseTreatmentDoc(value: unknown): TreatmentDoc {
  const v = asObject(value);
  const t = asObject(v.treatment);
  const setup = asObject(v.setup);
  const footageConfirmedAt = typeof setup.footage_confirmed_at === "string" ? setup.footage_confirmed_at : null;
  if (typeof t.text === "string") {
    const sb = asObject(t.storyboard);
    return {
      text: t.text,
      mode: t.mode === "manual" ? "manual" : "ai",
      updatedAt: typeof t.updated_at === "string" ? t.updated_at : "",
      model: typeof t.model === "string" && t.model ? t.model : null,
      notes: typeof t.notes === "string" ? t.notes : "",
      storyboard:
        typeof sb.from === "string" && typeof sb.at === "string"
          ? { from: sb.from, at: sb.at, written: Number(sb.written ?? 0), kept: Number(sb.kept ?? 0) }
          : null,
      footageConfirmedAt,
    };
  }
  const concept = typeof v.concept === "string" ? v.concept.trim() : "";
  const narrative = typeof v.narrative === "string" ? v.narrative.trim() : "";
  const legacyText = [concept, narrative].filter(Boolean).join("\n\n") || (typeof v.text === "string" ? v.text.trim() : "");
  return {
    text: legacyText,
    mode: "ai",
    updatedAt: typeof v.generated_at === "string" ? v.generated_at : "",
    model: typeof v.model === "string" && v.model ? v.model : null,
    notes: "",
    // a structured treatment with clips was the source of the board that exists
    storyboard: legacyText && Array.isArray(v.clips) && v.clips.length > 0
      ? { from: fingerprint(legacyText), at: typeof v.generated_at === "string" ? v.generated_at : "", written: v.clips.length, kept: 0 }
      : null,
    footageConfirmedAt,
  };
}

export function hasTreatment(doc: TreatmentDoc): boolean {
  return doc.text.trim().length > 0;
}

/** True when the treatment text changed after the boxes were written (or no boxes were written from it yet). */
export function storyboardIsStale(doc: TreatmentDoc): boolean {
  return hasTreatment(doc) && (!doc.storyboard || doc.storyboard.from !== fingerprint(doc.text));
}

/**
 * Write the doc back into `treatment_json`, keeping every other key (the last generation's clips stay as its record).
 * `text` / `concept` mirror the treatment for readers that predate it.
 */
export function withTreatmentDoc(existing: unknown, doc: TreatmentDoc): Record<string, unknown> {
  const v = { ...asObject(existing) };
  v.treatment = {
    text: doc.text,
    mode: doc.mode,
    updated_at: doc.updatedAt,
    model: doc.model,
    notes: doc.notes,
    storyboard: doc.storyboard,
  };
  v.setup = { ...asObject(v.setup), footage_confirmed_at: doc.footageConfirmedAt };
  v.text = doc.text;
  v.concept = doc.text;
  // the old two-field split no longer exists: the treatment is one text
  v.narrative = "";
  return v;
}

/**
 * Delete the treatment. The text goes; the storyboard's boxes, their footage and the director's edits are records of
 * their own and are not touched. The Setup confirmation stays (the footage did not change).
 */
export function clearTreatment(existing: unknown, at: string): Record<string, unknown> {
  const doc = parseTreatmentDoc(existing);
  const v = withTreatmentDoc(existing, { ...doc, text: "", mode: "manual", updatedAt: at, model: null, storyboard: null });
  delete v.sections;
  return v;
}

/**
 * The director's notes are ONE text. Older projects hold two (a notes column on the project, written before the
 * Treatment page existed and shown nowhere since, and the notes kept with the treatment): they are read together,
 * shown in the one notes field, and saved back as one — so nothing the writer is told is hidden from the director.
 */
export function directorNotes(projectNotes: string | null | undefined, docNotes: string | null | undefined): string {
  const parts = [projectNotes, docNotes].map((s) => (s ?? "").trim()).filter(Boolean);
  return parts.filter((p, i) => parts.indexOf(p) === i).join("\n\n");
}
