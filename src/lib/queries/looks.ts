import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// artist_looks — the saved composed look. Phase 2.
// ---------------------------------------------------------------------------
// Sharing the artist_id semantics with character_features; status drives the
// list page filters; composition_recipe_json is the source-of-truth for
// regenerate-with-tweaks (we send it back to compose-look as the new payload).

export type LookStatus = "draft" | "approved" | "locked" | "archived" | "failed" | "complete" | "error" | "pending";

export const LOOK_STATUSES: LookStatus[] = [
  "draft",
  "approved",
  "locked",
  "archived",
  "failed",
  "complete",
  "error",
  "pending",
];

export type LookPipeline =
  | "lora_seedream"
  | "seedream_only"
  | "kontext_multi"
  | "lora_idm_vton"
  | "lora_segmented_inpaint";

export type CompositionRecipe = {
  face_feature_id: string | null;
  wardrobe_feature_ids: string[];
  jewelry_feature_ids: string[];
  location_id: string | null;
  prop_ids: string[];
  base_prompt: string;
  styling_notes: string | null;
  lora_url: string | null;
  lora_trigger: string;
  stages: Array<{ stage: string; request_id: string; image_url: string }>;
};

export type Look = {
  id: string;
  artist_id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: LookStatus;
  generated_image_url: string | null;
  generated_storage_path: string | null;
  thumbnail_url: string | null;
  composition_recipe_json: CompositionRecipe;
  pipeline_used: LookPipeline | null;
  cost_cents: number;
  iterations: number;
  parent_look_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type LookPatch = Partial<{
  name: string;
  description: string;
  status: LookStatus;
  notes: string;
}>;

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const looksKeys = {
  all: ["looks"] as const,
  forArtist: (artistId: string) => [...looksKeys.all, "artist", artistId] as const,
  detail: (id: string) => [...looksKeys.all, "detail", id] as const,
};

// ---------------------------------------------------------------------------
// Fetch — all looks for an artist
// ---------------------------------------------------------------------------
export function useArtistLooks(artistId: string | undefined) {
  return useQuery<Look[]>({
    queryKey: artistId
      ? looksKeys.forArtist(artistId)
      : [...looksKeys.all, "_none_"],
    queryFn: async () => {
      if (!artistId) return [];
      const { data, error } = await (supabase as any)
        .from("artist_looks")
        .select("*")
        .eq("artist_id", artistId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Look[];
    },
    enabled: !!artistId,
  });
}

export function useLook(id: string | undefined) {
  return useQuery<Look | null>({
    queryKey: id ? looksKeys.detail(id) : ["looks", "detail", "_none_"],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await (supabase as any)
        .from("artist_looks")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Look | null;
    },
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Looks for an artist filtered by status — used by the shot's
// locked-look picker. Approved + locked are the only valid pick targets.
// ---------------------------------------------------------------------------
export function usePickableLooksForArtist(artistId: string | undefined) {
  return useQuery<Look[]>({
    queryKey: artistId
      ? [...looksKeys.forArtist(artistId), "pickable"]
      : [...looksKeys.all, "pickable", "_none_"],
    queryFn: async () => {
      if (!artistId) return [];
      const { data, error } = await (supabase as any)
        .from("artist_looks")
        .select("*")
        .eq("artist_id", artistId)
        .in("status", ["approved", "locked"])
        .order("status", { ascending: false }) // locked first (alpha sort, t > approved)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Look[];
    },
    enabled: !!artistId,
  });
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
export function useUpdateLook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: LookPatch;
      artistId: string;
    }): Promise<Look> => {
      const { data, error } = await (supabase as any)
        .from("artist_looks")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as Look;
    },
    onSuccess: (look, vars) => {
      qc.invalidateQueries({ queryKey: looksKeys.forArtist(vars.artistId) });
      qc.setQueryData(looksKeys.detail(look.id), look);
    },
  });
}

