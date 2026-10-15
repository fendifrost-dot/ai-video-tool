import { describe, expect, it } from "vitest";
import { checkDressOwnership, dressOwnershipFacts, type OwnershipFacts } from "./dressOwnership";
import type { DressedFrom, ProgressJob } from "./jobProgress";

/** A supabase-js-shaped client over a few in-memory tables: from(table).select(cols).eq(k, v)…maybeSingle(). */
function mockClient(tables: Record<string, Record<string, unknown>[]>, failing: string[] = []) {
  const reads: { table: string; where: Record<string, string> }[] = [];
  const client = {
    from(table: string) {
      const where: Record<string, string> = {};
      const q = {
        select: () => q,
        eq: (k: string, v: string) => {
          where[k] = v;
          return q;
        },
        maybeSingle: async () => {
          reads.push({ table, where });
          if (failing.includes(table))
            return { data: null, error: { message: "connection reset" } };
          const row = (tables[table] ?? []).find((r) =>
            Object.entries(where).every(([k, v]) => r[k] === v),
          );
          return { data: row ?? null, error: null };
        },
      };
      return q;
    },
  };
  return { client, reads };
}

const job = { id: "job_1", user_id: "user_1", project_id: "proj_1" } as ProgressJob;
const dressed: DressedFrom = {
  sourceAssetId: "take_1",
  songStart: 1,
  window: [1, 5],
  sourceSeconds: 4,
  record: { cutAssetId: "cut_1", shotId: "shot_1" },
};

const own = {
  video_projects: [
    { id: "proj_1", user_id: "user_1" },
    { id: "proj_2", user_id: "user_2" },
  ],
  project_assets: [
    { id: "take_1", project_id: "proj_1" },
    { id: "cut_1", project_id: "proj_1" },
    { id: "take_other", project_id: "proj_2" },
  ],
  shots: [
    { id: "shot_1", project_id: "proj_1", variation_id: "var_1" },
    { id: "shot_other", project_id: "proj_2", variation_id: "var_2" },
    { id: "shot_legacy", project_id: "proj_1", variation_id: null },
  ],
  video_variations: [
    { id: "var_1", project_id: "proj_1" },
    { id: "var_2", project_id: "proj_2" },
  ],
};

describe("reading what a dressed job names, through a mocked client", () => {
  it("reads the project, the take, the cut, the shot and its variation by id", async () => {
    const { client, reads } = mockClient(own);
    const facts = await dressOwnershipFacts(client, job, dressed, "shot_1");
    expect(facts).toEqual({
      projectOwner: "user_1",
      sourceAssetProject: "proj_1",
      cutAssetProject: "proj_1",
      shot: { projectId: "proj_1", variationId: "var_1" },
      variationProject: "proj_1",
    });
    expect(reads.map((r) => `${r.table}:${Object.values(r.where).join(",")}`)).toEqual([
      "video_projects:proj_1",
      "project_assets:take_1",
      "project_assets:cut_1",
      "shots:shot_1",
      "video_variations:var_1",
    ]);
    expect(checkDressOwnership(job, dressed, "shot_1", facts)).toEqual([]);
  });

  it("a job without a registered cut reads no cut; a shot without a variation reads no variation", async () => {
    const { client } = mockClient(own);
    const facts = await dressOwnershipFacts(
      client,
      job,
      { ...dressed, record: { shotId: "shot_legacy" } },
      "shot_legacy",
    );
    expect(facts.cutAssetProject).toBeUndefined();
    expect(facts.variationProject).toBeUndefined();
    expect(
      checkDressOwnership(
        job,
        { ...dressed, record: { shotId: "shot_legacy" } },
        "shot_legacy",
        facts,
      ),
    ).toEqual([]);
  });

  it("a read error is thrown (the job is retried), not read as 'missing'", async () => {
    const { client } = mockClient(own, ["project_assets"]);
    await expect(dressOwnershipFacts(client, job, dressed, "shot_1")).rejects.toThrow(
      /could not read project_assets: connection reset/,
    );
  });
});

describe("the decision", () => {
  const good: OwnershipFacts = {
    projectOwner: "user_1",
    sourceAssetProject: "proj_1",
    cutAssetProject: "proj_1",
    shot: { projectId: "proj_1", variationId: "var_1" },
    variationProject: "proj_1",
  };
  const why = (
    f: Partial<OwnershipFacts>,
    shotId: string | null = "shot_1",
    d: DressedFrom = dressed,
  ) => checkDressOwnership(job, d, shotId, { ...good, ...f });

  it("names every record that is not the job's own", () => {
    expect(why({ projectOwner: "user_2" })).toEqual(["the job's project belongs to another user"]);
    expect(why({ projectOwner: null })).toEqual(["the job's project does not exist"]);
    expect(why({ sourceAssetProject: "proj_2" })).toEqual([
      "the parent take belongs to another project",
    ]);
    expect(why({ sourceAssetProject: null })).toEqual(["the parent take does not exist"]);
    expect(why({ cutAssetProject: "proj_2" })).toEqual([
      "the registered cut belongs to another project",
    ]);
    expect(why({ cutAssetProject: null })).toEqual(["the registered cut does not exist"]);
    expect(
      why({ shot: { projectId: "proj_2", variationId: "var_2" }, variationProject: "proj_2" }),
    ).toEqual([
      "the shot belongs to another project",
      "the shot's variation belongs to another project",
    ]);
    expect(why({ shot: null })).toEqual(["the shot does not exist"]);
    expect(why({ variationProject: null })).toEqual(["the shot's variation does not exist"]);
    expect(why({}, null)).toEqual(["the job names no shot"]);
    expect(why({}, "shot_1", { ...dressed, record: { shotId: "shot_9" } })).toEqual([
      "the dress record names a different shot than the job",
    ]);
  });

  it("collects several reasons at once", () => {
    expect(why({ projectOwner: "user_2", sourceAssetProject: "proj_2" })).toHaveLength(2);
  });
});
