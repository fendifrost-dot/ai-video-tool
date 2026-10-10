/**
 * The MCP driver for stills (see README.md): the app's own still flow — generate.ts / runner.ts — run outside the
 * browser, with an AI performing each effect through the AVT MCP and writing the answer back.
 *
 *   npx tsx scripts/mcp/still.ts <workdir> bundle            → the reads to perform (avt_select) into <workdir>/bundle/
 *   npx tsx scripts/mcp/still.ts <workdir> entity <KEY>      → reference pictures of a continuity entity
 *   npx tsx scripts/mcp/still.ts <workdir> shot <c0NN>       → the still of a storyboard box, put on the box
 *
 * Prints `PENDING {id, tool, args}` and exits 3 when an effect needs the AI; the AI writes
 * <workdir>/answers/<id>.json and runs the command again. Prints `DONE {...}` and exits 0 when finished.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { boxFromRow, boxesFromRows, type BoxRow } from "@/lib/storyboard/boxes";
import {
  entityFromRow,
  indexEntities,
  resolveContinuity,
  type ContinuityEntity,
  type LookRef,
} from "@/lib/continuity/entities";
import { resolveCast, castProblems } from "@/lib/casting/cast";
import { linksOfBox, linkPictureNeeds, linkPromptLines } from "@/lib/storyboard/links";
import { planStillReferences, type StillReference } from "@/lib/storyboard/references";
import {
  boxPromptConflicts,
  boxShot,
  clipShot,
  clipTemporalPlan,
  entityShot,
  madeFromBox,
  DEFAULT_BOX_LOOK,
  STORYBOARD_RUN,
  ENTITY_RUN,
} from "@/lib/storyboard/generate";
import { eventClock } from "@/lib/storyboard/events";
import { conflictNote } from "@/lib/storyboard/promptAudit";
import { resolveLookPreset } from "@/lib/shotCompiler/lookPresets";
import { WARDROBE_FEATURE_TYPES } from "@/lib/queries/wardrobe";
import {
  effectiveGarments,
  jobOutfitRecord,
  resolveOutfit,
  sceneFromRow,
  type OutfitRecord,
  type Scene,
  type SceneRow,
  type ShotOutfit,
} from "@/lib/wardrobe/outfits";
import {
  submitShot,
  submitStills,
  type RunnerDeps,
  type StillReferencesOnJob,
} from "@/lib/worldBatch/runner";
import { stillFailure } from "@/lib/worldBatch/requests";
import {
  boxMedia,
  imageForClip,
  planAssign,
  type Assignment,
  type MediaAsset,
} from "@/lib/storyboard/media";
import { mediaAssetOf } from "@/lib/queries/storyboard";
import { lyricLineFromRow } from "@/lib/lyrics/lyricsForShot";
import { aspectOfProject } from "@/lib/project/aspect";
import {
  baseCapOf,
  NO_STILL_REFERENCE_SUPPORT,
  readSupport,
  stillRateUsd,
  stillTierFor,
} from "@/lib/queries/stillReferences";

// ------------------------------------------------------------------------------------------------ the effect channel

/** Effects the app's flow performs, each answered by the AI through one MCP tool call; answers are kept on disk. */
class Effects {
  private n = 0;
  constructor(
    private dir: string,
    private scope: string,
  ) {
    mkdirSync(join(dir, "answers"), { recursive: true });
  }
  /**
   * One effect: the same scope, position and content always get the same id, so a replay never repeats a paid call.
   * Timestamps the app stamps on its writes (`updated_at: now`) are not content — with them in the digest a replay
   * would never find its answer and would ask the same update again on every run.
   */
  ask<T>(tool: string, args: unknown): T {
    const stable = JSON.parse(
      JSON.stringify(args, (key, value) => (key === "updated_at" ? undefined : value)),
    );
    const digest = createHash("sha256")
      .update(JSON.stringify({ scope: this.scope, n: this.n, tool, args: stable }))
      .digest("hex")
      .slice(0, 12);
    const id = `${this.scope}-${String(this.n).padStart(2, "0")}-${tool}-${digest}`;
    this.n += 1;
    const file = join(this.dir, "answers", `${id}.json`);
    if (!existsSync(file)) {
      // a hard stop, not an exception: the app's flows catch errors around their effects (a failed generator call
      // marks the job failed), and a pending answer is not a failure
      const pending = { id, tool, args };
      console.log("PENDING " + JSON.stringify(pending));
      writeFileSync(join(this.dir, "pending.json"), JSON.stringify(pending, null, 2));
      process.exit(3);
    }
    return JSON.parse(readFileSync(file, "utf8")) as T;
  }
}

