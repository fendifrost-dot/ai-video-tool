/**
 * "Dress this shot" in the browser: cut the shot's window (with handles) out of the take, upload the cut, record the
 * job, hand it to the provider. Everything after that is the server's (provider-jobs-tick): it waits for the result,
 * conforms it to the cut's length, files it as a dressed take in sync and puts it on the shot unselected — whether or
 * not this page is still open. What is sent is decided beforehand by the pure planDress (dress.ts).
 *
 * Also: filing a swap that already finished (importFinishedDress) — no provider is called and nothing is spent.
 */
import { supabase } from "@/lib/supabase";
import { openVideo } from "@/lib/media/frames";
import { canCutExact, cutVideoExact } from "@/lib/media/mp4Cut";
import { trimVideo } from "@/lib/media/mp4Trim";
import { buildStoragePath, signedUrl, uploadBytesToBucket } from "@/lib/storage";
import { nudgeJobProgress } from "@/lib/providerJobs/progress";
import { browserRunnerDeps } from "@/lib/worldBatch/browserDeps";
import type { RunnerDeps } from "@/lib/worldBatch";
import {
  composeDressRequest,
  dressBilledSeconds,
  dressedSongStart,
  dressJobSettings,
  planDressImport,
  DRESS_MILLS_PER_SECOND,
  DRESS_MODEL_VARIANT,
  DRESS_PROMPT_VERSION,
  DRESS_PROVIDER,
  DRESS_RESOLUTION,
  type DressImport,
  type DressPiece,
  type DressPlan,
  type DressRecord,
  type DressRequest,
} from "./dress";
import { STORYBOARD_RUN } from "./generate";
import type { MediaAsset, TakeSync } from "./media";

/** A wardrobe row (character_features) as a piece the swap can be given. */
export function dressPieceOf(item: {
  id: string;
  label: string;
  feature_type: string;
  storage_path: string | null;
  reference_images?: { storage_path: string | null; angle?: string | null }[] | null;
  dimensions_description?: string | null;
}): DressPiece {
  const images = (item.reference_images ?? []).map((r) => ({ storagePath: r.storage_path ?? null, angle: r.angle ?? null }));
  return {
    id: item.id,
    label: item.label,
    featureType: item.feature_type,
    storagePath: item.storage_path ?? images[0]?.storagePath ?? null,
    images: images.length ? images : item.storage_path ? [{ storagePath: item.storage_path, angle: "front" }] : [],
    construction: item.dimensions_description ?? null,
  };
}

/** A wardrobe picture as a link the provider can fetch (a legacy row may hold a full URL instead of a path). */
async function referenceUrl(path: string): Promise<string> {
  return /^https?:\/\//.test(path) ? path : signedUrl("wardrobe-refs", path, 86400);
}

export type DressInput = {
  projectId: string;
  variationId: string | null;
  shot: { id: string; key: string };
  take: MediaAsset;
  sync: TakeSync;
  plan: DressPlan;
  outfit: DressRecord["outfit"];
  sceneId: string | null;
  /** The seconds the director agreed to pay for: a cut that would bill more is refused, not sent. */
  maxBilledSeconds: number;
  madeFrom?: unknown;
  /** True: build and return the exact request and record; cut nothing, upload nothing, record nothing, send nothing. */
  dryRun?: boolean;
  onStage?: (text: string) => void;
};

export type DressResult =
  | { dryRun: true; request: DressRequest; record: DressRecord; settings: Record<string, unknown> }
  | { dryRun: false; rowId: string; providerJobId: string; record: DressRecord; estimateUsd: number };

/** The record of one dress, from the plan and the cut as it was really made. Pure. */
export function dressRecord(input: {
  plan: DressPlan;
  take: Pick<MediaAsset, "id">;
  sync: Pick<TakeSync, "id" | "offsetSeconds" | "driftPpm">;
  cut: { start: number; seconds: number };
  sourcePath: string | null;
  outfit: DressRecord["outfit"];
  sceneId: string | null;
  shot: { id: string; key: string };
}): DressRecord {
  const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
  const { plan, cut } = input;
  const billedSeconds = dressBilledSeconds(cut.seconds);
  return {
    version: 1,
    provider: DRESS_PROVIDER,
    modelVariant: DRESS_MODEL_VARIANT,
    resolution: DRESS_RESOLUTION,
    promptVersion: DRESS_PROMPT_VERSION,
    prompt: plan.prompt,
    references: plan.references.map((r) => ({ pieceId: r.pieceId, path: r.path, angle: r.angle })),
    sourceAssetId: input.take.id,
    syncId: input.sync.id,
    sync: { offsetSeconds: input.sync.offsetSeconds, driftPpm: input.sync.driftPpm },
    window: [r4(cut.start), r4(cut.start + cut.seconds)],
    shotWindow: [plan.window.shotIn, plan.window.shotOut],
    handles: { head: r4(plan.window.shotIn - cut.start), tail: r4(cut.start + cut.seconds - plan.window.shotOut) },
    songStart: dressedSongStart(cut.start, input.sync),
    sourceSeconds: r4(cut.seconds),
    sourcePath: input.sourcePath,
    cutAssetId: null,
    outfit: input.outfit,
    sceneId: input.sceneId,
    shotId: input.shot.id,
    shotKey: input.shot.key,
    billedSeconds,
    estimateUsd: (billedSeconds * DRESS_MILLS_PER_SECOND) / 1000,
    imported: null,
  };
}

