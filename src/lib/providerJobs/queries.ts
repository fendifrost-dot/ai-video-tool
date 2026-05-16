/**
 * React Query bindings for provider_jobs + the generate/poll lifecycle.
 *
 * - useGenerateClip(): mutation that creates a job, then starts polling.
 *   Returns the provider_jobs row id; consumers can show status using
 *   useProviderJob() against that id.
 * - useProviderJob(id): single-row reactive query that auto-polls Control
 *   Center while the job is queued/running, and auto-ingests the result
 *   when it succeeds.
 * - useProjectProviderJobs(projectId): list view for a project.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { ProviderJob } from "@/integrations/supabase/types";
import {
  createGenerationJob,
  fetchAndIngestResult,
  pollJobStatus,
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
    // Refetch every 3s while job is in-flight. Polling against CC happens
    // independently via useJobPoller below — this query is just for the local
    // DB read after CC moves the row forward.
    refetchInterval: (q) => {
      const data = q.state.data as ProviderJob | null | undefined;
      if (!data) return false;
      if (data.status === "queued" || data.status === "running") return 3000;
      return false;
    },
  });
}

/**
 * Backstop polling: while a job is queued/running, hit CC's status endpoint
 * every 5s. Stops once the job is terminal. The supabase row gets updated
 * by `pollJobStatus`, which the `useProviderJob` query above picks up via
 * its own refetch.
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
        if (envelope.status === "succeeded") {
          stoppedRef.current = true;
          clearInterval(interval);
          try {
            await fetchAndIngestResult(id);
          } catch (e) {
            console.error("fetchAndIngestResult failed", e);
          }
          qc.invalidateQueries({ queryKey: providerJobsKeys.detail(id) });
          qc.invalidateQueries({ queryKey: ["project_assets"] });
        }
        if (envelope.status === "failed") {
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
