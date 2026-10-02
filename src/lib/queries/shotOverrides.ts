import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ShotOverride } from "@/lib/treatment/overrides";

/**
 * Per-box manual overrides of the generated treatment (table `shot_overrides`,
 * migration 20261002130000). Keyed by ShotSpec id, because the storyboard renders
 * from `video_projects.treatment_json`, not from the `shots` table — see
 * `src/lib/treatment/overrides.ts` for what an override means.
 */

export const shotOverridesKeys = {
  all: ["shot_overrides"] as const,
  forProject: (projectId: string) => [...shotOverridesKeys.all, "project", projectId] as const,
};

type ShotOverrideRow = {
  id: string;
  project_id: string;
  spec_id: string;
  direction: string | null;
  frame?: string | null;
  camera_motion: unknown;
  framing: string | null;
  transition_in: unknown;
  required_elements: string[] | null;
  notes: string | null;
  updated_at: string;
};

/**
 * The generated Supabase types are refreshed by the migration; until then the table is
 * addressed by name (same pattern as lyricLines.ts). The shim below is deliberately a
 * narrow description of the four calls this file makes rather than `any`: the column
 * names and the awaited shapes stay checked, so a typo here is still a compile error.
 */
type QueryResult<T> = { data: T | null; error: { message: string } | null };
interface Chain<T> extends PromiseLike<QueryResult<T>> {
  eq(column: string, value: unknown): Chain<T>;
  select(columns: string): Chain<T>;
  single(): PromiseLike<QueryResult<Record<string, unknown>>>;
}
interface UntypedTable {
  select(columns: string): Chain<Record<string, unknown>[]>;
  upsert(
    values: Record<string, unknown>,
    options?: { onConflict?: string },
  ): Chain<Record<string, unknown>[]>;
  delete(): Chain<null>;
}

const table = () =>
  (supabase as unknown as { from: (t: string) => UntypedTable }).from("shot_overrides");

const SELECT =
  "id, project_id, spec_id, direction, frame, camera_motion, framing, transition_in, required_elements, notes, updated_at";

function fromRow(row: ShotOverrideRow): ShotOverride {
  return {
    specId: row.spec_id,
    direction: row.direction,
    frame: row.frame ?? null,
    cameraMotion: (row.camera_motion ?? null) as ShotOverride["cameraMotion"],
    framing: row.framing,
    transitionIn: (row.transition_in ?? null) as ShotOverride["transitionIn"],
    requiredElements: row.required_elements,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

/** Every override on a project, keyed by spec id — the shape `applyShotOverrides` takes. */
export function useShotOverrides(projectId: string | undefined) {
  return useQuery<Record<string, ShotOverride>>({
    queryKey: projectId
      ? shotOverridesKeys.forProject(projectId)
      : [...shotOverridesKeys.all, "project", "_none_"],
    queryFn: async () => {
      if (!projectId) return {};
      const { data, error } = await table().select(SELECT).eq("project_id", projectId);
      if (error) throw error;
      const map: Record<string, ShotOverride> = {};
      for (const row of (data ?? []) as unknown as ShotOverrideRow[])
        map[row.spec_id] = fromRow(row);
      return map;
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export type UpsertShotOverrideInput = {
  projectId: string;
  specId: string;
  /** Only the fields the director actually set; anything omitted is written as null (= not overridden). */
  direction?: string | null;
  frame?: string | null;
  cameraMotion?: ShotOverride["cameraMotion"];
  framing?: string | null;
  transitionIn?: ShotOverride["transitionIn"];
  requiredElements?: string[] | null;
  notes?: string | null;
};

/**
 * Write the override for one box. `user_id` is left to the column default
 * (`auth.uid()`) so the client never names an owner — RLS and the default agree
 * by construction.
 */
export function useUpsertShotOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertShotOverrideInput) => {
      const { data, error } = await table()
        .upsert(
          {
            project_id: input.projectId,
            spec_id: input.specId,
            direction: input.direction ?? null,
            frame: input.frame ?? null,
            camera_motion: input.cameraMotion ?? null,
            framing: input.framing ?? null,
            transition_in: input.transitionIn ?? null,
            required_elements: input.requiredElements ?? null,
            notes: input.notes ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "project_id,spec_id" },
        )
        .select(SELECT)
        .single();
      if (error) throw error;
      return fromRow(data as unknown as ShotOverrideRow);
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: shotOverridesKeys.forProject(input.projectId) });
    },
  });
}

/** "Reset to generated" — the row goes away and the planner takes the box back. */
export function useDeleteShotOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, specId }: { projectId: string; specId: string }) => {
      const { error } = await table().delete().eq("project_id", projectId).eq("spec_id", specId);
      if (error) throw error;
      return { projectId, specId };
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: shotOverridesKeys.forProject(input.projectId) });
    },
  });
}
