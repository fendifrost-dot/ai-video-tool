/**
 * The jobs the storyboard started (Generate image / Generate clip), followed to the end.
 *
 * A clip takes minutes. Its job row is the record: this hook polls the provider for the rows that are still live,
 * has the server save each finished clip, and puts the saved clip on the box it was made for — once. Everything is
 * read back from the jobs table, so closing the page loses nothing; reopening it picks the jobs up where they are.
 */
import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/integrations/supabase/aliases";
import { triggerServerIngest } from "@/lib/providerJobs/api";
import { providerJobsKeys, useProjectProviderJobs } from "@/lib/providerJobs/queries";
import { projectAssetsKeys } from "@/lib/queries/projectAssets";
import { applyAssignmentOps, fetchAssignments, storyboardKeys } from "@/lib/queries/storyboard";
import { STORYBOARD_RUN } from "@/lib/storyboard/generate";
import { planAssign } from "@/lib/storyboard/media";
import { fileRestagedClip } from "@/lib/storyboard/restage";
import { settingsOf, type BatchJobRow } from "@/lib/worldBatch";
import { pollBatchJob } from "@/lib/worldBatch/browserDeps";

const POLL_MS = 20_000;
/** A submit that has not reported a provider id after this long never will. */
const UNREPORTED_AFTER_MS = 5 * 60_000;

export type BoxJobStatus = {
  kind: "image" | "clip";
  state: "working" | "saving" | "failed" | "done";
  /** What to tell the director, in words. */
  message: string;
  at: string;
};

type Payload = { mode?: string; shotId?: string; settings?: Record<string, unknown> };

/** A restaged take: the job was given a cut of a take, and its clip keeps that take's place on the song. */
export function restagedFrom(job: Pick<BatchJobRow, "request_payload_json">): { sourceAssetId: string; songStart: number; sourceWindow: [number, number] | null; seconds: number | null } | null {
  const s = settingsOf(job as BatchJobRow);
  if (!s || s.route !== "seedance_ref" || !s.sourceAssetId || typeof s.masterStart !== "number") return null;
  return { sourceAssetId: s.sourceAssetId, songStart: s.masterStart, sourceWindow: s.sourceWindow ?? null, seconds: s.sourceSeconds ?? null };
}
const payloadOf = (j: Pick<BatchJobRow, "request_payload_json">) => (j.request_payload_json ?? {}) as Payload;
const isStill = (j: Pick<BatchJobRow, "request_payload_json">) => payloadOf(j).mode === "still_only";

/** Where a box's latest job stands. Pure — exported for its tests. */
export function boxJobStatus(job: BatchJobRow, now: number): BoxJobStatus {
  const kind = isStill(job) ? "image" : "clip";
  const at = job.created_at;
  if (job.status === "failed") return { kind, state: "failed", message: job.error_text || `the ${kind} failed`, at };
  if (job.status === "succeeded") {
    if (kind === "image" || job.result_asset_id) return { kind, state: "done", message: kind === "image" ? "image ready" : "clip ready", at };
    return { kind, state: "saving", message: "clip rendered — saving it to the project", at };
  }
  if (!job.external_job_id && now - Date.parse(job.created_at) > UNREPORTED_AFTER_MS) {
    return { kind, state: "failed", message: "the submit never reported back — check Runs before generating again", at };
  }
  const restaged = !!restagedFrom(job);
  return { kind, state: "working", message: kind === "image" ? "drawing the image…" : restaged ? "restaging the take — several minutes" : "rendering the clip — a few minutes", at };
}

/** The storyboard's jobs, newest first per box key. */
export function latestBoxJobs(jobs: readonly BatchJobRow[]): Map<string, BatchJobRow> {
  const out = new Map<string, BatchJobRow>();
  for (const j of [...jobs].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const s = settingsOf(j);
    if (!s || s.batchRun !== STORYBOARD_RUN) continue;
    if (!out.has(s.batchShotId)) out.set(s.batchShotId, j);
  }
  return out;
}

