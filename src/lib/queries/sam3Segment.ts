import { getAccessTokenWithTimeout } from "@/lib/authSession";

export type Sam3SegmentInput = {
  scenePath: string;
  sceneBucket?: string;
  /** Single-word prompts work best for fal-ai/sam-3/image. Default "clothing". */
  prompt?: string;
  artistId?: string;
};

export type Sam3SegmentResult = {
  maskPath: string;
  prompt: string;
};

/** SAM-3 mask via CC SwitchX `segment-image` (masking only — not wardrobe). */
export async function callSam3Segment(input: Sam3SegmentInput): Promise<Sam3SegmentResult> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error("Missing VITE_SUPABASE_URL");

  const token = await getAccessTokenWithTimeout();
  const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/functions/v1/sam3-segment-proxy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      scenePath: input.scenePath,
      sceneBucket: input.sceneBucket ?? "project-references",
      prompt: input.prompt ?? "clothing",
      artistId: input.artistId,
    }),
  });

  if (!resp.ok) {
    let detail = "";
    try {
      const body = await resp.json();
      detail = body?.detail ?? body?.error ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(`sam3-segment-proxy failed (${resp.status})${detail ? `: ${detail}` : ""}`);
  }

  const body = (await resp.json()) as { maskPath?: string; prompt?: string };
  if (!body.maskPath) throw new Error("sam3-segment-proxy returned no maskPath");
  return { maskPath: body.maskPath, prompt: body.prompt ?? "clothing" };
}
