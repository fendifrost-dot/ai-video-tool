/**
 * React Query bindings for provider_jobs + the generate/poll lifecycle.
 *
 * - useGenerateClip(): mutation that creates a job, then starts polling.
 *   Returns the provider_jobs row id; consumers can show status using
 *   useProviderJob() against that id.
 * - useProviderJob(id): single-row reactive query that auto-polls Control
 *   Center while the job is queued/running. Also auto-fires the server-side
 *   ingest when status flips to succeeded and result_asset_id is still null.
 * - useProjectProviderJobs(projectId): list view for a project.
 *
 * Ingest design
 *   The previous version triggered the asset write inside the setInterval
 *   transition handler — fragile, failed silently on large payloads, and
 *   never fired again if the page reloaded after the row hit succeeded.
 *   Now the trigger is data-driven: a useEffect watches the local row and
 *   calls the server-side `ingest-provider-job` edge function whenever it
 *   sees `status === "succeeded" && result_asset_id === null`. The server
 *   does the bytes round-trip (atob in Deno, no browser stack pressure)
 *   and the failure surfaces as a toast.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { ProviderJob } from "@/integrations/supabase/aliases";
import {
  createGenerationJob,
  pollJobStatus,
  triggerServerIngest,
  type GenerationInput,
} from "./api";

export const providerJobsKeys = {
  all: ["provider_jobs"] as const,
  forProject: (projectId: string) => [...providerJobsKeys.all, "project", projectId] as const,
  detail: (id: string) => [...providerJobsKeys.all, "detail", id] as const,
};

export function useProjectProviderJobs(projectId: string | undefined) {
  return useQuery<ProviderJob[]>({
    queryKey: projectId
      ? providerJobsKeys.forProject(projectId)
      : [...providerJobsKeys.all, "project", "_none_"],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("provider_jobs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
  });
}

export function useProviderJob(id: string | undefined) {
  return useQuery<ProviderJob | null>({
    queryKey: id ? providerJobsKeys.detail(id) : [...providerJobsKeys.all, "detail", "_none_"],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("provider_jobs")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    enabled: !!id,
    // Refetch every 3s while job is in-flight, plus an extra slow tick while
    // we're waiting for ingest (status=succeeded but no asset yet). Stops
    // entirely once the asset is linked.
    refetchInterval: (q) => {
      const data = q.state.data as ProviderJob | null | undefined;
      if (!data) return false;
      if (data.status === "queued" || data.status === "running") return 3000;
      if (data.status === "succeeded" && !data.result_asset_id) return 4000;
      return false;
    },
  });
}

/**
 * Backstop polling: while a job is queued/running, hit CC's status endpoint
 * every 5s. Stops once the job is terminal. The supabase row gets updated
 * by `pollJobStatus`, which the `useProviderJob` query above picks up via
 * its own refetch. Ingest is handled separately by `useIngestOnSuccess` so
 * it remains data-driven (survives page reloads, missed transitions).
 */
export function useJobPoller(id: string | undefined, providerJob: ProviderJob | null | undefined) {
  const qc = useQueryClient();
  const stoppedRef = useRef(false);
  useEffect(() => {
    if (!id || !providerJob) return;
    if (providerJob.status !== "queued" && providerJob.status !== "running") return;
    stoppedRef.current = false;

    const interval = setInterval(async () => {
      if (stoppedRef.current) return;
      try {
        const envelope = await pollJobStatus(id);
        qc.invalidateQueries({ queryKey: providerJobsKeys.detail(id) });
        if (envelope.status === "succeeded" || envelope.status === "failed") {
          stoppedRef.current = true;
          clearInterval(interval);
        }
      } catch (e) {
        console.error("pollJobStatus failed", e);
      }
    }, 5000);

    return () => {
      stoppedRef.current = true;
      clearInterval(interval);
    };
  }, [id, providerJob?.status, qc]);
}

/**
 * Data-driven ingest trigger. Watches the local provider_jobs row and, when
 * status is succeeded but result_asset_id is still null, asks the AVT
 * `ingest-provider-job` edge function to fetch the clip from CC and write
 * the project_assets row.
 *
 * Safe to mount in any component that renders a job — re-firing while the
 * server is still processing is guarded by an in-memory ref keyed off the
 * job id, and the server itself is idempotent against rows that already
 * have an asset.
 *
 * Returns `{ ingesting, error }` so the UI can show progress.
 */
