/**
 * The storyboard's reads and writes: box records (`shots`), footage assignments (`shot_asset_assignments`), take
 * syncs (`performance_syncs`) and what a piece of footage is (`project_assets.footage_role`).
 *
 * Every rule lives in src/lib/storyboard/** as a plan; this file only carries a plan to the database. One write path
 * per thing, so a box written by the generator, by the director, by a split or by a migration is the same kind of row.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json, ProjectAsset, TablesInsert, TablesUpdate } from "@/integrations/supabase/aliases";
import { bucketForAssetType, projectAssetsKeys, useProjectAssets } from "@/lib/queries/projectAssets";
import { useProjectAudio } from "@/lib/queries/projects";
import { shotsKeys } from "@/lib/queries/shots";
import { resolveScrubSource } from "@/lib/video/scrubProxy";
import { boxesFromRows, type BoxRow, type BoxWrite, type StoryboardBox } from "@/lib/storyboard/boxes";
import {
  isImagePath,
  isVideoPath,
  type Assignment,
  type AssignmentOp,
  type AssignmentRole,
  type FootageRole,
  type MediaAsset,
  type TakeSync,
} from "@/lib/storyboard/media";

export const storyboardKeys = {
  boxes: (projectId: string) => ["storyboard", "boxes", projectId] as const,
  assignments: (projectId: string) => ["storyboard", "assignments", projectId] as const,
  syncs: (projectId: string) => ["storyboard", "syncs", projectId] as const,
};

const BOX_COLUMNS =
  "id, project_id, shot_number, song_section, timestamp_start, timestamp_end, shot_type, scene_description, notes, spec_key, generated_json, override_json, locked, box_origin, history_json, created_at, updated_at";

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

// ---------------------------------------------------------------------------
// Boxes
// ---------------------------------------------------------------------------

export async function fetchBoxes(projectId: string): Promise<StoryboardBox[]> {
  const { data, error } = await supabase
    .from("shots")
    .select(BOX_COLUMNS)
    .eq("project_id", projectId)
    .not("spec_key", "is", null)
    .order("timestamp_start", { ascending: true });
  if (error) throw error;
  return boxesFromRows((data ?? []) as unknown as BoxRow[]);
}

/** The storyboard: every box record of the project, in song order. */
export function useStoryboardBoxes(projectId: string | undefined) {
  return useQuery<StoryboardBox[]>({
    queryKey: storyboardKeys.boxes(projectId ?? "_none_"),
    queryFn: () => fetchBoxes(projectId!),
    enabled: !!projectId,
    staleTime: 15_000,
  });
}

function toUpdate(write: BoxWrite): TablesUpdate<"shots"> {
  return {
    ...write,
    shot_type: write.shot_type as never,
    generated_json: write.generated_json as unknown as Json,
    override_json: (write.override_json ?? null) as unknown as Json,
    spec_json: write.spec_json as unknown as Json,
    history_json: write.history_json as unknown as Json,
    updated_at: new Date().toISOString(),
  };
}

/** Rows for every shot of the project, as the materialise plan needs them (boxes and legacy shot-list rows alike). */
export async function fetchShotIndex(projectId: string) {
  const { data, error } = await supabase.from("shots").select("id, spec_key, notes, shot_number").eq("project_id", projectId);
  if (error) throw error;
  return data ?? [];
}

