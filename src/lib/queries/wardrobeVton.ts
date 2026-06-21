import { supabase } from "@/lib/supabase";
import { pollArtistLook } from "@/lib/queries/looks";

export type ApplyGarmentVtonInput = {
  artistId: string;
  wardrobeFeatureId: string;
  parentLookId?: string;
  humanImageUrl?: string;
  scenePath?: string;
  sceneBucket?: string;
  name?: string;
  vtonModel?: "idm-vton" | "cat-vton";
  transferMode?: "full_look" | "jacket_only";
  heroFrameCandidate?: boolean;
  heroFrameSessionId?: string;
  candidateIndex?: number;
  projectId?: string;
};

export type ApplyGarmentVtonResult = {
  lookId: string;
};

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");
  return token;
}

export async function callApplyGarmentVton(
  input: ApplyGarmentVtonInput,
): Promise<ApplyGarmentVtonResult> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error("Missing VITE_SUPABASE_URL");

  const token = await getAccessToken();
  const resp = await fetch(
    `${baseUrl.replace(/\/$/, "")}/functions/v1/wardrobe-vton-proxy`,
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
    throw new Error(`Garment VTON failed: ${resp.status} ${detail || resp.statusText}`);
  }

  const body = (await resp.json()) as { lookId?: string };
  if (!body.lookId) throw new Error("Garment VTON returned no lookId");
  return { lookId: body.lookId };
}

/** Submit VTON and poll until the child look completes or fails. */
export async function applyGarmentVtonAndWait(
  input: ApplyGarmentVtonInput,
  opts?: {
    onTick?: (info: { elapsedMs: number; status: string }) => void;
    signal?: AbortSignal;
  },
) {
  const { lookId } = await callApplyGarmentVton(input);
  const look = await pollArtistLook(lookId, {
    signal: opts?.signal,
    onTick: (info) => opts?.onTick?.({ elapsedMs: info.elapsedMs, status: info.status }),
    timeoutMs: 6 * 60 * 1000,
  });
  return look;
}
