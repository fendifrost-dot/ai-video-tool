// Whose performance a Cut clip shows, read from how its picture was actually made. Pure: no Deno, no network.
//
// The label is edit_clips.mouth (existing column, existing values plus two):
//   camera   recorded performance: the original take, or a face-preserving edit of one (dress / garment / shoe swap,
//            composite into a plate). The edit history is kept alongside (`history`), never folded into the label.
//   model    generated performance: a Seedance montage or restage drew the whole performance, mouth included.
//   lipsync  modified mouth movement: a generative lip-sync pass redrew the mouth over whatever it was made from.
//   unknown  the history is missing or ambiguous. Never read as camera.
//   null     not a performance picture at all (world b-roll with no performer source, audio).
//
// It walks the asset chain to its root (metadata_json.derived_from, then the provider job's sourceAssetId, then
// parent_asset_id), so a later clothing or shoe fix on top of a generated montage still resolves to generated.
// Whether a clip is waiting for lip-sync (placeholder) says nothing about what it is and is not read here.
// Labels describe provenance only: they never change timing, selection or approval, and never disable a control.

import { MOUTH_GUIDANCE, type EditSequence, type MouthLabel } from "./editModel.ts";

export const PROVENANCE_VERSION = "perf-provenance-v1";

export type ProvenanceAsset = {
  id: string;
  asset_type?: string | null;
  footage_role?: string | null;
  source_tool?: string | null;
  parent_asset_id?: string | null;
  metadata_json?: unknown;
};

/** The settings of the provider job that made an asset (request_payload_json.settings), when known. */
export type ProvenanceJob = { id: string; settings?: unknown; modelVariant?: string | null; mode?: string | null };

export type ProvenanceStep =
  | "camera" // root: recorded take
  | "generated_root" // root: generated with no performer source (world b-roll) or a generated performance with no source
  | "unknown_root" // root we cannot read (missing, or unrecognised)
  | "dressed" // face-preserving garment / shoe swap
  | "composite" // face-preserving composite of a take into a plate
  | "montage" // Seedance montage: generated performance
  | "restaged" // restage: generated performance
  | "lipsync" // generative lip-sync: modified mouth
  | "unknown"; // derived, but how is not recorded

export type HistoryEntry = { assetId: string; step: ProvenanceStep; note?: string };

export type PerformanceProvenance = {
  mouth: MouthLabel;
  /** Root first, the clip's own asset last. */
  history: HistoryEntry[];
  reason: string;
};

type Row = Record<string, unknown>;
const obj = (v: unknown): Row | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : null);
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

const RECORDED_TYPES = new Set(["reference_video", "raw_footage", "uploaded_video", "performance_video", "source_video"]);
const GENERATED_TOOLS = new Set(["higgsfield", "fal", "runway", "grok", "kling", "seedance", "luma", "replicate"]);

export const GUIDANCE = MOUTH_GUIDANCE;

export const SHORT_LABEL: Record<Exclude<MouthLabel, null>, string> = {
  camera: "Recorded performance",
  model: "Generated performance",
  lipsync: "Modified mouth movement",
  unknown: "Provenance unknown",
};

function jobOf(asset: ProvenanceAsset, jobs: ReadonlyMap<string, ProvenanceJob>): ProvenanceJob | null {
  const id = s(obj(asset.metadata_json)?.provider_job_id);
  return id ? (jobs.get(id) ?? null) : null;
}