/** Apply box writes: in-place updates by record id, and inserts with fresh shot numbers (a label, not an identity). */
export async function writeBoxes(
  projectId: string,
  plan: { updates?: { id: string; write: BoxWrite }[]; inserts?: BoxWrite[] },
): Promise<{ updated: number; inserted: string[] }> {
  let updated = 0;
  for (const u of plan.updates ?? []) {
    const { error } = await supabase.from("shots").update(toUpdate(u.write)).eq("id", u.id);
    if (error) throw new Error(`could not save box ${u.write.spec_key}: ${error.message}`);
    updated++;
  }
  const inserted: string[] = [];
  if (plan.inserts?.length) {
    const userId = await requireUserId();
    const { data: priors, error: pErr } = await supabase.from("shots").select("shot_number").eq("project_id", projectId);
    if (pErr) throw pErr;
    let n = (priors ?? []).reduce((m, r) => Math.max(m, r.shot_number ?? 0), 0);
    const rows = plan.inserts.map((w) => {
      n += 1;
      return { ...(toUpdate(w) as object), project_id: projectId, user_id: userId, shot_number: n, status: "planned" } as TablesInsert<"shots">;
    });
    const { data, error } = await supabase.from("shots").insert(rows).select("id");
    if (error) throw new Error(`could not create the boxes: ${error.message}`);
    for (const r of data ?? []) inserted.push(r.id);
  }
  return { updated, inserted };
}

export function useWriteBoxes(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (plan: { updates?: { id: string; write: BoxWrite }[]; inserts?: BoxWrite[] }) => writeBoxes(projectId, plan),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: storyboardKeys.boxes(projectId) });
      void qc.invalidateQueries({ queryKey: shotsKeys.forProject(projectId) });
    },
  });
}

/**
 * Remove a box record — only ever the later half of a merge, after its footage has moved to the survivor. Assets
 * that pointed at it are re-pointed first, so nothing loses its home.
 */
export async function removeMergedBox(projectId: string, removedId: string, survivorId: string): Promise<void> {
  const { error: aErr } = await supabase.from("project_assets").update({ shot_id: survivorId }).eq("project_id", projectId).eq("shot_id", removedId);
  if (aErr) throw new Error(`could not move the box's files: ${aErr.message}`);
  const { error } = await supabase.from("shots").delete().eq("id", removedId);
  if (error) throw new Error(`could not remove the merged box: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

type AssignmentRow = {
  id: string;
  project_id: string;
  shot_id: string;
  asset_id: string;
  role: string;
  source_in_seconds: number | null;
  source_out_seconds: number | null;
  is_primary: boolean;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function assignmentFromRow(r: AssignmentRow): Assignment {
  return {
    id: r.id,
    projectId: r.project_id,
    shotId: r.shot_id,
    assetId: r.asset_id,
    role: r.role as AssignmentRole,
    sourceIn: r.source_in_seconds,
    sourceOut: r.source_out_seconds,
    isPrimary: r.is_primary,
    sortOrder: r.sort_order,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchAssignments(projectId: string): Promise<Assignment[]> {
  const { data, error } = await supabase.from("shot_asset_assignments").select("*").eq("project_id", projectId);
  if (error) throw error;
  return ((data ?? []) as AssignmentRow[]).map(assignmentFromRow);
}

export function useAssignments(projectId: string | undefined) {
  return useQuery<Assignment[]>({
    queryKey: storyboardKeys.assignments(projectId ?? "_none_"),
    queryFn: () => fetchAssignments(projectId!),
    enabled: !!projectId,
    staleTime: 15_000,
  });
}

/** Carry an assignment plan to the table. Unselects run first so a box never shows two selected items mid-way. */
export async function applyAssignmentOps(projectId: string, ops: readonly AssignmentOp[]): Promise<void> {
  const now = new Date().toISOString();
  const ordered = [
    ...ops.filter((o) => o.op === "update" && o.patch.is_primary === false),
    ...ops.filter((o) => o.op === "delete"),
    ...ops.filter((o) => o.op === "update" && o.patch.is_primary !== false),
    ...ops.filter((o) => o.op === "insert"),
  ];
  for (const o of ordered) {
    if (o.op === "update") {
      const { error } = await supabase.from("shot_asset_assignments").update({ ...o.patch, updated_at: now }).eq("id", o.id);
      if (error) throw new Error(`could not update the box's footage: ${error.message}`);
    } else if (o.op === "delete") {
      const { error } = await supabase.from("shot_asset_assignments").delete().eq("id", o.id);
      if (error) throw new Error(`could not take the footage off the box: ${error.message}`);
    } else {
      const { error } = await supabase.from("shot_asset_assignments").upsert(
        {
          project_id: projectId,
          shot_id: o.shotId,
          asset_id: o.assetId,
          role: o.role,
          is_primary: o.isPrimary,
          source_in_seconds: o.sourceIn,
          source_out_seconds: o.sourceOut,
          sort_order: o.sortOrder,
          updated_at: now,
        },
        { onConflict: "shot_id,asset_id,role" },
      );
      if (error) throw new Error(`could not put the footage on the box: ${error.message}`);
    }
  }
}