// ---------------------------------------------------------------------------
// Lock-as-primary — atomic: clear any other locked status for this artist,
// then set this one to 'locked'. Atomic-ish: two writes back-to-back with the
// app-level invariant that exactly one look is locked per artist at a time.
// ---------------------------------------------------------------------------
export function useLockLookAsPrimary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      artistId,
    }: {
      id: string;
      artistId: string;
    }): Promise<Look> => {
      // Demote any currently-locked sibling to 'approved'
      const { error: demoteErr } = await (supabase as any)
        .from("artist_looks")
        .update({ status: "approved" })
        .eq("artist_id", artistId)
        .eq("status", "locked")
        .neq("id", id);
      if (demoteErr) throw demoteErr;

      const { data, error } = await (supabase as any)
        .from("artist_looks")
        .update({ status: "locked" })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as Look;
    },
    onSuccess: (look, vars) => {
      qc.invalidateQueries({ queryKey: looksKeys.forArtist(vars.artistId) });
      qc.setQueryData(looksKeys.detail(look.id), look);
    },
  });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
export function useDeleteLook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; artistId: string }): Promise<void> => {
      const { error } = await (supabase as any)
        .from("artist_looks")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: looksKeys.forArtist(vars.artistId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Iterations — children of a parent look
// ---------------------------------------------------------------------------
export function useLookIterations(parentLookId: string | undefined) {
  return useQuery<Look[]>({
    queryKey: parentLookId
      ? [...looksKeys.all, "iterations", parentLookId]
      : [...looksKeys.all, "iterations", "_none_"],
    queryFn: async () => {
      if (!parentLookId) return [];
      const { data, error } = await (supabase as any)
        .from("artist_looks")
        .select("*")
        .eq("parent_look_id", parentLookId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Look[];
    },
    enabled: !!parentLookId,
  });
}

// ---------------------------------------------------------------------------
// Compose-look proxy call — fires the AVT edge function which proxies to CC
// ---------------------------------------------------------------------------
export type ComposeLookInput = {
  artistId: string;
  faceFeatureId?: string;
  wardrobeFeatureIds: string[];
  jewelryFeatureIds?: string[];
  locationId?: string;
  propIds?: string[];
  basePrompt: string;
  stylingNotes?: string;
  pipelinePreference?: "auto" | "lora_seedream" | "seedream_only" | "kontext_multi" | "lora_idm_vton" | "lora_segmented_inpaint";
  parentLookId?: string;
  name?: string;
};

// Async-pipeline response shape (Phase 2/5 refactor). The proxy inserts a
// pending look row immediately and returns the look_id; pipeline_used /
// cost_cents / signed_url are filled in later by the callback once the
// background pipeline finishes. The caller polls artist_looks by id (via
// pollArtistLook below) to learn when status flips to 'complete' / 'failed'.
export type ComposeLookResult = {
  look: Look;
  look_id: string;
  status: "pending" | "complete" | "failed";
  // Kept optional / nullable for backwards-compat with older proxy
  // responses that returned the full sync payload up-front.
  signed_url: string | null;
  pipeline_used: LookPipeline | null;
  cost_cents: number;
  stages?: Array<{ stage: string; request_id: string; image_url: string }>;
};

export async function callComposeLook(input: ComposeLookInput): Promise<ComposeLookResult> {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  const session = sessionData.session;
  if (!session) throw new Error("Not signed in");

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error("Missing VITE_SUPABASE_URL in env");

  const resp = await fetch(
    `${baseUrl.replace(/\/$/, "")}/functions/v1/compose-look-proxy`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  if (!resp.ok) {
    let detail = "";
    try {
      const body = await resp.json();
      detail = body?.error ?? body?.detail ?? "";
    } catch {
      detail = await resp.text().catch(() => "");
    }
    throw new Error(`compose-look failed: ${resp.status} ${detail || resp.statusText}`);
  }
  return (await resp.json()) as ComposeLookResult;
}

export function useComposeLook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ComposeLookInput) => callComposeLook(input),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: looksKeys.forArtist(result.look.artist_id) });
      qc.setQueryData(looksKeys.detail(result.look.id), result.look);
    },
  });
}