/** One link of the chain: what was done to make `asset`, and from which parent (null = this is a root). */
export function stepOf(
  asset: ProvenanceAsset,
  job: ProvenanceJob | null,
): { step: ProvenanceStep; parentId: string | null; note?: string; parentGenerated?: boolean } {
  const meta = obj(asset.metadata_json) ?? {};
  const d = obj(meta.derived_from);
  const settings = obj(job?.settings);
  const jobLipsync = obj(settings?.lipsync) ?? (s(settings?.route) === "lipsync" ? {} : null);
  const parentId =
    s(d?.asset_id) ?? s(settings?.sourceAssetId) ?? s(asset.parent_asset_id) ?? null;

  if (d?.lipsync || jobLipsync) return { step: "lipsync", parentId };
  const dress = obj(d?.dress);
  if (dress || s(d?.method) === "dressed") {
    const src = s(dress?.sourceMethod);
    return {
      step: "dressed",
      parentId,
      note: s(obj(dress?.outfit)?.name) ?? undefined,
      parentGenerated: src === "montage" || src === "restaged" || s(d?.method) === "montage",
    };
  }
  const method = s(d?.method);
  if (method === "composite") return { step: "composite", parentId };
  if (method === "montage") return { step: "montage", parentId };
  if (method === "restaged") return { step: "restaged", parentId };
  if (d) return { step: "unknown", parentId };

  // no derived_from: the job may still say what it was made from
  if (settings) {
    const variant = obj(settings.variant);
    const route = s(settings.route);
    if (parentId) {
      if (typeof variant?.version === "string" && variant.version.startsWith("montage")) return { step: "montage", parentId };
      if (route === "seedance_ref" || route === "restage") return { step: "restaged", parentId };
      return { step: "unknown", parentId };
    }
    // a world plate / b-roll: generated with no performer source
    if (variant?.broll === true || s(settings.kind) === "world") return { step: "generated_root", parentId: null, note: "b-roll" };
    if (route === "seedance_ref") return { step: "generated_root", parentId: null };
  }
  if (parentId) return { step: "unknown", parentId };

  // a root with no job
  const type = s(asset.asset_type) ?? "";
  const tool = s(asset.source_tool);
  const generated = type.startsWith("generated") || (tool != null && GENERATED_TOOLS.has(tool));
  if (!generated && asset.footage_role === "performance" && (RECORDED_TYPES.has(type) || tool === "manual" || tool === "upload"))
    return { step: "camera", parentId: null };
  if (generated && asset.footage_role === "performance") return { step: "generated_root", parentId: null };
  return { step: "unknown_root", parentId: null };
}

const MAX_DEPTH = 16;

/** Resolve one asset's performance provenance through its lineage. */
export function resolvePerformance(
  assetId: string | null,
  assets: ReadonlyMap<string, ProvenanceAsset>,
  jobs: ReadonlyMap<string, ProvenanceJob> = new Map(),
): PerformanceProvenance {
  if (!assetId) return { mouth: "unknown", history: [], reason: "the clip names no asset" };
  const chain: { id: string; step: ProvenanceStep; note?: string; parentGenerated?: boolean }[] = [];
  const seen = new Set<string>();
  let id: string | null = assetId;
  let rootMissing = false;
  while (id) {
    if (seen.has(id) || chain.length >= MAX_DEPTH) {
      return { mouth: "unknown", history: chain.reverse().map(toEntry), reason: "the asset chain loops or is too deep" };
    }
    seen.add(id);
    const asset = assets.get(id);
    if (!asset) {
      rootMissing = true;
      chain.push({ id, step: "unknown_root", note: "asset not readable" });
      break;
    }
    const st = stepOf(asset, jobOf(asset, jobs));
    chain.push({ id, step: st.step, note: st.note, parentGenerated: st.parentGenerated });
    id = st.parentId;
  }
  const history = [...chain].reverse();
  // fold root → leaf
  let mouth: MouthLabel = "unknown";
  let reason = "";
  for (const [i, h] of history.entries()) {
    switch (h.step) {
      case "camera":
        mouth = "camera";
        reason = "original camera take";
        break;
      case "generated_root":
        if (h.note === "b-roll") {
          mouth = null;
          reason = "generated b-roll with no performer source";
        } else {
          mouth = "model";
          reason = "generated with no recorded source";
        }
        break;
      case "unknown_root":
        mouth = "unknown";
        reason = rootMissing && i === 0 ? "the source asset could not be read" : "the source's history is not recorded";
        break;
      case "montage":
      case "restaged":
        mouth = "model";
        reason = h.step === "montage" ? "Seedance montage: performance regenerated" : "restaged: performance regenerated";
        break;
      case "lipsync":
        mouth = "lipsync";
        reason = "generative lip-sync redrew the mouth";
        break;
      case "dressed":
      case "composite":
        // face preserved: the label is what it was made from. A dress record that names a generated source decides
        // even when that source cannot be read.
        if (h.parentGenerated && (mouth === "unknown" || mouth === null)) {
          mouth = "model";
          reason = "clothing edit over a generated performance";
        } else if (mouth === "camera") {
          reason = "recorded performance with a face-preserving edit";
        } else if (mouth === "model") {
          reason = "face-preserving edit over a generated performance";
        }
        break;
      case "unknown":
        // a derived step we cannot name may have regenerated anything
        mouth = "unknown";
        reason = "a step in the asset chain has no recorded method";
        break;
    }
  }
  return { mouth, history: history.map(toEntry), reason };
}

