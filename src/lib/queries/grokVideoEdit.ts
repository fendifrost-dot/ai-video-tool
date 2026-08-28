import { getAccessTokenWithTimeout } from "@/lib/authSession";

const GROK_VIDEO_EDIT_PROMPT =
  "Replace only the clothing he is wearing with the exact garment shown in the reference images: navy Saint Laurent track jacket with white side stripes down the sleeves, ribbed collar and cuffs, full front zip. Change NOTHING else — keep his exact face, beard, glasses, skin tone, hair, body proportions, hands, arms, pose, movement, camera framing, background, and lighting. Do not regenerate the person or restyle the scene.";

export type GrokVideoEditInput = {
  projectId: string;
  artistId: string;
  videoAssetId: string;
  wardrobeFeatureId: string;
  prompt?: string;
  model?: string;
  maxCostUsd?: number;
  shotId?: string;
  dryRun?: boolean;
};

export type GrokVideoEditResult = {
  assetId: string | null;
  previewUrl: string | null;
  storedPath: string | null;
  actualCostUsd: number | null;
  finalStatus: string;
  billed: boolean;
  requestId?: string;
};

export async function callGrokVideoEdit(
  input: GrokVideoEditInput,
): Promise<GrokVideoEditResult> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error("Missing VITE_SUPABASE_URL");

  const token = await getAccessTokenWithTimeout();
  const resp = await fetch(
    `${baseUrl.replace(/\/$/, "")}/functions/v1/grok-video-edit-proxy`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...input,
        prompt: input.prompt ?? GROK_VIDEO_EDIT_PROMPT,
        model: input.model ?? "grok-imagine-video",
        maxCostUsd: input.maxCostUsd ?? 0.5,
      }),
    },
  );

  const body = (await resp.json()) as Record<string, unknown>;
  if (!resp.ok) {
    const detail = (body.detail ?? body.error ?? resp.statusText) as string;
    throw new Error(`Grok video edit failed: ${resp.status} ${detail}`);
  }

  const submit = (body.submit ?? {}) as Record<string, unknown>;
  const output = (body.output ?? {}) as Record<string, unknown>;

  return {
    assetId: (body.assetId as string | null) ?? null,
    previewUrl: (output.previewUrl as string | null) ?? null,
    storedPath: (output.storedPath as string | null) ?? null,
    actualCostUsd: (body.actualCostUsd as number | null) ?? null,
    finalStatus: String(body.finalStatus ?? "unknown"),
    billed: Boolean(body.billed),
    requestId: submit.requestId as string | undefined,
  };
}
