import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  sequenceFromRows,
  sequenceToRows,
  type EditSequence,
} from "../../../supabase/functions/edit-render/model";

// The tables land with migration 20261018020000. The generated Database type does not
// list them until that migration is applied and types are regenerated.
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

/** Insert a sequence. Does not write shots, assignments, or syncs. */
export function useSaveEditSequence(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (seq: EditSequence) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const rows = sequenceToRows({ ...seq, projectId }, auth.user.id);
      const { error } = await db.from("edit_sequences").upsert(rows.sequence);
      if (error) throw new Error(error.message);
      if (rows.clips.length) {
        const { error: cErr } = await db.from("edit_clips").upsert(rows.clips);
        if (cErr) throw new Error(cErr.message);
      }
      if (rows.markers.length) {
        const { error: mErr } = await db.from("edit_markers").upsert(rows.markers);
        if (mErr) throw new Error(mErr.message);
      }
      return rows.sequence.id as string;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: editSequenceKeys.list(projectId) }),
  });
}