export function useApplyAssignmentOps(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ops: readonly AssignmentOp[]) => applyAssignmentOps(projectId, ops),
    onSettled: () => void qc.invalidateQueries({ queryKey: storyboardKeys.assignments(projectId) }),
  });
}

// ---------------------------------------------------------------------------
// Take syncs
// ---------------------------------------------------------------------------

type SyncRow = {
  id: string;
  project_id: string;
  song_asset_id: string | null;
  performance_asset_id: string | null;
  offset_seconds: number;
  drift_ppm: number;
  method: string;
  status: string;
  confidence_json: unknown;
  notes: string | null;
  updated_at: string;
};

function syncFromRow(r: SyncRow): TakeSync | null {
  if (!r.performance_asset_id) return null;
  return {
    id: r.id,
    projectId: r.project_id,
    songAssetId: r.song_asset_id,
    performanceAssetId: r.performance_asset_id,
    offsetSeconds: Number(r.offset_seconds),
    driftPpm: Number(r.drift_ppm),
    method: r.method,
    status: r.status as TakeSync["status"],
    confidence: (r.confidence_json && typeof r.confidence_json === "object" && "windowsTotal" in (r.confidence_json as object)
      ? r.confidence_json
      : undefined) as TakeSync["confidence"],
    notes: r.notes ?? undefined,
    updatedAt: r.updated_at,
  };
}

export async function fetchTakeSyncs(projectId: string): Promise<TakeSync[]> {
  const { data, error } = await supabase.from("performance_syncs").select("*").eq("project_id", projectId);
  if (error) throw error;
  return ((data ?? []) as SyncRow[]).map(syncFromRow).filter((s): s is TakeSync => !!s);
}

export function useTakeSyncs(projectId: string | undefined) {
  return useQuery<TakeSync[]>({
    queryKey: storyboardKeys.syncs(projectId ?? "_none_"),
    queryFn: () => fetchTakeSyncs(projectId!),
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export type SaveTakeSyncInput = {
  performanceAssetId: string;
  songAssetId: string | null;
  offsetSeconds: number;
  driftPpm?: number;
  method: string;
  status: TakeSync["status"];
  confidence?: unknown;
  notes?: string | null;
};

/** One sync per take: saving again replaces it. The storyboard never re-measures; it reads this. */
export function useSaveTakeSync(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveTakeSyncInput) => {
      const { error } = await supabase.from("performance_syncs").upsert(
        {
          project_id: projectId,
          performance_asset_id: input.performanceAssetId,
          song_asset_id: input.songAssetId,
          offset_seconds: input.offsetSeconds,
          drift_ppm: input.driftPpm ?? 0,
          method: input.method,
          status: input.status,
          confidence_json: (input.confidence ?? {}) as Json,
          notes: input.notes ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id,performance_asset_id" },
      );
      if (error) throw new Error(`could not save the take's sync: ${error.message}`);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: storyboardKeys.syncs(projectId) }),
  });
}

// ---------------------------------------------------------------------------
// Assets as media
// ---------------------------------------------------------------------------

type Meta = { bucket?: string; mime_type?: string; original_filename?: string; duration_seconds?: number | string; provider_job_id?: string };

export function bucketOfAsset(a: Pick<ProjectAsset, "asset_type" | "metadata_json">): string {
  const meta = (a.metadata_json ?? {}) as Meta;
  if (typeof meta.bucket === "string" && meta.bucket) return meta.bucket;
  if (a.asset_type === "audio") return "project-audio";
  return bucketForAssetType(a.asset_type);
}

