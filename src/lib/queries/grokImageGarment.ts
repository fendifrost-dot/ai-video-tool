import { pollArtistLook } from "@/lib/queries/looks";
import { getAccessTokenWithTimeout } from "@/lib/authSession";
import { GROK_DEFAULT_IMAGE_MODEL } from "@/lib/providers/grok";
import { GROK_GARMENT_TRUTH_PROMPT } from "@/lib/heroFrame/grokGarmentPrompt";

export type ApplyGrokGarmentTruthInput = {
  artistId: string;
  wardrobeFeatureId: string;
  scenePath: string;
  sceneBucket?: string;
  name?: string;
  heroFrameSessionId?: string;
  candidateIndex?: number;
  projectId?: string;
  prompt?: string;
  model?: string;
};

export type ApplyGrokGarmentTruthResult = {
  lookId: string;
};

export async function callApplyGrokGarmentTruth(
  input: ApplyGrokGarmentTruthInput,
): Promise<ApplyGrokGarmentTruthResult> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error("Missing VITE_SUPABASE_URL");

  const token = await getAccessTokenWithTimeout();
  const resp = await fetch(
    `${baseUrl.replace(/\/$/, "")}/functions/v1/grok-image-garment-proxy`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...input,
        prompt: input.prompt ?? GROK_GARMENT_TRUTH_PROMPT,
        model: input.model ?? GROK_DEFAULT_IMAGE_MODEL,
      }),
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
    throw new Error(`Grok garment-truth failed: ${resp.status} ${detail || resp.statusText}`);
  }

  const body = (await resp.json()) as { lookId?: string };
  if (!body.lookId) throw new Error("Grok garment-truth returned no lookId");
  return { lookId: body.lookId };
}

/** Submit Grok image-edit garment-truth and poll until complete or failed. */
export async function applyGrokGarmentTruthAndWait(
  input: ApplyGrokGarmentTruthInput,
  opts?: {
    onTick?: (info: { elapsedMs: number; status: string }) => void;
    signal?: AbortSignal;
  },
) {
  const { lookId } = await callApplyGrokGarmentTruth(input);
  return pollArtistLook(lookId, {
    signal: opts?.signal,
    onTick: (info) => opts?.onTick?.({ elapsedMs: info.elapsedMs, status: info.status }),
    timeoutMs: 6 * 60 * 1000,
  });
}