/** Cut, upload, record, submit — or, with dryRun, only build what would be sent. */
export async function dressBox(input: DressInput, depsIn?: RunnerDeps): Promise<DressResult> {
  const say = input.onStage ?? (() => undefined);
  const { plan } = input;
  if (input.dryRun) {
    // nothing leaves the browser: the links are named, not signed
    const record = dressRecord({ ...input, cut: { start: plan.window.start, seconds: plan.window.seconds }, sourcePath: null });
    const request = composeDressRequest({
      prompt: plan.prompt,
      sourceUrl: `<signed project-clips/…/dress/${STORYBOARD_RUN}_${input.shot.key}_src.mp4>`,
      referenceUrls: plan.references.map((r) => `<signed wardrobe-refs/${r.path}>`),
      billedSeconds: record.billedSeconds,
      projectId: input.projectId,
    });
    return { dryRun: true, request, record, settings: dressJobSettings({ batchRun: STORYBOARD_RUN, shotKey: input.shot.key, record, madeFrom: input.madeFrom }) };
  }

  const deps = depsIn ?? (await browserRunnerDeps());
  const take = input.take;
  say("reading the take…");
  const url = await signedUrl(take.bucket as never, take.path, 3600);
  const { read, probe } = await openVideo(`${take.bucket}:${take.path}`, url);
  if (!probe.video) throw new Error(probe.note ?? "the take could not be read (it has to be an MP4 or MOV to be cut in the browser)");
  const track = probe.video;
  say("cutting the shot and its handles out of the take…");
  let cut: { bytes: Uint8Array; start: number; seconds: number };
  if (await canCutExact(track)) {
    cut = await cutVideoExact(read, track, plan.window.start, plan.window.seconds);
  } else {
    // no encoder here: the cut opens on the sync frame before the window and is longer — refused below if it bills more
    const copied = await trimVideo(read, track, plan.window.start, plan.window.seconds);
    cut = { bytes: copied.bytes, start: copied.plan.start, seconds: copied.plan.seconds };
  }
  const billed = dressBilledSeconds(cut.seconds);
  if (billed > input.maxBilledSeconds) {
    throw new Error(`the cut came out ${cut.seconds.toFixed(2)} s long — ${billed} billed seconds, more than the ${input.maxBilledSeconds} agreed. Nothing was sent. Open the project in Chrome to cut to the frame.`);
  }
  if (cut.start > plan.window.shotIn + 0.02 || cut.start + cut.seconds < plan.window.shotOut - 0.02) {
    throw new Error("the cut does not cover the whole shot — nothing was sent");
  }
  say("uploading the cut…");
  const sourcePath = buildStoragePath(deps.userId, input.projectId, "dress", `${STORYBOARD_RUN}_${input.shot.key}_${Date.now()}_src.mp4`);
  await uploadBytesToBucket("project-clips", sourcePath, cut.bytes, "video/mp4", { upsert: true });
  const record = dressRecord({ ...input, cut: { start: cut.start, seconds: cut.seconds }, sourcePath });
  const sourceUrl = await deps.sign("project-clips", sourcePath);
  const referenceUrls = await Promise.all(plan.references.map((r) => referenceUrl(r.path)));
  const req = composeDressRequest({ prompt: plan.prompt, sourceUrl, referenceUrls, billedSeconds: record.billedSeconds, projectId: input.projectId });

  // WRITE-AHEAD: the record exists before the money moves, so a submit that dies mid-flight is visible
  say("sending it to the swap…");
  const rowId = await deps.insertJob({
    project_id: input.projectId,
    ...(input.variationId ? { variation_id: input.variationId } : {}),
    provider: DRESS_PROVIDER,
    status: "queued",
    request_payload_json: {
      promptText: plan.prompt,
      mode: "video_to_video",
      modelVariant: DRESS_MODEL_VARIANT,
      resolution: DRESS_RESOLUTION,
      duration: record.billedSeconds,
      shotId: input.shot.id,
      referenceImagePaths: plan.references.map((r) => r.path),
      settings: dressJobSettings({ batchRun: STORYBOARD_RUN, shotKey: input.shot.key, record, madeFrom: input.madeFrom }),
    },
  });
  let env: Record<string, unknown>;
  try {
    env = await deps.callProxy(req.endpoint, req.body);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await deps.updateJob(rowId, { status: "failed", error_text: message.slice(0, 500) });
    throw new Error(message);
  }
  // the provider's own request id: Control Center's job id is not answered by the status endpoint
  const providerJobId = String(env.providerJobId ?? "");
  if (!providerJobId) {
    await deps.updateJob(rowId, { status: "failed", error_text: "the provider answered without a request id", response_payload_json: env });
    throw new Error("the provider answered without a request id");
  }
  try {
    await deps.updateJob(rowId, { external_job_id: providerJobId, status: env.status === "running" ? "running" : "queued", response_payload_json: env });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`accepted by the provider as ${providerJobId}, but its record could not be updated — ${message}`);
  }
  void nudgeJobProgress();
  return { dryRun: false, rowId, providerJobId, record, estimateUsd: record.estimateUsd };
}

/**
 * File a swap that already finished (planDressImport): insert its job row as succeeded and ask the server to move it
 * now. No provider is asked to make anything, so nothing is spent. Returns the job row's id.
 */
export async function importFinishedDress(input: Omit<DressImport, "userId" | "batchRun">): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");
  const row = planDressImport({ ...input, userId: auth.user.id, batchRun: STORYBOARD_RUN });
  const { data, error } = await supabase.from("provider_jobs").insert(row as never).select("id").single();
  if (error || !data) throw new Error(`could not record the finished swap: ${error?.message ?? "no row returned"}`);
  void nudgeJobProgress();
  return (data as { id: string }).id;
}
