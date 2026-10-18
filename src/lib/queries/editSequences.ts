import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { renderIsActive, type EditRenderRow } from "@/lib/editor/renderStatus";
import {
  exportXmeml,
  sequenceFromRows,
  sequenceToRows,
  type EditSequence,
} from "../../../supabase/functions/edit-render/model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const editSequenceKeys = {
  list: (projectId: string) => ["edit-sequences", projectId] as const,
  one: (id: string) => ["edit-sequence", id] as const,
};

export type EditSequenceListRow = {
  id: string;
  name: string;
  version_number: number | null;
  fps: number | null;
  updated_at: string | null;
};

export function useEditSequences(projectId: string) {
  return useQuery({
    queryKey: editSequenceKeys.list(projectId),
    enabled: !!projectId,
    queryFn: async (): Promise<EditSequenceListRow[]> => {
      const { data, error } = await db
        .from("edit_sequences")
        .select("id, name, version_number, fps, updated_at")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as EditSequenceListRow[];
    },
  });
}

export function useEditSequence(id: string | null) {
  return useQuery({
    queryKey: editSequenceKeys.one(id ?? ""),
    enabled: !!id,
    queryFn: async () => {
      const { data: sequence, error } = await db
        .from("edit_sequences")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!sequence) return null;
      const { data: clips, error: cErr } = await db
        .from("edit_clips")
        .select("*")
        .eq("sequence_id", id!);
      if (cErr) throw new Error(cErr.message);
      const { data: markers, error: mErr } = await db
        .from("edit_markers")
        .select("*")
        .eq("sequence_id", id!);
      if (mErr) throw new Error(mErr.message);
      return sequenceFromRows(
        sequence as Record<string, unknown>,
        (clips ?? []) as Record<string, unknown>[],
        (markers ?? []) as Record<string, unknown>[],
      );
    },
  });
}

/** Upsert a sequence and drop clips/markers removed from the edit (source media stays). */
export function useSaveEditSequence(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (seq: EditSequence) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const nextVersion = Math.max(1, (seq.version || 1) + 1);
      const rows = sequenceToRows({ ...seq, projectId, version: nextVersion }, auth.user.id);
      const { error } = await db.from("edit_sequences").upsert(rows.sequence);
      if (error) throw new Error(error.message);

      const seqId = rows.sequence.id as string;
      const keepClipIds = rows.clips.map((c) => String(c.id));
      const keepMarkerIds = rows.markers.map((m) => String(m.id));

      const { data: existingClips, error: listClipErr } = await db
        .from("edit_clips")
        .select("id")
        .eq("sequence_id", seqId);
      if (listClipErr) throw new Error(listClipErr.message);
      const dropClips = ((existingClips ?? []) as { id: string }[])
        .map((r) => r.id)
        .filter((id) => !keepClipIds.includes(id));
      if (dropClips.length) {
        const { error: delErr } = await db.from("edit_clips").delete().in("id", dropClips);
        if (delErr) throw new Error(delErr.message);
      }

      const { data: existingMarkers, error: listMarkErr } = await db
        .from("edit_markers")
        .select("id")
        .eq("sequence_id", seqId);
      if (listMarkErr) throw new Error(listMarkErr.message);
      const dropMarkers = ((existingMarkers ?? []) as { id: string }[])
        .map((r) => r.id)
        .filter((id) => !keepMarkerIds.includes(id));
      if (dropMarkers.length) {
        const { error: delErr } = await db.from("edit_markers").delete().in("id", dropMarkers);
        if (delErr) throw new Error(delErr.message);
      }

      if (rows.clips.length) {
        const { error: cErr } = await db.from("edit_clips").upsert(rows.clips);
        if (cErr) throw new Error(cErr.message);
      }
      if (rows.markers.length) {
        const { error: mErr } = await db.from("edit_markers").upsert(rows.markers);
        if (mErr) throw new Error(mErr.message);
      }

      // Version snapshot for persistence audit (nondestructive).
      await db.from("edit_sequence_versions").insert({
        sequence_id: seqId,
        user_id: auth.user.id,
        version_number: rows.sequence.version_number,
        summary: "Saved from Timeline",
        snapshot: rows,
      });

      return seqId;
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: editSequenceKeys.list(projectId) });
      void qc.invalidateQueries({ queryKey: editSequenceKeys.one(id) });
    },
  });
}

export type EditRenderResult = {
  ok: boolean;
  dryRun: boolean;
  costUsd: number;
  renderId?: string;
  media?: { resolved: number; missing: string[] };
  plan?: unknown;
  note?: string;
  error?: string;
  message?: string;
};

/** Plan or queue a free ffmpeg cut. dryRun defaults true. */
export async function requestEditRender(input: {
  sequenceId: string;
  dryRun?: boolean;
  kind?: "proxy" | "final";
}): Promise<EditRenderResult> {
  const { data, error } = await supabase.functions.invoke<EditRenderResult>("edit-render", {
    body: {
      sequenceId: input.sequenceId,
      dryRun: input.dryRun !== false,
      kind: input.kind ?? "proxy",
      aspect: "9:16",
    },
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No response from edit-render");
  return data;
}

export function downloadSequenceXml(seq: EditSequence) {
  const xml = exportXmeml([seq]);
  const blob = new Blob([xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${seq.name.replace(/[^\w.-]+/g, "_") || "cut"}.xml`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Latest edit_renders row for a sequence, polled every 4 s while queued/rendering, plus a signed MP4 URL. */
export function useLatestEditRender(sequenceId: string | null | undefined) {
  return useQuery({
    queryKey: ["edit-render-latest", sequenceId],
    enabled: !!sequenceId,
    queryFn: async (): Promise<{ row: EditRenderRow | null; url: string | null }> => {
      const { data, error } = await db
        .from("edit_renders")
        .select("id,status,error,output_bucket,output_path,duration_seconds,created_at")
        .eq("sequence_id", sequenceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = (data ?? null) as EditRenderRow | null;
      let url: string | null = null;
      if (row?.status === "complete" && row.output_bucket && row.output_path) {
        const { data: signed } = await supabase.storage
          .from(row.output_bucket)
          .createSignedUrl(row.output_path, 3600);
        url = signed?.signedUrl ?? null;
      }
      return { row, url };
    },
    refetchInterval: (q) => (renderIsActive(q.state.data?.row ?? null) ? 4000 : false),
  });
}
