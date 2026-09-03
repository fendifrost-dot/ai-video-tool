import { getAccessTokenWithTimeout } from "@/lib/authSession";
import {
  GROK_VIDEO_EDIT_PROMPT,
  GROK_VIDEO_EDIT_PROMPT_READY,
  GROK_VIDEO_EDIT_PROMPT_VERSION,
} from "@/lib/heroFrame/grokVideoEditPrompt";

export {
  GROK_VIDEO_EDIT_PROMPT,
  GROK_VIDEO_EDIT_PROMPT_READY,
  GROK_VIDEO_EDIT_PROMPT_VERSION,
};

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

export type GrokVideoEditDryRunPlan = {
  dryRun?: boolean;
  billed?: boolean;
  model: string;
  endpoint: string;
  videoAssetId: string;
  wardrobeFeatureId: string;
  garmentPathsUsed: string[];
  garmentFilenames?: string[];
  estimatedCostUsd: number;
  maxCostUsd: number;
  promptVersion?: string;
  prompt?: string;
  referenceCount?: number;
  xaiRequestBody?: {
    model?: string;
    prompt?: string;
    video?: { url?: string };
    reference_images?: Array<{ url?: string } | string>;
  };
};

export type GrokVideoEditResult = {
  assetId: string | null;
  previewUrl: string | null;
  storedPath: string | null;
  actualCostUsd: number | null;
  finalStatus: string;
  billed: boolean;
  requestId?: string;
  persistError?: string | null;
  dryRunPlan?: GrokVideoEditDryRunPlan;
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
        promptVersion: GROK_VIDEO_EDIT_PROMPT_VERSION,
      }),
    },
  );

  const body = (await resp.json()) as Record<string, unknown>;
  if (!resp.ok) {
    const detail = (body.detail ?? body.error ?? resp.statusText) as string;
    throw new Error(`Grok video edit failed: ${resp.status} ${detail}`);
  }

  if (input.dryRun || body.dryRun) {
    return {
      assetId: null,
      previewUrl: null,
      storedPath: null,
      actualCostUsd: null,
      finalStatus: "dry_run",
      billed: false,
      dryRunPlan: body as GrokVideoEditDryRunPlan,
    };
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
    persistError: (body.persistError as string | null) ?? null,
  };
}
