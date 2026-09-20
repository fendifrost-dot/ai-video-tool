import { pollArtistLook } from "@/lib/queries/looks";
import { getAccessTokenWithTimeout } from "@/lib/authSession";
import { GROK_DEFAULT_IMAGE_MODEL } from "@/lib/providers/grok";

/**
 * GENERATIVE look-composite lane (Hero Frame Studio).
 *
 * Distinct from grokImageGarment.ts (garment-truth): there is NO garment
 * photograph. We send identity anchor image(s) + a text prompt (+ optional
 * negative) to the sanctioned edge function grok-image-look-composite, which
 * calls the AVT xAI image path (XAI key stays a Lovable edge secret — never in
 * the frontend). Grok generates a new photoreal 9:16 hero image of the same
 * person in the described look.
 */
export type ApplyGrokLookCompositeInput = {
  artistId: string;
  /** Identity anchor storage path (e.g. a captured hero frame). */
  identityPath: string;
  /** Additional identity anchors of the same person (optional, up to 3 total). */
  identityPaths?: string[];
  /** Bucket the identity path(s) live in. Defaults server-side to project-references. */
  identityBucket?: string;
  prompt: string;
  negativePrompt?: string;
  name?: string;
  heroFrameSessionId?: string;
  candidateIndex?: number;
  projectId?: string;
  model?: string;
  /** Optional xAI output resolution ("1k" | "2k"). */
  resolution?: string;
};

export type ApplyGrokLookCompositeResult = {
  lookId: string;
};

export async function callApplyGrokLookComposite(
  input: ApplyGrokLookCompositeInput,
): Promise<ApplyGrokLookCompositeResult> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error("Missing VITE_SUPABASE_URL");
  if (!input.prompt?.trim()) throw new Error("Look composite needs a prompt");

  const token = await getAccessTokenWithTimeout();
  const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/functions/v1/grok-image-look-composite`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...input,
      model: input.model ?? GROK_DEFAULT_IMAGE_MODEL,
    }),
  });

  if (!resp.ok) {
    let detail = "";
    try {
      const body = await resp.json();
      detail = body?.detail ?? body?.error ?? "";
    } catch {
      detail = await resp.text().catch(() => "");
    }
    throw new Error(`Grok look-composite failed: ${resp.status} ${detail || resp.statusText}`);
  }

  const body = (await resp.json()) as { lookId?: string };
  if (!body.lookId) throw new Error("Grok look-composite returned no lookId");
  return { lookId: body.lookId };
}

/** Submit a generative look-composite and poll until complete or failed. */
export async function applyGrokLookCompositeAndWait(
  input: ApplyGrokLookCompositeInput,
  opts?: {
    onTick?: (info: { elapsedMs: number; status: string }) => void;
    signal?: AbortSignal;
  },
) {
  const { lookId } = await callApplyGrokLookComposite(input);
  return pollArtistLook(lookId, {
    signal: opts?.signal,
    onTick: (info) => opts?.onTick?.({ elapsedMs: info.elapsedMs, status: info.status }),
    timeoutMs: 6 * 60 * 1000,
  });
}
