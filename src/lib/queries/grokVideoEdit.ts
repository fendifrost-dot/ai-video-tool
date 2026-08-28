import { getAccessTokenWithTimeout } from "@/lib/authSession";
import {
  GROK_VIDEO_EDIT_PROMPT,
  GROK_VIDEO_EDIT_PROMPT_READY,
} from "@/lib/heroFrame/grokVideoEditPrompt";

export { GROK_VIDEO_EDIT_PROMPT, GROK_VIDEO_EDIT_PROMPT_READY };

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

  const prompt = input.prompt ?? (GROK_VIDEO_EDIT_PROMPT_READY ? GROK_VIDEO_EDIT_PROMPT : "");
  if (!prompt && !input.dryRun) {
    throw new Error(
      "Grok video edit prompt is not configured — awaiting Fendi confirmation of the frozen benchmark prompt.",
    );
  }

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
        ...(prompt ? { prompt } : {}),
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
