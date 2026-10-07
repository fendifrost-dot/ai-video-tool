/**
 * Whether the still generator takes reference pictures, asked of the generator itself.
 *
 * A free dry-run (world-still-proxy `dryRun: true`, nothing billed): a generator that takes pictures answers
 * `referencesAccepted: true` and its limit; one that does not (deployed before reference delivery) answers without
 * them, and the storyboard then says that the pictures are NOT sent rather than hand them to a server that would drop
 * them.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type StillReferenceSupport = { accepted: boolean; max: number; model: string | null };

/** The conservative limit when the generator does not say (xAI images/edits on grok-imagine-image-quality: 3, verified 2026-09-21). */
export const DEFAULT_STILL_REFERENCE_CAP = 3;

export function readSupport(data: Record<string, unknown> | null | undefined): StillReferenceSupport {
  const accepted = data?.referencesAccepted === true;
  const max = Number(data?.maxReferences);
  return { accepted, max: accepted && Number.isFinite(max) && max >= 0 ? max : DEFAULT_STILL_REFERENCE_CAP, model: typeof data?.referenceModel === "string" ? data.referenceModel : null };
}

export function useStillReferenceSupport(projectId: string | undefined) {
  return useQuery<StillReferenceSupport>({
    queryKey: ["still_reference_support", projectId ?? "_none_"],
    enabled: !!projectId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<Record<string, unknown>>("world-still-proxy", {
        body: { projectId, prompt: "capability probe", dryRun: true, references: [] },
      });
      if (error) return { accepted: false, max: DEFAULT_STILL_REFERENCE_CAP, model: null };
      return readSupport(data);
    },
  });
}