// ------------------------------------------------------------------------------------------------ the bundle

type Bundle = {
  project: Record<string, unknown>;
  variationId: string;
  shots: BoxRow[];
  entities: Record<string, unknown>[];
  assets: Record<string, unknown>[];
  assignments: Record<string, unknown>[];
  lyricLines: Record<string, unknown>[];
  characterFeatures: Record<string, unknown>[];
  looks: LookRef[];
  /** The video's scenes (variation_scenes): which stretch wears which outfit. Absent = no scenes fetched: no shot inherits an outfit. */
  scenes: Record<string, unknown>[];
  support: Record<string, unknown> | null;
  /** The song analysis row (song_analyses), when fetched: its beat map is the clock timed events resolve on. */
  analysis: Record<string, unknown> | null;
};

const BUNDLE_FILES = [
  "project",
  "shots",
  "entities",
  "assets",
  "assignments",
  "lyric_lines",
  "character_features",
  "looks",
  "scenes",
  "support",
] as const;

function readBundle(dir: string): Bundle {
  const b = (name: string) => JSON.parse(readFileSync(join(dir, "bundle", `${name}.json`), "utf8"));
  const project = (b("project") as Record<string, unknown>[])[0] ?? b("project");
  const shots = b("shots") as BoxRow[];
  return {
    project,
    variationId: String(shots[0]?.variation_id ?? ""),
    shots,
    entities: b("entities"),
    assets: b("assets"),
    assignments: b("assignments"),
    lyricLines: b("lyric_lines"),
    characterFeatures: b("character_features"),
    looks: existsSync(join(dir, "bundle", "looks.json")) ? b("looks") : [],
    scenes: existsSync(join(dir, "bundle", "scenes.json")) ? b("scenes") : [],
    support: existsSync(join(dir, "bundle", "support.json")) ? b("support") : null,
    analysis: existsSync(join(dir, "bundle", "analysis.json"))
      ? ((b("analysis") as Record<string, unknown>[])[0] ?? null)
      : null,
  };
}

