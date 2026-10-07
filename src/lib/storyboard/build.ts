/**
 * Writing the storyboard — the effects. The plans are in boxes.ts / rewrite.ts; this carries them out against the
 * treatment endpoint and the database.
 */
import { supabase } from "@/lib/supabase";
import type { Json } from "@/integrations/supabase/aliases";
import { lyricsForShot, type LyricLine } from "@/lib/lyrics/lyricsForShot";
import type { SongAnalysis } from "@/lib/songAnalysis/types";
import {
  draftTreatmentClips,
  parseSavedStructuredTreatment,
  structuredTreatmentToShotSpecs,
  type StructuredTreatment,
  type TreatmentContext,
} from "@/lib/treatment/api";
import { coverageGaps } from "@/lib/treatment/beatCoverage";
import { applyCoverageDefaults, DEFAULT_COVERAGE_PRESETS } from "@/lib/treatment/coverage";
import { buildClipGrid } from "@/lib/treatment/grid";
import type { ShotOverride } from "@/lib/treatment/overrides";
import { clearTreatment, fingerprint, parseTreatmentDoc, withTreatmentDoc, type TreatmentDoc, type TreatmentMode } from "@/lib/treatment/treatmentDoc";
import { applyAssignmentOps, fetchAssignments, fetchBoxes, fetchShotIndex, writeBoxes } from "@/lib/queries/storyboard";
import { createVariation, readDirection, writeDirection } from "@/lib/queries/variations";
import { planMaterialize, type StoryboardBox } from "./boxes";
import { planAssign, type Assignment } from "./media";
import { gridFromBoxes, planRewrite } from "./rewrite";