export function mediaAssetOf(a: ProjectAsset): MediaAsset {
  const meta = (a.metadata_json ?? {}) as Meta;
  const bucket = bucketOfAsset(a);
  const mime = meta.mime_type ?? null;
  const isVideo = a.asset_type !== "audio" && isVideoPath(a.file_url, mime);
  const isImage = isImagePath(a.file_url, mime);
  const scrub = isVideo ? resolveScrubSource(bucket, a.file_url, a.metadata_json) : null;
  const duration = Number(meta.duration_seconds);
  const footageRole = (a as { footage_role?: string | null }).footage_role ?? null;
  return {
    id: a.id,
    assetType: a.asset_type,
    footageRole: footageRole === "performance" || footageRole === "b_roll" || footageRole === "reference" ? footageRole : null,
    bucket,
    path: a.file_url,
    playback: scrub?.isProxy ? { bucket: scrub.bucket, path: scrub.path } : null,
    name: meta.original_filename ?? a.notes ?? a.file_url.split("/").pop() ?? a.id,
    mime,
    isVideo,
    isImage,
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
    shotId: a.shot_id,
    sourceTool: a.source_tool,
    providerJobId: meta.provider_job_id ?? null,
    createdAt: a.created_at,
    derivedFrom: derivedOf(a.metadata_json),
    shows: typeof (a.metadata_json as { shows?: unknown } | null)?.shows === "string" ? ((a.metadata_json as { shows: string }).shows.trim() || null) : null,
  };
}

function derivedOf(meta: unknown): MediaAsset["derivedFrom"] {
  const d = (meta as { derived_from?: { asset_id?: unknown; song_start?: unknown } } | null)?.derived_from;
  if (!d || typeof d.asset_id !== "string") return null;
  return { assetId: d.asset_id, songStart: typeof d.song_start === "number" ? d.song_start : null };
}

/** Say what a piece of footage shows (wardrobe, place). Kept on the asset; the file is not touched. */
export function useSetFootageShows(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ assetId, shows }: { assetId: string; shows: string }) => {
      const { data, error } = await supabase.from("project_assets").select("metadata_json").eq("id", assetId).single();
      if (error) throw new Error(`could not read the footage: ${error.message}`);
      const meta = { ...((data?.metadata_json ?? {}) as Record<string, unknown>) };
      const text = shows.trim();
      if (text) meta.shows = text;
      else delete meta.shows;
      const { error: upErr } = await supabase.from("project_assets").update({ metadata_json: meta as never }).eq("id", assetId);
      if (upErr) throw new Error(`could not save the description: ${upErr.message}`);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: projectAssetsKeys.forProject(projectId) }),
  });
}

/** Every asset of the project as media, by id, plus the song. */
export function useProjectMedia(projectId: string | undefined) {
  const assetsQuery = useProjectAssets(projectId);
  // the song is its own query: the asset list leaves the audio asset out
  const songQuery = useProjectAudio(projectId);
  const media = useMemo(() => {
    const all = (assetsQuery.data ?? []).map(mediaAssetOf);
    return { list: all, byId: new Map(all.map((a) => [a.id, a])) };
  }, [assetsQuery.data]);
  return {
    ...media,
    song: songQuery.data ?? null,
    isLoading: assetsQuery.isLoading || songQuery.isLoading,
    error: assetsQuery.error ?? songQuery.error,
    refetch: assetsQuery.refetch,
  };
}

/** Say what a piece of footage is (or clear it). The file is not touched. */
export function useSetFootageRole(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ assetId, role }: { assetId: string; role: FootageRole | null }) => {
      const { error } = await supabase.from("project_assets").update({ footage_role: role }).eq("id", assetId);
      if (error) throw new Error(`could not mark the footage: ${error.message}`);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: projectAssetsKeys.forProject(projectId) }),
  });
}