function toEntry(h: { id: string; step: ProvenanceStep; note?: string }): HistoryEntry {
  return h.note ? { assetId: h.id, step: h.step, note: h.note } : { assetId: h.id, step: h.step };
}

/** Plain words for the history, root first: "camera take → dressed (YSL denim look) → montage". */
export function historyLine(history: readonly HistoryEntry[]): string {
  const word: Record<ProvenanceStep, string> = {
    camera: "camera take",
    generated_root: "generated",
    unknown_root: "unrecorded source",
    dressed: "clothing edit",
    composite: "composite",
    montage: "Seedance montage",
    restaged: "restage",
    lipsync: "lip-sync",
    unknown: "unrecorded step",
  };
  return history.map((h) => (h.note && h.step === "dressed" ? `${word[h.step]} (${h.note})` : word[h.step])).join(" → ");
}

/**
 * Set every picture clip's `mouth` from its asset lineage. Changes `mouth` and nothing else: asset selection,
 * source and timeline ranges, speed, slip, enabled, placeholder and order are copied through untouched.
 * Audio clips keep null.
 */
export function applyPerformanceProvenance(
  seq: EditSequence,
  assets: ReadonlyMap<string, ProvenanceAsset>,
  jobs: ReadonlyMap<string, ProvenanceJob> = new Map(),
): { sequence: EditSequence; byClip: Record<string, PerformanceProvenance> } {
  const byClip: Record<string, PerformanceProvenance> = {};
  const clips = seq.clips.map((c) => {
    if (c.track !== "V1") return c;
    const p = resolvePerformance(c.assetId, assets, jobs);
    byClip[c.id] = p;
    return p.mouth === c.mouth ? c : { ...c, mouth: p.mouth };
  });
  return { sequence: { ...seq, clips }, byClip };
}

export function provenanceCounts(byClip: Record<string, PerformanceProvenance>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of Object.values(byClip)) {
    const k = p.mouth ?? "none";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------ loading

type Result<T> = { data: T | null; error: { message: string } | null };
export interface ProvenanceDb {
  from(table: string): {
    select(columns: string): { in(column: string, values: readonly string[]): PromiseLike<Result<Row[]>> };
  };
}

/** Read the assets of a sequence and every ancestor (breadth-first, bounded), plus the jobs that made them. */
export async function loadProvenance(
  db: ProvenanceDb,
  assetIds: readonly string[],
): Promise<{ assets: Map<string, ProvenanceAsset>; jobs: Map<string, ProvenanceJob> }> {
  const assets = new Map<string, ProvenanceAsset>();
  const jobs = new Map<string, ProvenanceJob>();
  let frontier = [...new Set(assetIds.filter(Boolean))];
  for (let depth = 0; frontier.length && depth < MAX_DEPTH; depth++) {
    const { data, error } = await db
      .from("project_assets")
      .select("id, asset_type, footage_role, source_tool, parent_asset_id, metadata_json")
      .in("id", frontier);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as ProvenanceAsset[];
    for (const r of rows) assets.set(r.id, r);
    const jobIds = rows
      .map((r) => s(obj(r.metadata_json)?.provider_job_id))
      .filter((x): x is string => !!x && !jobs.has(x));
    if (jobIds.length) {
      const { data: jd, error: jErr } = await db
        .from("provider_jobs")
        .select("id, request_payload_json")
        .in("id", jobIds);
      if (jErr) throw new Error(jErr.message);
      for (const j of (jd ?? []) as Row[]) {
        const p = obj(j.request_payload_json);
        jobs.set(String(j.id), { id: String(j.id), settings: p?.settings ?? null, modelVariant: s(p?.modelVariant), mode: s(p?.mode) });
      }
    }
    const next = new Set<string>();
    for (const r of rows) {
      const st = stepOf(r, jobOf(r, jobs));
      if (st.parentId && !assets.has(st.parentId)) next.add(st.parentId);
    }
    frontier = [...next];
  }
  return { assets, jobs };
}
