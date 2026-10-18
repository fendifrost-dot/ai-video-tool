import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  loadProvenance,
  type EditSequence,
  type ProvenanceAsset,
  type ProvenanceDb,
  type ProvenanceJob,
} from "../../../supabase/functions/edit-render/model";

/**
 * The assets behind a cut's picture clips and every ancestor they were made from, plus the jobs that made them —
 * what applyPerformanceProvenance needs to label each clip by its real processing history.
 */
export function useSequenceProvenance(sequence: EditSequence) {
  const ids = [
    ...new Set(sequence.clips.filter((c) => c.track === "V1" && c.assetId).map((c) => c.assetId!)),
  ].sort();
  return useQuery<{ assets: Map<string, ProvenanceAsset>; jobs: Map<string, ProvenanceJob> }>({
    queryKey: ["edit-provenance", ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: () => loadProvenance(supabase as unknown as ProvenanceDb, ids),
  });
}
