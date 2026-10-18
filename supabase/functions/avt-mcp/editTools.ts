// Cut tools for avt-mcp. They read and write edit_* only. A render plan costs 0 and does not call a provider.
import {
  assertPlanSafe,
  planRender,
  sequenceFromRows,
  sequenceToRows,
  type EditSequence,
  type RenderAspect,
  type RenderKind,
} from "../edit-render/model.ts";

type Row = Record<string, unknown>;
type Result<T> = { data: T; error: { message: string } | null };

/** The slice of the PostgREST builder these tools use. The caller passes the user-scoped client. */
interface Filter extends PromiseLike<Result<Row[] | null>> {
  select(columns: string): Filter;
  eq(column: string, value: string): Filter;
  order(column: string, options: { ascending: boolean }): Filter;
  limit(count: number): Filter;
  maybeSingle(): Promise<Result<Row | null>>;
  upsert(values: unknown): Promise<{ error: { message: string } | null }>;
  insert(values: unknown): Promise<{ error: { message: string } | null }>;
}

type Db = {
  from: (table: string) => Filter;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

export async function editList(db: Db, projectId: string) {
  const { data, error } = await db
    .from("edit_sequences")
    .select("id, name, version_number, fps, width, height, updated_at")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function editGet(db: Db, sequenceId: string) {
  const { data: sequence, error } = await db
    .from("edit_sequences")
    .select("*")
    .eq("id", sequenceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!sequence) throw new Error("sequence not found");
  const { data: clips, error: cErr } = await db
    .from("edit_clips")
    .select("*")
    .eq("sequence_id", sequenceId);
  if (cErr) throw new Error(cErr.message);
  const { data: markers, error: mErr } = await db
    .from("edit_markers")
    .select("*")
    .eq("sequence_id", sequenceId);
  if (mErr) throw new Error(mErr.message);
  return sequenceFromRows(sequence, clips ?? [], markers ?? []);
}

export async function editSave(db: Db, sequence: EditSequence, commit: boolean) {
  const { data } = await db.auth.getUser();
  if (!data.user) throw new Error("not signed in");
  const rows = sequenceToRows(sequence, data.user.id);
  const { error } = await db.from("edit_sequences").upsert(rows.sequence);
  if (error) throw new Error(error.message);
  if (rows.clips.length) {
    const { error: cErr } = await db.from("edit_clips").upsert(rows.clips);
    if (cErr) throw new Error(cErr.message);
  }
  if (rows.markers.length) {
    const { error: mErr } = await db.from("edit_markers").upsert(rows.markers);
    if (mErr) throw new Error(mErr.message);
  }
  if (commit) {
    const { error: vErr } = await db.from("edit_sequence_versions").insert({
      sequence_id: rows.sequence.id,
      user_id: data.user.id,
      version_number: sequence.version,
      summary: "committed from avt_edit_save",
      snapshot: sequence,
    });
    if (vErr) throw new Error(vErr.message);
  }
  return { id: rows.sequence.id, clips: rows.clips.length, committed: commit };
}

export async function editRender(
  db: Db,
  args: { sequenceId: string; dryRun: boolean; kind?: RenderKind; aspect?: RenderAspect },
) {
  const seq = await editGet(db, args.sequenceId);
  const plan = planRender(seq, { kind: args.kind ?? "proxy", aspect: args.aspect ?? "9:16" });
  assertPlanSafe(plan);
  if (args.dryRun) return { dryRun: true, costUsd: 0, plan };
  const { data } = await db.auth.getUser();
  if (!data.user) throw new Error("not signed in");
  const { data: row, error } = await db
    .from("edit_renders")
    .insert({
      sequence_id: args.sequenceId,
      user_id: data.user.id,
      kind: plan.kind,
      status: "queued",
      plan,
      cost_usd: 0,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { dryRun: false, costUsd: 0, renderId: row.id, plan };
}