export function useIngestOnSuccess(
  id: string | undefined,
  providerJob: ProviderJob | null | undefined,
): { ingesting: boolean; error: string | null } {
  const qc = useQueryClient();
  const firedRef = useRef<Set<string>>(new Set());
  const ingestingRef = useRef<boolean>(false);
  const errorRef = useRef<string | null>(null);
  // Triggering a fresh re-render after firedRef updates requires state, but
  // the parent component re-renders on jobQuery anyway. We expose a ref-like
  // snapshot.
  useEffect(() => {
    if (!id || !providerJob) return;
    if (providerJob.status !== "succeeded") return;
    if (providerJob.result_asset_id) return;
    if (firedRef.current.has(id)) return;
    firedRef.current.add(id);
    ingestingRef.current = true;
    errorRef.current = null;
    (async () => {
      try {
        const out = await triggerServerIngest(id);
        if (out.errors.length > 0) {
          const detail = out.errors[0]?.error ?? "unknown ingest error";
          errorRef.current = detail;
          toast.error(`Ingest failed: ${detail.slice(0, 160)}`);
        } else if (out.ingested.length > 0) {
          // Surface the asset landing with a tap-through to the Assets tab,
          // so users know the clip is reachable — not just that the upstream
          // job "succeeded" (the source of confusion before this iteration).
          const pid = providerJob.project_id;
          toast.success("Clip saved to Assets", {
            description: "Available now in this project's Assets tab.",
            action: pid
              ? {
                  label: "View",
                  onClick: () => {
                    if (typeof window !== "undefined") {
                      window.location.href = `/projects/${pid}/assets`;
                    }
                  },
                }
              : undefined,
            duration: 8000,
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errorRef.current = msg;
        toast.error(`Ingest failed: ${msg.slice(0, 160)}`);
        // Allow a manual retry on the next render — clear the fired flag so
        // a subsequent status flip or page reload re-attempts.
        firedRef.current.delete(id);
      } finally {
        ingestingRef.current = false;
        qc.invalidateQueries({ queryKey: providerJobsKeys.detail(id) });
        qc.invalidateQueries({ queryKey: ["project_assets"] });
      }
    })();
  }, [id, providerJob?.status, providerJob?.result_asset_id, qc]);

  return { ingesting: ingestingRef.current, error: errorRef.current };
}

export function useGenerateClip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GenerationInput) => {
      const result = await createGenerationJob(input);
      return result;
    },
    onSuccess: (result, vars) => {
      qc.invalidateQueries({ queryKey: providerJobsKeys.forProject(vars.projectId) });
      qc.invalidateQueries({ queryKey: providerJobsKeys.detail(result.providerJobRowId) });
    },
  });
}

/**
 * Backfill helper — re-runs the server-side ingest for every succeeded row
 * belonging to the caller that doesn't yet have an asset. Useful from a
 * settings page or one-shot script.
 */
export function useBackfillPendingIngests() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params?: { limit?: number }) => {
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean;
        examined: number;
        ingested: Array<{ jobId: string; assetId: string; sizeBytes: number }>;
        errors: Array<{ jobId: string; error: string }>;
      }>("ingest-provider-job", {
        body: { all: true, limit: params?.limit ?? 50 },
      });
      if (error) throw error;
      if (!data || data.ok === false) {
        throw new Error("backfill returned no payload");
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: providerJobsKeys.all });
      qc.invalidateQueries({ queryKey: ["project_assets"] });
    },
  });
}

export function useRetryJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { jobRowId: string }) => {
      const { data: row, error } = await supabase
        .from("provider_jobs")
        .select("*")
        .eq("id", params.jobRowId)
        .single();
      if (error || !row) throw new Error("provider_jobs row not found");
      const req = row.request_payload_json as Record<string, unknown>;
      return await createGenerationJob({
        provider: row.provider,
        projectId: row.project_id,
        promptId: row.prompt_id,
        shotId: (req?.shotId as string) ?? null,
        promptText: (req?.promptText as string) ?? "",
        mode: (req?.mode as GenerationInput["mode"]) ?? undefined,
        referenceImagePath: (req?.referenceImagePath as string | null) ?? null,
        modelVariant: (req?.modelVariant as string) ?? undefined,
        duration: (req?.duration as number) ?? undefined,
        aspectRatio: (req?.aspectRatio as string) ?? undefined,
        seed: (req?.seed as number) ?? undefined,
        settings: (req?.settings as Record<string, unknown>) ?? undefined,
      });
    },
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: providerJobsKeys.detail(vars.jobRowId) });
      qc.invalidateQueries({ queryKey: providerJobsKeys.all });
    },
  });
}