async function saveTreatmentJson(projectId: string, value: Record<string, unknown>, variationId?: string | null): Promise<void> {
  // the treatment is the variation's (queries/variations.ts): named, or the active one
  try {
    await writeDirection(projectId, { treatment_json: value as unknown as Json }, variationId);
  } catch (e) {
    throw new Error(`could not save the treatment: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Save the treatment text (the director's, or the AI's) — the one place the text is written. */
export async function saveTreatment(projectId: string, existing: unknown, doc: TreatmentDoc, variationId?: string | null): Promise<Record<string, unknown>> {
  // the text that is replaced is kept by the database (treatment_versions); this says what replaced it
  const next = withTreatmentDoc(existing, doc, { what: "edit", at: new Date().toISOString() });
  await saveTreatmentJson(projectId, next, variationId);
  return next;
}

/** Delete the treatment text. The storyboard's shots, their footage and the director's edits are not touched. */
export async function deleteTreatment(projectId: string, existing: unknown, variationId?: string | null): Promise<void> {
  await saveTreatmentJson(projectId, clearTreatment(existing, new Date().toISOString()), variationId);
}

async function fetchLegacyOverrides(projectId: string): Promise<Record<string, ShotOverride>> {
  const { data, error } = await supabase
    .from("shot_overrides")
    .select("spec_id, direction, frame, camera_motion, framing, transition_in, required_elements, notes, updated_at")
    .eq("project_id", projectId);
  if (error) throw error;
  const out: Record<string, ShotOverride> = {};
  for (const r of data ?? []) {
    out[r.spec_id] = {
      specId: r.spec_id,
      direction: r.direction,
      frame: r.frame ?? null,
      cameraMotion: (r.camera_motion ?? null) as ShotOverride["cameraMotion"],
      framing: r.framing,
      transitionIn: (r.transition_in ?? null) as ShotOverride["transitionIn"],
      requiredElements: r.required_elements,
      notes: r.notes,
      updatedAt: r.updated_at,
    };
  }
  return out;
}

/**
 * Clips the app already generated for a box (through Runs) are that box's footage. Link each one to its box once, as
 * an unselected candidate: nothing already made disappears, and nothing changes what a box shows until the director
 * picks it.
 */
async function linkGeneratedClips(projectId: string, variationId: string, boxes: readonly StoryboardBox[], assignments: readonly Assignment[]): Promise<number> {
  const byKey = new Map(boxes.map((b) => [b.key, b]));
  // only jobs of this variation: another video's board may use the same keys
  const { data, error } = await supabase
    .from("provider_jobs")
    .select("id, result_asset_id, request_payload_json")
    .eq("project_id", projectId)
    .eq("variation_id", variationId)
    .not("result_asset_id", "is", null);
  if (error) throw error;
  let linked = 0;
  let current = [...assignments];
  for (const job of data ?? []) {
    const key = (job.request_payload_json as { settings?: { batchShotId?: unknown } } | null)?.settings?.batchShotId;
    const box = typeof key === "string" ? byKey.get(key) : undefined;
    if (!box || !job.result_asset_id) continue;
    const ops = planAssign({ assignments: current, shotId: box.id, assetId: job.result_asset_id, role: "generated_clip", select: false });
    if (ops.length === 0) continue;
    await applyAssignmentOps(projectId, ops, variationId);
    const { error: aErr } = await supabase.from("project_assets").update({ shot_id: box.id }).eq("id", job.result_asset_id).is("shot_id", null);
    if (aErr) throw aErr;
    linked++;
    current = await fetchAssignments(projectId, variationId);
  }
  return linked;
}

export type MaterializeResult = { created: number; updated: number; carriedEdits: number; linkedClips: number };

/**
 * A project whose storyboard still lives inside `treatment_json` is moved onto box records, once: every drafted clip
 * becomes a record (the rows an earlier "Commit to shot list" made are reused, keeping their ids), every saved edit
 * is carried onto its own box, and clips already generated for a box are linked to it. Returns null when there is
 * nothing to move (the boxes already exist, or no treatment was ever generated).
 */
export async function ensureStoryboardMaterialized(input: {
  projectId: string;
  /** The variation whose board is empty. Its own treatment_json is what is materialised — never another's. */
  variationId: string;
  treatmentJson: unknown;
  lyricLines: LyricLine[] | undefined;
}): Promise<MaterializeResult | null> {
  const existingBoxes = await fetchBoxes(input.projectId, input.variationId);
  if (existingBoxes.length > 0) return null;
  const saved = parseSavedStructuredTreatment(input.treatmentJson);
  if (!saved) return null;
  const overrides = await fetchLegacyOverrides(input.projectId);
  const specs = applyCoverageDefaults(structuredTreatmentToShotSpecs(saved), DEFAULT_COVERAGE_PRESETS, input.lyricLines);
  const sections = Object.fromEntries(saved.clips.map((c) => [c.key, c.section]));
  const at = new Date().toISOString();
  const plan = planMaterialize({ specs, overrides, sections, existing: await fetchShotIndex(input.projectId, input.variationId), at });
  const res = await writeBoxes(input.projectId, plan, input.variationId);
  const boxes = await fetchBoxes(input.projectId, input.variationId);
  const linkedClips = await linkGeneratedClips(input.projectId, input.variationId, boxes, await fetchAssignments(input.projectId, input.variationId));
  return {
    created: res.inserted.length,
    updated: res.updated,
    carriedEdits: Object.keys(overrides).filter((k) => specs.some((s) => s.id === k)).length,
    linkedClips,
  };
}

export type WriteStoryboardInput = {
  projectId: string;
  /** The video variation the board belongs to: its treatment is written and its boxes are read and written. */
  variationId: string;
  /** Everything the treatment model is told about the project (lyrics, artist, look, footage note, …). */
  context: TreatmentContext;
  /** The treatment text the boxes are written from. Empty with `aiWritesText` = let the model write it. */
  treatmentText: string;
  /** True: the model writes the treatment text too (AI generate). False: the text is the director's, kept verbatim. */
  aiWritesText: boolean;
  /** What the model is asked for when it writes the text itself (direction the director gave, or a neutral ask). */
  conceptHint?: string;
  treatmentJson: unknown;
  boxes: readonly StoryboardBox[];
  assignments: readonly Assignment[];
  analysis: SongAnalysis | null;
  durationSeconds?: number | null;
  lyricLines: LyricLine[] | undefined;
  notes: string;
  /**
   * Write into a NEW variation (a candidate) instead of this one: the current board stays exactly as it is, as a
   * recoverable revision, and the corrected breakdown is reviewed beside it. The candidate copies this variation's
   * direction and treatment text and starts with no director edits; it is not made active.
   */
  candidate?: { name: string } | null;
};

export type WriteStoryboardResult = {
  doc: TreatmentDoc;
  written: number;
  kept: number;
  draft: StructuredTreatment;
  /** The variation the shots were written into: this one, or the candidate just made. */
  variationId: string;
  candidateVariationId: string | null;
  /** Director edits on the current board that were NOT carried into the candidate (its shots are new rows). */
  editsLeftBehind: number;
};

/** One treatment-model call: (optionally) the treatment text, and the scene of every box it may rewrite. */
export async function writeStoryboardFromTreatment(input: WriteStoryboardInput): Promise<WriteStoryboardResult> {
  const beatGrid = buildClipGrid({ analysis: input.analysis, durationSeconds: input.durationSeconds ?? null });
  const grid = input.boxes.length > 0 ? gridFromBoxes(input.boxes, beatGrid) : beatGrid;
  if (grid.length === 0) throw new Error("The song has not been analysed yet — Setup needs its length and beat before boxes can be cut.");
  // when the writer writes the text, `concept` is only a hint from the director (empty = none)
  const concept = input.aiWritesText ? (input.conceptHint?.trim() ?? "") : input.treatmentText.trim();
  if (!input.aiWritesText && !concept) throw new Error("Write the treatment first, or let the AI write it.");

  // a candidate is a new variation: the writer is told the candidate's id (its run is the candidate's evidence), the
  // grid is this board's cut (so the candidate's shots are this board's windows, one to one), and nothing here changes
  const text0 = input.aiWritesText ? "" : input.treatmentText;
  let targetVariationId = input.variationId;
  let candidateVariationId: string | null = null;
  if (input.candidate) {
    const direction = await readDirection(input.projectId, input.variationId);
    const prior = parseTreatmentDoc(input.treatmentJson);
    const made = await createVariation({
      projectId: input.projectId,
      name: input.candidate.name,
      treatmentText: text0,
      mood: direction?.mood ?? null,
      visualStyle: direction?.visual_style ?? null,
      notes: direction?.notes ?? null,
      footageConfirmedAt: prior.footageConfirmedAt,
      makeActive: false,
    });
    targetVariationId = made.id;
    candidateVariationId = made.id;
  }

  const draft = await draftTreatmentClips({ ...input.context, variationId: targetVariationId, concept, grid, writeText: input.aiWritesText, clipLyrics: clipLyrics(grid, input.lyricLines) });
  if (input.aiWritesText && !draft.concept.trim()) throw new Error("The writer returned no treatment — nothing was changed. Try again.");
  // a board that exists is never replaced in place by shots that do not carry the treatment: the gaps are said and
  // nothing is written (a first write and a candidate are written and shown with their gaps — nothing is lost there)
  if (!candidateVariationId && input.boxes.length > 0 && draft.coverage && !draft.coverage.ok) {
    const gaps = coverageGaps(draft.coverage);
    throw new Error(`The shots that came back do not carry the whole treatment, so the board was not replaced: ${gaps.slice(0, 4).join(" ")}${gaps.length > 4 ? ` (+${gaps.length - 4} more)` : ""} Write them into a candidate instead to review them beside this board.`);
  }
  const at = new Date().toISOString();
  const text = input.aiWritesText ? [draft.concept, draft.narrative].filter(Boolean).join("\n\n") : input.treatmentText;
  // every shot written now says which treatment it was written from; a shot that is kept keeps the stamp it had
  const drafted = structuredTreatmentToShotSpecs(draft, fingerprint(text));
  const sections = Object.fromEntries(draft.clips.map((c) => [c.key, c.section]));
  const withMedia = new Set(input.assignments.map((a) => a.shotId));
  const plan = planRewrite({
    // into a candidate every shot is a new row: nothing of this board is kept there, nothing of it is touched
    boxes: candidateVariationId ? [] : input.boxes,
    boxIdsWithMedia: candidateVariationId ? new Set() : withMedia,
    drafted,
    sections,
    existingRows: input.boxes.length === 0 || candidateVariationId ? await fetchShotIndex(input.projectId, targetVariationId) : [],
    lyricLines: input.lyricLines,
    at,
  });
  await writeBoxes(input.projectId, plan, targetVariationId);

  const mode: TreatmentMode = input.aiWritesText ? "ai" : parseTreatmentDoc(input.treatmentJson).mode;
  const prior = parseTreatmentDoc(input.treatmentJson);
  const doc: TreatmentDoc = {
    ...prior,
    text,
    mode: input.aiWritesText ? "ai" : mode,
    updatedAt: input.aiWritesText ? at : prior.updatedAt || at,
    model: draft.model || prior.model,
    notes: input.notes,
    // `from` is the text the LAST WRITE used. It does not say every shot is from it: the kept ones are not, and each
    // shot's own stamp (boxes.ts `boxIsStale`) is what answers that.
    storyboard: { from: fingerprint(text), at, written: plan.written, kept: plan.kept, coverage: draft.coverage ?? null, run: draft.run ?? null },
  };
  // the draft's clips are kept as the record of this generation, on the variation the shots were written into: this
  // one's envelope, or the candidate's own (it starts from the text alone — nothing of this board's record moves)
  const envelope = candidateVariationId ? (await readDirection(input.projectId, candidateVariationId))?.treatment_json : input.treatmentJson;
  const record = {
    ...(envelope && typeof envelope === "object" ? (envelope as Record<string, unknown>) : {}),
    version: 2,
    project_type: draft.project_type,
    sections: draft.sections,
    clips: draft.clips,
    model: draft.model,
    generated_at: at,
  };
  // a new text replaces the old one: the old one is kept as a version, labelled as replaced by this generation
  await saveTreatmentJson(input.projectId, input.aiWritesText ? withTreatmentDoc(record, doc, { what: "generate", at }) : withTreatmentDoc(record, doc), targetVariationId);
  return {
    doc,
    written: plan.written,
    kept: plan.kept,
    draft,
    variationId: targetVariationId,
    candidateVariationId,
    editsLeftBehind: candidateVariationId ? input.boxes.filter((b) => (b.override?.manual?.length ?? 0) > 0 || b.locked).length : 0,
  };
}

/** The words sung inside each shot of a grid, by key — what the writer is told each shot has to answer. */
export function clipLyrics(grid: readonly { key: string; start: number; end: number }[], lines: readonly LyricLine[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!lines?.length) return out;
  for (const g of grid) {
    const sung = lyricsForShot(lines as LyricLine[], { start: g.start, end: g.end });
    if (sung.length) out[g.key] = sung.map((l) => l.text).join(" / ");
  }
  return out;
}
