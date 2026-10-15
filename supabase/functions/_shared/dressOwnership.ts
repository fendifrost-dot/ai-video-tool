// Who owns what a dressed job names — checked on the server before anything is downloaded or filed.
//
// A dress job's row is written by the browser (and an imported swap entirely so). The ids in it — the project, the
// parent take, the registered cut, the shot — are therefore claims, and under the open RLS policies (SEC-4) a row can
// name another tenant's records. Nothing here trusts them: every id is read back with the service role and held
// against the job's own user and project. A job that fails is failed with the reason and never filed.
//
// The lookups take a client with the supabase-js query shape (`from().select().eq().maybeSingle()`), so the same
// code runs in the edge function and under test with a mocked client. The decision itself is pure.

import type { DressedFrom, ProgressJob } from "./jobProgress.ts";

/** What the tables say about the records a dressed job names. Null = the record is not there. */
export type OwnershipFacts = {
  projectOwner: string | null;
  sourceAssetProject: string | null;
  /** Undefined when the job names no registered cut. */
  cutAssetProject: string | null | undefined;
  shot: { projectId: string; variationId: string | null } | null;
  /** The project of the shot's variation (undefined when the shot has none). */
  variationProject: string | null | undefined;
};

/** The slice of a supabase-js client the lookups use: from(table).select(cols).eq(k, v)…maybeSingle(). */
type Query = {
  select: (cols: string) => Query;
  eq: (k: string, v: string) => Query;
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
};
type Client = { from: (table: string) => Query };

async function one<T>(
  client: Client,
  table: string,
  select: string,
  where: Record<string, string>,
): Promise<T | null> {
  let q = client.from(table).select(select);
  for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`could not read ${table}: ${error.message}`);
  return (data ?? null) as T | null;
}

/** Read every record the job names. Throws on a read error (the job is retried); a missing record is a fact. */
export async function dressOwnershipFacts(
  client: Client,
  job: ProgressJob,
  dressed: DressedFrom,
  shotId: string | null,
): Promise<OwnershipFacts> {
  const cutAssetId =
    typeof dressed.record.cutAssetId === "string" && dressed.record.cutAssetId
      ? dressed.record.cutAssetId
      : null;
  const project = await one<{ user_id: string }>(client, "video_projects", "user_id", {
    id: job.project_id,
  });
  const source = await one<{ project_id: string }>(client, "project_assets", "project_id", {
    id: dressed.sourceAssetId,
  });
  const cut = cutAssetId
    ? await one<{ project_id: string }>(client, "project_assets", "project_id", { id: cutAssetId })
    : undefined;
  const shot = shotId
    ? await one<{ project_id: string; variation_id: string | null }>(
        client,
        "shots",
        "project_id, variation_id",
        { id: shotId },
      )
    : null;
  const variation = shot?.variation_id
    ? await one<{ project_id: string }>(client, "video_variations", "project_id", {
        id: shot.variation_id,
      })
    : undefined;
  return {
    projectOwner: project?.user_id ?? null,
    sourceAssetProject: source?.project_id ?? null,
    cutAssetProject: cut === undefined ? undefined : (cut?.project_id ?? null),
    shot: shot ? { projectId: shot.project_id, variationId: shot.variation_id ?? null } : null,
    variationProject: variation === undefined ? undefined : (variation?.project_id ?? null),
  };
}

/** Why the job may not be filed, in order found. Empty = everything it names is its own. Pure. */
export function checkDressOwnership(
  job: Pick<ProgressJob, "user_id" | "project_id">,
  dressed: DressedFrom,
  shotId: string | null,
  facts: OwnershipFacts,
): string[] {
  const why: string[] = [];
  if (!facts.projectOwner) why.push("the job's project does not exist");
  else if (facts.projectOwner !== job.user_id)
    why.push("the job's project belongs to another user");
  if (!facts.sourceAssetProject) why.push("the parent take does not exist");
  else if (facts.sourceAssetProject !== job.project_id)
    why.push("the parent take belongs to another project");
  if (facts.cutAssetProject !== undefined) {
    if (!facts.cutAssetProject) why.push("the registered cut does not exist");
    else if (facts.cutAssetProject !== job.project_id)
      why.push("the registered cut belongs to another project");
  }
  if (!shotId) why.push("the job names no shot");
  else if (!facts.shot) why.push("the shot does not exist");
  else {
    if (facts.shot.projectId !== job.project_id) why.push("the shot belongs to another project");
    if (facts.shot.variationId) {
      if (!facts.variationProject) why.push("the shot's variation does not exist");
      else if (facts.variationProject !== job.project_id)
        why.push("the shot's variation belongs to another project");
    }
    const recorded = typeof dressed.record.shotId === "string" ? dressed.record.shotId : null;
    if (recorded && recorded !== shotId)
      why.push("the dress record names a different shot than the job");
  }
  return why;
}
