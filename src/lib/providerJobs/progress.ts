/**
 * Job progress belongs to the server (Fendi, 2026-10-03: "The browser may display progress. It must not OWN
 * progress.").
 *
 * A submitted job is moved to its end by the edge function `provider-jobs-tick` — asked once a minute by the
 * database's own scheduler whether or not anyone is looking: it asks the provider, saves the clip, puts it on its
 * shot. A page that is open does two things only: it ASKS for a tick now (so a watched job does not wait for the
 * next minute) and it READS the rows. Nothing here polls a provider, downloads a clip or assigns footage.
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

/** The slice of a job row progress is read from. */
export type ProgressRow = {
  id: string;
  status: string;
  external_job_id: string | null;
  result_asset_id: string | null;
  request_payload_json: unknown;
  /** Set by the server when it has nothing more to do for the job. (Absent on a backend that predates the column.) */
  finalized_at?: string | null;
  progress_note?: string | null;
};

type Payload = { mode?: string; shotId?: string; settings?: { attachedAt?: string; batchRun?: string } };
const payloadOf = (j: Pick<ProgressRow, "request_payload_json">) => (j.request_payload_json ?? {}) as Payload;

/** True while the server still has something to do for the job. Read from the row alone. */
export function isUnfinished(job: ProgressRow): boolean {
  if (job.finalized_at) return false;
  if (job.status === "queued" || job.status === "running") return true;
  if (job.status !== "succeeded") return false;
  const p = payloadOf(job);
  if (p.mode === "still_only") return false;
  if (!job.result_asset_id) return true;
  return !!p.shotId && !p.settings?.attachedAt;
}

export type TickReply = { ok: boolean; claimed: number; reports: { jobId: string; did: string[]; state: "finished" | "waiting" | "retry"; note?: string }[] };

/** Ask the server to move this user's jobs now. Returns null when the server could not be asked (the scheduler still runs). */
export async function nudgeJobProgress(): Promise<TickReply | null> {
  try {
    const { data, error } = await supabase.functions.invoke<TickReply>("provider-jobs-tick", { body: {} });
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

export const NUDGE_MS = 20_000;

/**
 * While any of `jobs` is unfinished: ask the server for a tick, then call `onTick` (re-read the rows). When the
 * last one finishes, `onTick` runs once more so what the server attached is read. The interval is the page's
 * patience, not the job's clock — with no page open the scheduler moves the same jobs.
 */
export function useJobProgress(jobs: readonly ProgressRow[], onTick: (reply: TickReply | null) => void | Promise<void>): void {
  const unfinished = jobs.filter(isUnfinished).map((j) => j.id).sort().join(",");
  const cb = useRef(onTick);
  cb.current = onTick;
  const had = useRef(false);
  useEffect(() => {
    if (!unfinished) {
      // the jobs that were moving are all finished: read what the server put where
      if (had.current) {
        had.current = false;
        void cb.current(null);
      }
      return;
    }
    had.current = true;
    let stop = false;
    const tick = async () => {
      const reply = await nudgeJobProgress();
      if (!stop) await cb.current(reply);
    };
    const h = setInterval(tick, NUDGE_MS);
    void tick();
    return () => {
      stop = true;
      clearInterval(h);
    };
  }, [unfinished]);
}
