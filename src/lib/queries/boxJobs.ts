/**
 * The jobs the storyboard started (Generate image / Generate clip), read from their rows.
 *
 * A clip takes minutes, and it finishes on the SERVER: the edge function `provider-jobs-tick` asks the provider,
 * saves the clip and puts it on the shot it was made for, once a minute, whether or not this page — or any page — is
 * open (supabase/migrations/20261003200000_provider_job_progress.sql). This hook shows where each shot's job stands
 * and, while one is unfinished, asks the server for a tick so a watched job does not wait for the next minute. It
 * does none of the work: closing the page stops nothing, and reopening it reads the result.
 *
 * The one thing left to the page is a CHECK, not progress: an image the server had to finish by itself (the page
 * that asked for it was closed) is on its shot unselected, marked unchecked; opening the storyboard runs the
 * stacked-panels check on it (it needs the picture decoded) and only then selects it.
 */
import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/integrations/supabase/aliases";
import { isUnfinished, useJobProgress, type ProgressRow } from "@/lib/providerJobs/progress";
import { providerJobsKeys, useProjectProviderJobs } from "@/lib/providerJobs/queries";
import { projectAssetsKeys } from "@/lib/queries/projectAssets";
import { applyAssignmentOps, fetchAssignments, storyboardKeys } from "@/lib/queries/storyboard";
import { STORYBOARD_RUN } from "@/lib/storyboard/generate";
import { planAssign, type AssignmentOp } from "@/lib/storyboard/media";
import { describeSeam, isStackedPanels, settingsOf, type BatchJobRow, type PanelSeam } from "@/lib/worldBatch";
import { browserRunnerDeps } from "@/lib/worldBatch/browserDeps";

/** A submit that has not reported a provider id after this long never will (the server marks it; this is for a backend that has not yet). */
const UNREPORTED_AFTER_MS = 10 * 60_000;

export type BoxJobStatus = {
  kind: "image" | "clip";
  state: "working" | "saving" | "failed" | "done";
  /** What to tell the director, in words. */
  message: string;
  at: string;
};

type Payload = { mode?: string; shotId?: string; settings?: Record<string, unknown> };
type JobRow = BatchJobRow & Pick<ProgressRow, "finalized_at" | "progress_note">;

/** A restaged take: the job was given a cut of a take, and its clip keeps that take's place on the song. */
export function restagedFrom(job: Pick<BatchJobRow, "request_payload_json">): { sourceAssetId: string; songStart: number; sourceWindow: [number, number] | null; seconds: number | null } | null {
  const s = settingsOf(job as BatchJobRow);
  if (!s || s.route !== "seedance_ref" || !s.sourceAssetId || typeof s.masterStart !== "number") return null;
  return { sourceAssetId: s.sourceAssetId, songStart: s.masterStart, sourceWindow: s.sourceWindow ?? null, seconds: s.sourceSeconds ?? null };
}
const payloadOf = (j: Pick<BatchJobRow, "request_payload_json">) => (j.request_payload_json ?? {}) as Payload;
const isStill = (j: Pick<BatchJobRow, "request_payload_json">) => payloadOf(j).mode === "still_only";

/** Where a box's latest job stands. Pure — exported for its tests. */
export function boxJobStatus(job: JobRow, now: number): BoxJobStatus {
  const kind = isStill(job) ? "image" : "clip";
  const at = job.created_at;
  if (job.status === "failed") return { kind, state: "failed", message: job.error_text || `the ${kind} failed`, at };
  if (job.status === "succeeded") {
    if (kind === "image") {
      return payloadOf(job).settings?.panelCheck === "pending"
        ? { kind, state: "saving", message: "image drawn while this page was closed — checking it now", at }
        : { kind, state: "done", message: "image ready", at };
    }
    const attached = !!payloadOf(job).settings?.attachedAt || !payloadOf(job).shotId;
    if (job.result_asset_id && (attached || job.finalized_at)) {
      // finished without reaching its shot (the shot is gone): said, not hidden
      return { kind, state: "done", message: attached ? "clip ready" : job.progress_note || "clip saved to the project's library", at };
    }
    // the server gave up saving it: the reason is on the job
    if (job.finalized_at) return { kind, state: "failed", message: job.error_text || job.progress_note || "the clip rendered but could not be saved — it can be saved again from Runs", at };
    return { kind, state: "saving", message: job.result_asset_id ? "clip saved — putting it on this shot" : "clip rendered — saving it to the project", at };
  }
  if (!job.external_job_id && kind === "clip" && now - Date.parse(job.created_at) > UNREPORTED_AFTER_MS) {
    return { kind, state: "failed", message: "the submit never reported back — check Runs before generating again", at };
  }
  const restaged = !!restagedFrom(job);
  return { kind, state: "working", message: kind === "image" ? "drawing the image…" : restaged ? "restaging the take — several minutes" : "rendering the clip — a few minutes", at };
}

/** The storyboard's jobs, newest first per box key. */
export function latestBoxJobs<T extends BatchJobRow>(jobs: readonly T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const j of [...jobs].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const s = settingsOf(j);
    if (!s || s.batchRun !== STORYBOARD_RUN) continue;
    if (!out.has(s.batchShotId)) out.set(s.batchShotId, j);
  }
  return out;
}

