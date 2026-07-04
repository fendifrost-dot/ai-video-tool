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
  maskPrompt?: string;
  prompt?: string;
  negativePrompt?: string;
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
    onTick?: (info: { elapsedMs: number; status: string }) => void;
    signal?: AbortSignal;
  },
) {
  const { lookId } = await callApplyJacketInpaint(input);
  const look = await pollArtistLook(lookId, {
    signal: opts?.signal,
    onTick: (info) => opts?.onTick?.({ elapsedMs: info.elapsedMs, status: info.status }),
    timeoutMs: 8 * 60 * 1000,
  });
  return look;
}
