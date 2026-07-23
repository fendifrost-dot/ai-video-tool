import { pollArtistLook } from "@/lib/queries/looks";
import { getAccessTokenWithTimeout } from "@/lib/authSession";

// Jacket-Only Inpaint (Masked IP-Adapter + ControlNet) — primary lane of the
// locked v2 wardrobe-swap architecture. Routes Fal through Control Center via
// jacket-inpaint-proxy; deterministic recomposite keeps every non-jacket pixel
// byte-identical to the source. See docs/AVT_Wardrobe_Swap_Build_Spec_v2.md §4.

export type ApplyJacketInpaintInput = {
  artistId: string;
  wardrobeFeatureId: string;
  scenePath?: string;
  sceneBucket?: string;
  humanImageUrl?: string;
  name?: string;
  projectId?: string;
  heroFrameSessionId?: string;
  candidateIndex?: number;
  // Tuning overrides (defaults live in the edge function, per spec §4).
  seed?: number;
  strength?: number;
  guidanceScale?: number;
  steps?: number;
  ipAdapterScale?: number;
  controlnet?: "depth" | "canny" | "pose" | "none";
  conditioningScale?: number;
  featherPx?: number;
  maskExpand?: number;
  /**
   * OMIT THESE unless you specifically want to override. jacket-inpaint-proxy
   * derives both from the selected wardrobe row, so the prompt always describes
   * the garment the user actually picked. Sending a constant from the client is
   * what made every run paint the same jacket regardless of selection.
   *
   * `maskPrompt` describes the garment WORN IN THE SOURCE FRAME (the region to
   * replace); `prompt` describes the TARGET garment. They are not the same thing
   * and must never be derived from each other.
   */
  maskPrompt?: string;
  prompt?: string;
  negativePrompt?: string;
  /**
   * GUARDED-GROK LANE. Storage path of a completed Grok render, used as the
   * IP-Adapter reference in place of the wardrobe still. Requires
   * inpaintModelKey "flux-general" — the proxy fails loudly on an engine that
   * would discard the reference rather than silently degrading to a text-only
   * garment. Defaults to the "look-composites" bucket.
   */
  ipAdapterImagePath?: string;
  ipAdapterImageBucket?: string;
  /** Second evf-sam pass over head/hands, dilated and subtracted from the
   *  garment mask before flux sees it. Defaults on server-side. */
  faceGuard?: boolean;
  faceGuardPrompt?: string;
  faceGuardDilate?: number;
  /** Inpaint engine. flux-general accepts the IP-Adapter garment reference;
   *  flux-lora is text-only but runs on a different Fal worker pool. */
  inpaintModelKey?: "flux-general" | "flux-lora";
};

export type ApplyJacketInpaintResult = { lookId: string };

export async function callApplyJacketInpaint(
  input: ApplyJacketInpaintInput,
): Promise<ApplyJacketInpaintResult> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error("Missing VITE_SUPABASE_URL");

  const token = await getAccessTokenWithTimeout();
  const resp = await fetch(
    `${baseUrl.replace(/\/$/, "")}/functions/v1/jacket-inpaint-proxy`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  if (!resp.ok) {
    let detail = "";
    try {
      const body = await resp.json();
      detail = body?.detail ?? body?.error ?? "";
    } catch {
      detail = await resp.text().catch(() => "");
    }
    throw new Error(`Jacket inpaint failed: ${resp.status} ${detail || resp.statusText}`);
  }

  const body = (await resp.json()) as { lookId?: string };
  if (!body.lookId) throw new Error("Jacket inpaint returned no lookId");
  return { lookId: body.lookId };
}

/** Submit the jacket-only inpaint and poll until the look completes or fails. */
export async function applyJacketInpaintAndWait(
  input: ApplyJacketInpaintInput,
  opts?: {
    onTick?: (info: { elapsedMs: number; status: string; phase?: string }) => void;
    signal?: AbortSignal;
  },
) {
  const { lookId } = await callApplyJacketInpaint(input);
  const look = await pollArtistLook(lookId, {
    signal: opts?.signal,
    onTick: (info) => {
      const phase = (
        info.look?.composition_recipe_json as { generation_metadata?: { phase?: string } } | null
      )?.generation_metadata?.phase;
      opts?.onTick?.({ elapsedMs: info.elapsedMs, status: info.status, phase });
    },
    // Cold Guarded Grok can span Grok + pad_prepare/upload + flux (≤15 min) +
    // recomposite across continue invocations. Stay above edge WATCHDOG_STALE_MS.
    timeoutMs: 22 * 60 * 1000,
    requireTerminal: true,
  });
  return look;
}
