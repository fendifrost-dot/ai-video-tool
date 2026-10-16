/**
 * "Composite over plate" in the browser, end to end: the matte is asked for (the one paid step), waited on and
 * downloaded; the dressed take, the alpha and the plate are read; the frames are composited and encoded here; the
 * file is uploaded and filed as an unselected alternate on the shot. The page has to stay open — nothing of this
 * runs on the server after the matte — and it says so before the press.
 *
 * What is decided beforehand is decided by the pure planComposite (plan.ts); what is sent is the matte request of
 * matteRequest.ts; how each frame is made is pixels.ts.
 */
import { openVideo } from "@/lib/media/frames";
import { signedUrl } from "@/lib/storage";
import { requireUserId } from "@/lib/worldBatch/browserDeps";
import { STORYBOARD_RUN } from "@/lib/storyboard/generate";
import { bytesRead } from "./frameReader";
import { fileComposite, type FiledComposite } from "./file";
import {
  finishMatteJob,
  matteRequestId,
  pickAlphaFile,
  requestMatte,
  waitForMatte,
  type MatteHandle,
} from "./matte";
import { buildMatteInput, MATTE_MODEL } from "./matteRequest";
import type { CompositePlan } from "./plan";
import { plateAtSize, renderComposite, renderSize } from "./render";

export type CompositeInput = {
  projectId: string;
  variationId: string | null;
  shot: { id: string; key: string };
  plan: CompositePlan;
  onStage?: (text: string) => void;
  signal?: AbortSignal;
  /** Plan everything, send nothing, spend nothing: returns what would be sent. */
  dryRun?: boolean;
};

export type CompositeDryRun = {
  dryRun: true;
  matte: {
    endpoint: "matte-video-proxy";
    body: { assetId: string };
    model: string;
    input: ReturnType<typeof buildMatteInput>;
    estimate: CompositePlan["cost"];
  };
  plate: { id: string; path: string; from: CompositePlan["plateFrom"] };
  recipe: CompositePlan["recipe"];
};

export async function compositeBox(
  input: CompositeInput,
): Promise<FiledComposite | CompositeDryRun> {
  const { plan } = input;
  const say = (t: string) => input.onStage?.(t);
  if (input.dryRun) {
    return {
      dryRun: true,
      matte: {
        endpoint: "matte-video-proxy",
        body: { assetId: plan.dressed.id },
        model: MATTE_MODEL,
        input: buildMatteInput("<signed link to the dressed take, made by the edge function>"),
        estimate: plan.cost,
      },
      plate: { id: plan.plate.id, path: plan.plate.path, from: plan.plateFrom },
      recipe: plan.recipe,
    };
  }
  const userId = await requireUserId();

  say("asking for the matte…");
  const handle: MatteHandle = await requestMatte(plan.dressed.id);
  try {
    const mmss = (ms: number) =>
      `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
    const { urls } = await waitForMatte(handle, {
      signal: input.signal,
      onTick: (status, ms) =>
        say(`waiting for the matte… ${status.toLowerCase().replace(/_/g, " ")} (${mmss(ms)})`),
    });

    say("downloading the matte…");
    const { alpha } = await pickAlphaFile(urls);

    say("reading the take and the plate…");
    const takeUrl = await signedUrl(plan.dressed.bucket as never, plan.dressed.path, 3600);
    const take = await openVideo(`${plan.dressed.bucket}/${plan.dressed.path}`, takeUrl);
    if (!take.probe.video)
      throw new Error(take.probe.note ?? "the dressed take could not be opened");
    const size = renderSize(take.probe.video);
    const plateUrl = await signedUrl(plan.plate.bucket as never, plan.plate.path, 600);
    const plateRes = await fetch(plateUrl);
    if (!plateRes.ok) throw new Error(`the plate could not be downloaded (${plateRes.status})`);
    const bitmap = await createImageBitmap(await plateRes.blob());
    const plate = plateAtSize(bitmap, size.width, size.height);
    bitmap.close();

    const render = await renderComposite({
      fg: { read: take.read, track: take.probe.video },
      alpha: { read: bytesRead(alpha.bytes), track: alpha.track },
      plate,
      width: size.width,
      height: size.height,
      signal: input.signal,
      onProgress: (done, total) => say(`compositing frame ${done} of ${total}…`),
    });

    say("uploading and filing…");
    const filed = await fileComposite({
      projectId: input.projectId,
      variationId: input.variationId,
      userId,
      name: `${STORYBOARD_RUN}_${input.shot.key}_composite`,
      shotId: input.shot.id,
      dressed: plan.dressed,
      plate: plan.plate,
      plateFrom: plan.plateFrom,
      matte: {
        model: handle.model,
        requestId: matteRequestId(handle),
        bytes: alpha.bytes,
        frames: alpha.frames,
        estimateUsd: handle.estimate?.usd ?? plan.cost.usd,
        url: alpha.url,
      },
      render,
      songStart: plan.songStart,
    });
    await finishMatteJob(handle.jobId, {
      ok: true,
      resultAssetId: filed.assetId,
      mattePath: filed.mattePath,
    });
    return filed;
  } catch (e) {
    await finishMatteJob(handle.jobId, {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