// ---------------------------------------------------------------------------
// pollArtistLook — Phase 5 of the async refactor.
//
// After compose-look-proxy returns `{ look_id, status: 'pending' }`, the UI
// polls this helper to learn when CC's background pipeline finishes — the
// compose-look-callback edge function updates the row to status='complete'
// or 'failed' with an error_message. The helper resolves with the final
// Look row, or rejects with an Error carrying the error_message text.
//
// Schedule (per task spec):
//   - 3s ticks for the first 30s,
//   - then 5s → 8s → 15s, cap at 15s,
//   - hard timeout at 5 minutes. On timeout we resolve with the last-known
//     row (still in 'pending') so the caller can show "still generating,
//     refresh in a moment" rather than burning the look as failed.
// ---------------------------------------------------------------------------
export type PollArtistLookOptions = {
  signal?: AbortSignal;
  // Called every poll tick so the UI can render a "Composing… Ns" string.
  // The Look row is passed when available so the caller can read partial
  // state (status, error_message) before the pipeline completes.
  onTick?: (info: { elapsedMs: number; look: Look | null; status: string }) => void;
  // Override total timeout (default 5 minutes).
  timeoutMs?: number;
};

const DEFAULT_POLL_TIMEOUT_MS = 5 * 60 * 1000;

function pollIntervalForElapsed(elapsedMs: number): number {
  // 0–30s: 3s ticks (fast first impression)
  if (elapsedMs < 30_000) return 3_000;
  // 30–60s: 5s
  if (elapsedMs < 60_000) return 5_000;
  // 60–120s: 8s
  if (elapsedMs < 120_000) return 8_000;
  // 120s+: 15s (cap)
  return 15_000;
}

export async function pollArtistLook(
  lookId: string,
  opts: PollArtistLookOptions = {},
): Promise<Look> {
  const startedAt = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  // Loop until terminal status or hard timeout.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (opts.signal?.aborted) throw new Error("aborted");
    const elapsedMs = Date.now() - startedAt;

    const { data, error } = await (supabase as any)
      .from("artist_looks")
      .select("*")
      .eq("id", lookId)
      .maybeSingle();
    if (error) throw error;
    const row = (data ?? null) as Look | null;
    const status = row?.status ?? "pending";
    opts.onTick?.({ elapsedMs, look: row, status });

    if (row && status === "complete") return row;
    if (row && status === "failed") {
      const msg = (row as any).error_message ?? "Pipeline failed";
      const err = new Error(msg);
      (err as any).look = row;
      throw err;
    }

    if (elapsedMs >= timeoutMs) {
      if (row) return row;
      throw new Error("poll_timeout_no_row");
    }

    const wait = pollIntervalForElapsed(elapsedMs);
    await new Promise((r) => setTimeout(r, wait));
  }
}

// ---------------------------------------------------------------------------
// signLookPreviewUrl — convenience wrapper to create a short-lived signed
// URL for the rendered composite. Used by LookComposer's poll-success
// handler so the UI can show the result image without a full page reload.
// ---------------------------------------------------------------------------
export async function signLookPreviewUrl(
  storagePath: string,
  expiresIn: number = 3600,
): Promise<string | null> {
  const { data, error } = await (supabase as any).storage
    .from("look-composites")
    .createSignedUrl(storagePath, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// ---------------------------------------------------------------------------
// Pretty cost
// ---------------------------------------------------------------------------
export function formatCost(cents: number): string {
  if (cents === 0) return "$0.00";
  return `$${(cents / 100).toFixed(2)}`;
}

export function pipelineEstimateCents(
  pref: "auto" | "lora_seedream" | "seedream_only" | "kontext_multi" | "lora_idm_vton" | "lora_segmented_inpaint" | null | undefined,
  hasLora: boolean,
): number {
  const mode = pref === "auto" || !pref ? (hasLora ? "lora_seedream" : "seedream_only") : pref;
  if (mode === "lora_seedream") return 7;
  if (mode === "seedream_only") return 4;
  // lora_idm_vton: 5c for LoRA + ~5c per VTON garment overlay. Most looks
  // pick 1–2 VTON-eligible wardrobe items, so estimate at 15c (covers up
  // to two garments comfortably; underestimates slightly if 3+ picks).
  if (mode === "lora_idm_vton") return 15;
  // LoRA + SAM-3 per garment + FLUX fill + jewelry polish (~$0.35–0.45).
  if (mode === "lora_segmented_inpaint") return 39;
  return 5;
}

// ---------------------------------------------------------------------------
// Fetch — all looks across all of the current user's artists.
// RLS scopes results to auth.uid() naturally; no client-side user_id filter.
// ---------------------------------------------------------------------------
export function useAllLooks() {
  return useQuery<Look[]>({
    queryKey: [...looksKeys.all, "list"] as const,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("artist_looks")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Look[];
    },
  });
}