function assignmentFromRow(r: Record<string, unknown>): Assignment {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    shotId: String(r.shot_id),
    assetId: String(r.asset_id),
    role: r.role as Assignment["role"],
    sourceIn: (r.source_in_seconds as number | null) ?? null,
    sourceOut: (r.source_out_seconds as number | null) ?? null,
    isPrimary: r.is_primary === true,
    sortOrder: Number(r.sort_order ?? 0),
    notes: (r.notes as string | null) ?? null,
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

// ------------------------------------------------------------------------------------------------ deps over effects

/** The generator files each still as a project asset and says so (`stills[].assetId`): the attach step needs no lookup. */
const filedAssets = new Map<string, string>();

function mcpDeps(fx: Effects, userId: string): RunnerDeps {
  return {
    userId,
    sign: async (bucket, path) => {
      const r = fx.ask<{ url?: string }>("avt_signed_url", { bucket, path, expires_in: 86400 });
      if (!r.url) throw new Error(`no signed url for ${bucket}/${path}`);
      return r.url;
    },
    // the stacked-panels check reads the picture in a browser canvas; the driver does not look at pictures
    inspectStill: undefined,
    generateStills: async (body) => {
      // avt_call answers { function, http_status, answer }
      const r = fx.ask<{ http_status?: number; answer?: Record<string, unknown> }>("avt_call", {
        function: "world-still-proxy",
        method: "POST",
        body,
      });
      const data = r.answer ?? (r as unknown as Record<string, unknown>);
      if (r.http_status && r.http_status >= 400)
        return { ok: false, error: `${r.http_status} ${JSON.stringify(data).slice(0, 300)}` };
      if (data.ok === false) return { ...(data as object), ok: false, error: stillFailure(data) };
      for (const st of (data.stills as { path?: string; assetId?: string }[] | undefined) ?? [])
        if (st.path && st.assetId) filedAssets.set(st.path, st.assetId);
      return data as Awaited<ReturnType<RunnerDeps["generateStills"]>>;
    },
    insertJob: async (row) => {
      const r = fx.ask<{ rows?: { id: string }[] } | { id: string }[]>("avt_insert", {
        table: "provider_jobs",
        rows: [{ user_id: userId, ...row }],
      });
      const rows = Array.isArray(r) ? r : (r.rows ?? []);
      const id = rows[0]?.id;
      if (!id) throw new Error("the job row came back without an id");
      return id;
    },
    updateJob: async (id, patch) => {
      fx.ask("avt_update", {
        table: "provider_jobs",
        filters: [{ column: "id", op: "eq", value: id }],
        values: patch,
      });
    },
    // the page's browserDeps: proxy-provider-call carries the Control Center call; a reply with ok:false is a failure
    callProxy: async (endpoint, body) => {
      const r = fx.ask<{ http_status?: number; answer?: Record<string, unknown> }>("avt_call", {
        function: "proxy-provider-call",
        method: "POST",
        body: { endpoint, method: "POST", body },
      });
      const data = r.answer ?? (r as unknown as Record<string, unknown>);
      if ((r.http_status && r.http_status >= 400) || data.ok === false)
        throw new Error(
          `proxy-provider-call ${r.http_status ?? ""}: ${JSON.stringify(data).slice(0, 400)}`,
        );
      return data;
    },
  };
}

/** The asset id of each filed still: from the generator's answer when it said, else looked up by path. */
function assetsByPath(
  fx: Effects,
  projectId: string,
  paths: readonly string[],
): Map<string, string> {
  const out = new Map<string, string>();
  const missing: string[] = [];
  for (const p of paths) {
    const id = filedAssets.get(p);
    if (id) out.set(p, id);
    else missing.push(p);
  }
  if (missing.length) {
    const found = fx.ask<Record<string, unknown>[] | { rows: Record<string, unknown>[] }>(
      "avt_select",
      {
        table: "project_assets",
        columns: "id, file_url",
        filters: [
          { column: "project_id", op: "eq", value: projectId },
          { column: "file_url", op: "in", value: missing },
        ],
      },
    );
    for (const r of Array.isArray(found) ? found : found.rows)
      out.set(String(r.file_url), String(r.id));
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ commands

function cmdBundle(projectId: string, variationId: string, artistId: string | null) {
  // what the AI fetches with avt_select, one file each, in this order
  const reads = [
    {
      file: "project",
      tool: "avt_select",
      args: { table: "video_projects", filters: [{ column: "id", op: "eq", value: projectId }] },
    },
    {
      file: "shots",
      tool: "avt_select",
      args: {
        table: "shots",
        filters: [{ column: "variation_id", op: "eq", value: variationId }],
        order: { column: "shot_number", ascending: true },
        limit: 500,
      },
    },
    {
      file: "entities",
      tool: "avt_select",
      args: {
        table: "continuity_entities",
        filters: [
          { column: "variation_id", op: "eq", value: variationId },
          { column: "archived", op: "eq", value: false },
        ],
        limit: 500,
      },
    },
    {
      file: "assets",
      tool: "avt_select",
      args: {
        table: "project_assets",
        filters: [{ column: "project_id", op: "eq", value: projectId }],
        limit: 500,
      },
    },
    {
      file: "assignments",
      tool: "avt_select",
      args: {
        table: "shot_asset_assignments",
        filters: [{ column: "variation_id", op: "eq", value: variationId }],
        limit: 500,
      },
    },
    {
      file: "lyric_lines",
      tool: "avt_select",
      args: {
        table: "lyric_lines",
        columns: "line_index, section, text, start_seconds, end_seconds, confidence, words_json",
        filters: [{ column: "project_id", op: "eq", value: projectId }],
        order: { column: "line_index", ascending: true },
        limit: 500,
      },
    },
    {
      file: "scenes",
      tool: "avt_select",
      args: {
        table: "variation_scenes",
        filters: [{ column: "variation_id", op: "eq", value: variationId }],
        order: { column: "start_seconds", ascending: true },
        limit: 200,
      },
    },
    {
      file: "character_features",
      tool: "avt_select",
      args: {
        table: "character_features",
        filters: artistId ? [{ column: "artist_id", op: "eq", value: artistId }] : [],
        limit: 500,
      },
    },
    {
      file: "analysis",
      tool: "avt_select",
      args: {
        table: "song_analyses",
        columns: "id, beat_map_json",
        filters: [{ column: "project_id", op: "eq", value: projectId }],
        limit: 1,
      },
    },
    // the reads the other drivers need: the active video's treatment (edit.ts stamps a hand-written scene with its
    // fingerprint, as the page does), the takes' syncs and the song (the cut the board plays)
    {
      file: "direction",
      tool: "avt_select",
      args: {
        table: "video_variations",
        columns: "id, treatment_json",
        filters: [{ column: "id", op: "eq", value: variationId }],
        limit: 1,
      },
    },
    {
      file: "syncs",
      tool: "avt_select",
      args: {
        table: "performance_syncs",
        filters: [{ column: "project_id", op: "eq", value: projectId }],
        limit: 500,
      },
    },
    {
      file: "song",
      tool: "avt_select",
      args: {
        table: "project_assets",
        filters: [
          { column: "project_id", op: "eq", value: projectId },
          { column: "asset_type", op: "eq", value: "audio" },
        ],
        order: { column: "created_at", ascending: false },
        limit: 1,
      },
    },
    {
      file: "support",
      tool: "avt_call",
      args: {
        function: "world-still-proxy",
        method: "POST",
        body: { projectId, prompt: "capability probe", dryRun: true, references: [] },
      },
    },
  ];
  console.log(
    JSON.stringify(
      {
        reads,
        note: "save each result as <workdir>/bundle/<file>.json (the rows array; for support, the call's body)",
      },
      null,
      2,
    ),
  );
}

function loadWorld(dir: string) {
  const bundle = readBundle(dir);
  const project = bundle.project;
  const projectId = String(project.id);
  const userId = String(project.user_id);
  const aspect = aspectOfProject(project);
  const boxes = boxesFromRows(bundle.shots);
  const board = boxes.map((b, i) => ({ ...b, shotNumber: i + 1 }));
  const entities = bundle.entities
    .map((r) => entityFromRow(r as never))
    .filter((e): e is ContinuityEntity => !!e);
  const entityIndex = indexEntities(entities);
  const assets = new Map<string, MediaAsset>(
    bundle.assets.map((a) => [String(a.id), mediaAssetOf(a as never)]),
  );
  const assignments = bundle.assignments.map(assignmentFromRow);
  const lyricLines = bundle.lyricLines.map((r) => lyricLineFromRow(r as never));
  const features = bundle.characterFeatures as {
    id: string;
    feature_type: string;
    label: string;
    is_primary?: boolean;
    storage_path?: string | null;
  }[];
  const faces = features.filter((f) => f.feature_type === "face" && !!f.storage_path);
  const face =
    faces.find((f) => f.label === "neutral" && f.is_primary) ??
    faces.find((f) => f.is_primary) ??
    faces[0] ??
    null;
  const artistId = (project.artist_id as string | null) ?? null;
  const artistFace = face && artistId ? { id: face.id, artistId } : null;
  const wardrobe = features
    .filter((f) => (WARDROBE_FEATURE_TYPES as readonly string[]).includes(f.feature_type))
    .map((f) => ({ id: f.id, label: f.label }));
  const support = bundle.support ? readSupport(bundle.support) : NO_STILL_REFERENCE_SUPPORT;
  const scenes: Scene[] = bundle.scenes.map((r) => sceneFromRow(r as SceneRow));
  // what a box wears, as the page resolves it: the shot's own record, else its scene's outfit (wardrobe/outfits.ts)
  const outfitOf = (box: StoryboardBox): ShotOutfit =>
    resolveOutfit(box.spec, { start: box.start }, scenes, entityIndex);
  const selectedStill = (boxId: string): MediaAsset | null => {
    const box = boxes.find((b) => b.id === boxId);
    if (!box) return null;
    const pick = imageForClip(boxMedia({ box, assignments, assets, syncs: [] }).items);
    return pick && pick.asset.bucket === "project-references" ? pick.asset : null;
  };
  return {
    bundle,
    project,
    projectId,
    userId,
    aspect,
    boxes,
    board,
    entities,
    entityIndex,
    assets,
    assignments,
    lyricLines,
    artistFace,
    wardrobe,
    support,
    looks: bundle.looks,
    scenes,
    outfitOf,
    selectedStill,
  };
}

/** The still of one box, exactly as the page's "Generate image" would ask for it. */
async function cmdShot(dir: string, key: string) {
  const w = loadWorld(dir);
  const box = w.boxes.find((b) => b.key === key);
  if (!box) throw new Error(`no box ${key} on the board`);
  const continuity = resolveContinuity(box.spec, w.entityIndex, w.looks);
  const cast = resolveCast(box.spec, w.entityIndex);
  // as the page does: a blocking cast problem stops the shot; a warning or an unsaid cast is said, not stopped
  const problems = castProblems(cast);
  const blockingCast = problems.filter((p) => p.level === "blocking");
  if (blockingCast.length)
    throw new Error(`${key}: cast problems — ${blockingCast.map((p) => p.text).join("; ")}`);
  for (const p of problems) console.error(`NOTE ${key}: ${p.text}`);
  const links = linksOfBox(box, w.board);
  const linkLines = linkPromptLines(links);
  const needs = linkPictureNeeds(links).map((n) => {
    const other = n.link.other ? w.boxes.find((b) => b.key === n.link.otherKey) : null;
    const still = other ? w.selectedStill(other.id) : null;
    return { ...n, still: still ? { assetId: still.id } : null };
  });
  const extra: StillReference[] = [];
  for (const m of cast.members) {
    if (m.mode === "invent") continue;
    const own = m.entity.approvedAssetId ?? m.entity.referenceAssetIds[0] ?? null;
    if (own) extra.push({ source: "project_asset", id: own, role: "cast", label: m.entity.name });
    else if (
      m.entity.cast?.role === "primary_artist" &&
      m.entity.cast.artistId &&
      w.artistFace &&
      m.entity.cast.artistId === w.artistFace.artistId
    )
      extra.push({
        source: "character_feature",
        id: w.artistFace.id,
        role: "cast",
        label: m.entity.name,
      });
  }
  const onFile = new Map(w.wardrobe.map((g) => [g.id, g]));
  const outfit = w.outfitOf(box);
  if (outfit.missingKey)
    throw new Error(
      `${key}: wears outfit ${outfit.missingKey}, which this video has no outfit for`,
    );
  // a name the shot's own words refuse, asked for by a place, a person or the outfit: said before the first paid call,
  // as the page says it in its confirmation (promptAudit.ts). It is a note — read it and decide.
  for (const c of boxPromptConflicts(box, { continuity, cast, outfit }))
    console.log(`CHECK ${key}: ${conflictNote(c)}`);
  // the exact pieces: the shot's own, else the outfit's (the page's effectiveGarments)
  const pieces = effectiveGarments(box.spec, outfit).ids;
  const plan = planStillReferences({
    isPerformance: box.spec.shotType === "performance",
    continuity,
    linkNeeds: needs,
    garments: pieces.map((id) => ({
      id,
      onFile: onFile.has(id) ? { id, label: onFile.get(id)!.label } : null,
    })),
    extra,
    cap: w.support.max,
    baseCap: baseCapOf(w.support),
  });
  // past the usual model's limit the still is drawn on another model at another rate: said before the paid call, as
  // the page says it in its confirmation
  const tier = stillTierFor(w.support, plan.sent.length);
  if (w.support.accepted && tier && plan.sent.length > baseCapOf(w.support))
    console.log(
      `CHECK ${key}: ${plan.sent.length} pictures are more than the usual image model takes (${baseCapOf(w.support)}), so this still is drawn on ${tier.model} at about $${stillRateUsd(tier, plan.sent.length).toFixed(2)} a candidate (an estimate from its list price). What it bills and how exactly it reproduces a garment are not yet verified — check each piece against its photo.`,
    );
  const blocking = plan.problems.filter((p) => p.level === "blocking");
  if (blocking.length)
    throw new Error(
      `${key}: blocked before spend — ${blocking.map((p) => `${p.text} (${p.fix})`).join("; ")}`,
    );
  const references: StillReferencesOnJob = {
    sent: plan.sent,
    notSent: plan.notSent,
    legend: plan.legend,
    delivered: w.support.accepted,
  };
  const shot = boxShot(box, w.lyricLines, {
    aspect: w.aspect,
    continuity,
    cast,
    linkLines,
    outfit,
  });
  const { id: lookPresetId, look } = resolveLookPreset(DEFAULT_BOX_LOOK);
  const fx = new Effects(dir, `shot-${key}`);
  const deps = mcpDeps(fx, w.userId);
  const select = box.spec.shotType !== "performance";
  // the job keeps the outfit it was dressed with: the pieces actually sent as pictures (the page's runContext)
  const outfitRecord: OutfitRecord | null = outfit.outfit
    ? jobOutfitRecord(
        outfit,
        plan.sent.filter((r) => r.role === "garment").map((r) => r.id),
      )
    : null;
  const res = await submitStills(
    shot,
    {
      projectId: w.projectId,
      variationId: box.variationId,
      runId: STORYBOARD_RUN,
      lookPresetId,
      look,
      shotIds: { [box.key]: box.id },
      madeFrom: { [box.key]: madeFromBox(box) },
      ...(outfitRecord ? { outfits: { [box.key]: outfitRecord } } : {}),
      stillReferences: { [box.key]: references },
      selectStill: select,
    },
    deps,
  );
  // attach: the filed pictures → this box (project_assets.shot_id) and an assignment, the picked one selected
  const byPath = assetsByPath(fx, w.projectId, res.whole);
  const ordered = [...res.whole].sort(
    (a, b) => Number(b === res.picked) - Number(a === res.picked),
  );
  let assignments = w.assignments;
  const assetIds: string[] = [];
  for (const path of ordered) {
    const assetId = byPath.get(path);
    if (!assetId) continue;
    assetIds.push(assetId);
    fx.ask("avt_update", {
      table: "project_assets",
      filters: [{ column: "id", op: "eq", value: assetId }],
      values: { shot_id: box.id },
    });
    const ops = planAssign({
      assignments,
      shotId: box.id,
      assetId,
      role: "generated_image",
      select: select && path === res.picked,
    });
    const now = new Date().toISOString();
    // unselects first, so the box never shows two selected items mid-way (queries/storyboard.ts applyAssignmentOps)
    for (const o of ops)
      if (o.op === "update" && o.patch.is_primary === false)
        fx.ask("avt_update", {
          table: "shot_asset_assignments",
          filters: [{ column: "id", op: "eq", value: o.id }],
          values: { ...o.patch, updated_at: now },
        });
    for (const o of ops) {
      if (o.op === "update" && o.patch.is_primary !== false)
        fx.ask("avt_update", {
          table: "shot_asset_assignments",
          filters: [{ column: "id", op: "eq", value: o.id }],
          values: { ...o.patch, updated_at: now },
        });
      if (o.op === "insert") {
        const inserted = fx.ask<Record<string, unknown>[] | { rows: Record<string, unknown>[] }>(
          "avt_insert",
          {
            table: "shot_asset_assignments",
            rows: [
              {
                project_id: w.projectId,
                variation_id: box.variationId,
                shot_id: o.shotId,
                asset_id: o.assetId,
                role: o.role,
                is_primary: o.isPrimary,
                source_in_seconds: o.sourceIn,
                source_out_seconds: o.sourceOut,
                sort_order: o.sortOrder,
              },
            ],
          },
        );
        const row = (Array.isArray(inserted) ? inserted : inserted.rows)[0];
        assignments = [...assignments, assignmentFromRow(row)];
      }
    }
  }
  if (assetIds[0])
    fx.ask("avt_update", {
      table: "provider_jobs",
      filters: [{ column: "id", op: "eq", value: res.rowId }],
      values: { result_asset_id: assetIds[0] },
    });
  console.log(
    "DONE " +
      JSON.stringify({
        key,
        jobRowId: res.rowId,
        picked: res.picked,
        candidates: res.candidates.length,
        assetIds,
        costUsd: res.costUsd,
        outfit: outfitRecord
          ? `${outfitRecord.name} v${outfitRecord.version} (${outfitRecord.pieces.length} pieces sent)`
          : null,
        referencesSent: references.delivered ? references.sent.length : 0,
        references: references.sent.map((r) => `${r.role}:${r.label}`),
        prompt: res.prompt,
      }),
  );
}

/**
 * The clip of a cutaway box, from its selected image — the page's "Generate clip" (generate.ts generateBoxClip):
 * clipShot → submitShot. The job is left queued/running with the provider's id; provider-jobs-tick (the server) saves
 * the clip and puts it on the shot. A performance box is restaged from its take in the browser (the take is cut and
 * uploaded there), which this driver cannot do: it refuses one.
 */
async function cmdClip(
  dir: string,
  key: string,
  opts: { ordered?: boolean; dryRun?: boolean } = {},
) {
  const w = loadWorld(dir);
  const box = w.boxes.find((b) => b.key === key);
  if (!box) throw new Error(`no box ${key} on the board`);
  if (box.spec.shotType === "performance")
    throw new Error(
      `${key} is a performance shot: its clip is a restaging of the take, cut in the browser — not made here`,
    );
  const still = w.selectedStill(box.id);
  if (!still)
    throw new Error(`${key} has no selected image — generate and choose one first (shot ${key})`);
  const continuity = resolveContinuity(box.spec, w.entityIndex, w.looks);
  const cast = resolveCast(box.spec, w.entityIndex);
  const blockingCast = castProblems(cast).filter((p) => p.level === "blocking");
  if (blockingCast.length)
    throw new Error(`${key}: cast problems — ${blockingCast.map((p) => p.text).join("; ")}`);
  for (const c of boxPromptConflicts(box, { continuity, cast, outfit: w.outfitOf(box) }))
    console.log(`CHECK ${key}: ${conflictNote(c)}`);
  const linkLines = linkPromptLines(linksOfBox(box, w.board));
  // the clock the page resolves timed events on: lyric timing, the song's beats (bundle/analysis.json when fetched), lighting states
  const beats = w.bundle.analysis
    ? ((w.bundle.analysis as { beat_map_json?: { t: number }[] }).beat_map_json ?? null)
    : null;
  const clock = eventClock(
    w.lyricLines,
    beats,
    w.entities.map((e) => ({
      key: e.key,
      kind: e.kind,
      description: e.description,
      constraints: e.constraints,
    })),
  );
  let plan = clipTemporalPlan(box, clock);
  if (plan.mode === "refused") {
    if (!opts.ordered || plan.alternatives.length === 0)
      throw new Error(
        `${key}: ${plan.reason} (alternatives: ${plan.alternatives.join(", ") || "none"}; "clip ${key},ordered" asks for the beats in order)`,
      );
    plan = clipTemporalPlan(box, clock, { allowOrdered: true });
  }
  const { id: lookPresetId, look } = resolveLookPreset(DEFAULT_BOX_LOOK);
  const outfit = w.outfitOf(box);
  if (outfit.missingKey)
    throw new Error(
      `${key}: wears outfit ${outfit.missingKey}, which this video has no outfit for`,
    );
  const shot = clipShot(box, w.lyricLines, {
    aspect: w.aspect,
    continuity,
    cast,
    linkLines,
    stillPath: still.path,
    lookPresetId,
    temporal: plan,
    outfit,
  });
  if (opts.dryRun) {
    console.log(
      "DONE " +
        JSON.stringify({
          key,
          dryRun: true,
          route: shot.route,
          seconds: shot.seconds,
          stillPath: still.path,
          temporal: plan.mode,
          motion: shot.motion,
          prompt: shot.prompt,
        }),
    );
    return;
  }
  const fx = new Effects(dir, `clip-${key}`);
  const deps = mcpDeps(fx, w.userId);
  // the clip keeps the outfit of the image it moves (the page's generateBoxClip): the outfit's pieces, as words carry them here
  const outfitRecord: OutfitRecord | null = outfit.outfit
    ? jobOutfitRecord(outfit, effectiveGarments(box.spec, outfit).ids)
    : null;
  const res = await submitShot(
    shot,
    {
      projectId: w.projectId,
      variationId: box.variationId,
      runId: STORYBOARD_RUN,
      lookPresetId,
      look,
      shotIds: { [box.key]: box.id },
      madeFrom: { [box.key]: madeFromBox(box) },
      ...(outfitRecord ? { outfits: { [box.key]: outfitRecord } } : {}),
    },
    deps,
  );
  console.log(
    "DONE " +
      JSON.stringify({
        key,
        jobRowId: res.rowId,
        providerJobId: res.providerJobId,
        stillPath: res.stillPath,
        temporal: plan.mode,
        prompt: res.prompt,
      }),
  );
}

/** Reference pictures of a continuity entity from its canonical words — nothing is approved here. */
async function cmdEntity(dir: string, key: string) {
  const w = loadWorld(dir);
  const entity = w.entities.find((e) => e.key === key);
  if (!entity) throw new Error(`no entity ${key} on this variation`);
  const shot = entityShot(entity, w.aspect);
  const { id: lookPresetId, look } = resolveLookPreset(DEFAULT_BOX_LOOK);
  const fx = new Effects(dir, `entity-${key}`);
  const deps = mcpDeps(fx, w.userId);
  const res = await submitStills(
    shot,
    {
      projectId: w.projectId,
      variationId: entity.variationId,
      runId: ENTITY_RUN,
      lookPresetId,
      look,
      shotIds: {},
      selectStill: false,
      entityId: entity.id,
    },
    deps,
  );
  const byPath = assetsByPath(fx, w.projectId, res.whole);
  const assetIds = res.whole.map((p) => byPath.get(p)).filter((x): x is string => !!x);
  if (assetIds[0])
    fx.ask("avt_update", {
      table: "provider_jobs",
      filters: [{ column: "id", op: "eq", value: res.rowId }],
      values: { result_asset_id: assetIds[0] },
    });
  // the entity keeps them as its reference pictures (the app's "Draw a picture" does the same; approval is a person's)
  fx.ask("avt_update", {
    table: "continuity_entities",
    filters: [{ column: "id", op: "eq", value: entity.id }],
    values: { reference_asset_ids: [...entity.referenceAssetIds, ...assetIds] },
  });
  console.log(
    "DONE " +
      JSON.stringify({
        key,
        entityId: entity.id,
        jobRowId: res.rowId,
        assetIds,
        candidates: res.candidates,
        costUsd: res.costUsd,
        prompt: res.prompt,
      }),
  );
}

// ------------------------------------------------------------------------------------------------ main

async function main() {
  const [dir, cmd, arg] = process.argv.slice(2);
  if (!dir || !cmd)
    throw new Error(
      "usage: still.ts <workdir> bundle|entity <KEY>|shot <c0NN>|clip <c0NN>[,ordered][,dry]",
    );
  try {
    if (cmd === "bundle") {
      const [projectId, variationId, artistId] = (arg ?? "").split(",");
      if (!projectId || !variationId)
        throw new Error("bundle <projectId>,<variationId>[,<artistId>]");
      cmdBundle(projectId, variationId, artistId || null);
    } else if (cmd === "shot") await cmdShot(dir, arg);
    else if (cmd === "clip") {
      const [key, ...flags] = (arg ?? "").split(",");
      await cmdClip(dir, key, {
        ordered: flags.includes("ordered"),
        dryRun: flags.includes("dry"),
      });
    } else if (cmd === "entity") await cmdEntity(dir, arg);
    else throw new Error(`unknown command ${cmd}`);
  } catch (e) {
    throw e;
  }
}

main().catch((e) => {
  console.error("ERROR " + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