/**
 * What the check of a server-finished image decides. Pure. `seams` are the candidates' measurements, in order
 * (null = could not be measured: treated as one picture, exactly as the live check does).
 */
export function planStillCheck(input: {
  candidates: readonly { path: string; assetId: string | null }[];
  seams: readonly (PanelSeam | null)[];
  select: boolean;
}): { whole: string[]; stacked: string[]; picked: string | null; selectAssetId: string | null; removeAssetIds: string[]; error: string | null } {
  const stackedAt = input.candidates.map((_, i) => isStackedPanels(input.seams[i]));
  const whole = input.candidates.filter((_, i) => !stackedAt[i]);
  const stacked = input.candidates.filter((_, i) => stackedAt[i]);
  const picked = whole[0] ?? null;
  const worst = input.seams.find((s) => isStackedPanels(s));
  return {
    whole: whole.map((c) => c.path),
    stacked: stacked.map((c) => c.path),
    picked: picked?.path ?? null,
    selectAssetId: input.select && picked?.assetId ? picked.assetId : null,
    // a picture that is two pictures is never left on the shot
    removeAssetIds: stacked.map((c) => c.assetId).filter((x): x is string => !!x),
    error: whole.length === 0 && worst ? `every still came back as stacked panels (${describeSeam(worst)}) — describe the scene by depth (in front, behind), not by halves of the frame` : null,
  };
}

export function useBoxJobs(projectId: string) {
  const qc = useQueryClient();
  const jobsQuery = useProjectProviderJobs(projectId);
  const jobs = useMemo(
    () => ((jobsQuery.data ?? []) as unknown as JobRow[]).filter((j) => settingsOf(j)?.batchRun === STORYBOARD_RUN),
    [jobsQuery.data],
  );
  const checkTried = useRef<Set<string>>(new Set());

  const refetch = () => qc.invalidateQueries({ queryKey: providerJobsKeys.forProject(projectId) });
  const reread = async () => {
    await refetch();
    void qc.invalidateQueries({ queryKey: storyboardKeys.assignments(projectId) });
    void qc.invalidateQueries({ queryKey: storyboardKeys.syncs(projectId) });
    void qc.invalidateQueries({ queryKey: projectAssetsKeys.forProject(projectId) });
  };

  // The server moves the jobs. While one is unfinished this page asks it to, and reads the rows again.
  useJobProgress(jobs, reread);

  // An image the server finished by itself is unchecked: look at it now, and only then let it be the shot's picture.
  const toCheck = jobs.filter((j) => j.status === "succeeded" && isStill(j) && payloadOf(j).settings?.panelCheck === "pending" && !checkTried.current.has(j.id));
  const checkKey = toCheck.map((j) => j.id).join(",");
  useEffect(() => {
    if (!checkKey) return;
    void (async () => {
      const deps = await browserRunnerDeps().catch(() => null);
      if (!deps?.inspectStill) return;
      for (const j of toCheck) {
        checkTried.current.add(j.id);
        const p = payloadOf(j);
        const recorded = ((j.response_payload_json ?? {}) as { stills?: { path?: string; assetId?: string | null }[] }).stills ?? [];
        const candidates = recorded.filter((s): s is { path: string; assetId: string | null } => typeof s?.path === "string").map((s) => ({ path: s.path, assetId: s.assetId ?? null }));
        try {
          const inspect = deps.inspectStill;
          const seams = await Promise.all(candidates.map((c) => inspect(c.path).catch(() => null)));
          const plan = planStillCheck({ candidates, seams, select: p.settings?.selectStill === true });
          if (p.shotId) {
            const current = await fetchAssignments(projectId);
            const ops: AssignmentOp[] = current.filter((a) => a.shotId === p.shotId && a.role === "generated_image" && plan.removeAssetIds.includes(a.assetId)).map((a) => ({ op: "delete" as const, id: a.id }));
            if (plan.selectAssetId) ops.push(...planAssign({ assignments: current, shotId: p.shotId, assetId: plan.selectAssetId, role: "generated_image", select: true }));
            if (ops.length) await applyAssignmentOps(projectId, ops);
          }
          await supabase
            .from("provider_jobs")
            .update({
              ...(plan.error ? { status: "failed", error_text: plan.error.slice(0, 500) } : {}),
              request_payload_json: { ...p, referenceImagePath: plan.picked, settings: { ...p.settings, stillPath: plan.picked, panelCheck: plan.error ? "rejected" : "passed" } } as unknown as Json,
            } as never)
            .eq("id", j.id);
        } catch {
          // left for the next load: the pictures stay on the shot unselected and the job still says unchecked
        }
      }
      await reread();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey, projectId]);

  const byKey = useMemo(() => {
    const now = Date.now();
    const out: Record<string, BoxJobStatus> = {};
    for (const [key, job] of latestBoxJobs(jobs)) out[key] = boxJobStatus(job, now);
    return out;
  }, [jobs]);

  return { byKey, jobs, refetch, unfinished: jobs.filter(isUnfinished).length };
}