export function useBoxJobs(projectId: string) {
  const qc = useQueryClient();
  const jobsQuery = useProjectProviderJobs(projectId);
  const jobs = useMemo(
    () => ((jobsQuery.data ?? []) as unknown as BatchJobRow[]).filter((j) => settingsOf(j)?.batchRun === STORYBOARD_RUN),
    [jobsQuery.data],
  );
  const ingestTried = useRef<Set<string>>(new Set());
  const attachTried = useRef<Set<string>>(new Set());

  const refetch = () => qc.invalidateQueries({ queryKey: providerJobsKeys.forProject(projectId) });

  // 1. ask the provider about the clips still rendering
  const live = jobs.filter((j) => (j.status === "queued" || j.status === "running") && j.external_job_id);
  const liveKey = live.map((j) => j.id).join(",");
  useEffect(() => {
    if (!liveKey) return;
    let stop = false;
    const tick = async () => {
      for (const j of live) {
        if (stop) return;
        await pollBatchJob(j).catch(() => undefined);
      }
      if (!stop) await refetch();
    };
    const h = setInterval(tick, POLL_MS);
    void tick();
    return () => {
      stop = true;
      clearInterval(h);
    };
    // `live` is derived from liveKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, projectId]);

  // 2. have the server save each finished clip
  const toIngest = jobs.filter((j) => j.status === "succeeded" && !j.result_asset_id && !isStill(j) && !ingestTried.current.has(j.id));
  const ingestKey = toIngest.map((j) => j.id).join(",");
  useEffect(() => {
    if (!ingestKey) return;
    for (const j of toIngest) {
      ingestTried.current.add(j.id);
      void triggerServerIngest(j.id)
        .catch(() => undefined)
        .then(() => {
          void refetch();
          void qc.invalidateQueries({ queryKey: projectAssetsKeys.forProject(projectId) });
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingestKey, projectId]);

  // 3. put each saved clip on its box, once (the job remembers, so taking the clip off the box later stays taken off)
  const toAttach = jobs.filter(
    (j) => j.status === "succeeded" && j.result_asset_id && !isStill(j) && payloadOf(j).shotId && !payloadOf(j).settings?.attachedAt && !attachTried.current.has(j.id),
  );
  const attachKey = toAttach.map((j) => j.id).join(",");
  useEffect(() => {
    if (!attachKey) return;
    void (async () => {
      for (const j of toAttach) {
        attachTried.current.add(j.id);
        const p = payloadOf(j);
        try {
          // a restaged take is filed as a take in sync before it is put on the shot, so the shot plays it by the song clock
          const restaged = restagedFrom(j);
          if (restaged) await fileRestagedClip({ projectId, assetId: j.result_asset_id!, ...restaged });
          const ops = planAssign({ assignments: await fetchAssignments(projectId), shotId: p.shotId!, assetId: j.result_asset_id!, role: restaged ? "performance" : "generated_clip", select: true });
          await applyAssignmentOps(projectId, ops);
          await supabase
            .from("provider_jobs")
            .update({ request_payload_json: { ...p, settings: { ...p.settings, attachedAt: new Date().toISOString() } } as unknown as Json })
            .eq("id", j.id);
        } catch {
          // left for the next load: the clip is saved and listed in the box's media picker either way
        }
      }
      void qc.invalidateQueries({ queryKey: storyboardKeys.assignments(projectId) });
      void qc.invalidateQueries({ queryKey: storyboardKeys.syncs(projectId) });
      void qc.invalidateQueries({ queryKey: projectAssetsKeys.forProject(projectId) });
      void refetch();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachKey, projectId]);

  const byKey = useMemo(() => {
    const now = Date.now();
    const out: Record<string, BoxJobStatus> = {};
    for (const [key, job] of latestBoxJobs(jobs)) out[key] = boxJobStatus(job, now);
    return out;
  }, [jobs]);

  return { byKey, jobs, refetch };
}
