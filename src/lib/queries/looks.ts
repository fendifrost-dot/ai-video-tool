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

export type LookStatus = "draft" | "approved" | "locked" | "archived";

export const LOOK_STATUSES: LookStatus[] = [
  "draft",
  "approved",
  "locked",
  "archived",
];

export type LookPipeline =
  | "lora_seedream"
  | "seedream_only"
  | "kontext_multi"
  | "lora_idm_vton";

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
  pipelinePreference?: "auto" | "lora_seedream" | "seedream_only" | "kontext_multi" | "lora_idm_vton";
  parentLookId?: string;
  name?: string;
};

export type ComposeLookResult = {
  look: Look;
  signed_url: string | null;
  pipeline_used: LookPipeline;
  cost_cents: number;
  stages: Array<{ stage: string; request_id: string; image_url: string }>;
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
// Pretty cost
// ---------------------------------------------------------------------------
export function formatCost(cents: number): string {
  if (cents === 0) return "$0.00";
  return `$${(cents / 100).toFixed(2)}`;
}

export function pipelineEstimateCents(
  pref: "auto" | "lora_seedream" | "seedream_only" | "kontext_multi" | "lora_idm_vton" | null | undefined,
  hasLora: boolean,
): number {
  const mode = pref === "auto" || !pref ? (hasLora ? "lora_seedream" : "seedream_only") : pref;
  if (mode === "lora_seedream") return 7;
  if (mode === "seedream_only") return 4;
  // lora_idm_vton: 5c for LoRA + ~5c per VTON garment overlay. Most looks
  // pick 1–2 VTON-eligible wardrobe items, so estimate at 15c (covers up
  // to two garments comfortably; underestimates slightly if 3+ picks).
  if (mode === "lora_idm_vton") return 15;
  return 5;
}
