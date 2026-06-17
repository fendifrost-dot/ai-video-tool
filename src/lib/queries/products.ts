import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// products — canonical brand-scoped garment SKUs (Phase 1 Product Catalog)
// ---------------------------------------------------------------------------

export type ProductStatus = "concept" | "approved" | "in_production" | "archived";

export type ProductSlot =
  | "top"
  | "bottom"
  | "outerwear"
  | "footwear"
  | "accessory"
  | "dress";

export type ProductAssetRole =
  | "design_concept"
  | "inspiration"
  | "mood_board"
  | "logo_placement_experiment"
  | "front"
  | "back"
  | "side"
  | "detail"
  | "on_model_reference"
  | "tech_flat_front"
  | "tech_flat_back"
  | "tech_flat_side"
  | "material_swatch"
  | "manufacturer_spec";

export type Product = {
  id: string;
  user_id: string;
  sku: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  slot: ProductSlot;
  season: string | null;
  materials_json: Record<string, unknown>;
  metadata_json: Record<string, unknown>;
  fit_profile_json: Record<string, unknown>;
  design_prompt: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductInsert = {
  sku: string;
  name: string;
  description?: string | null;
  status?: ProductStatus;
  slot: ProductSlot;
  season?: string | null;
  design_prompt?: string | null;
  materials_json?: Record<string, unknown>;
  metadata_json?: Record<string, unknown>;
};

export type ProductPatch = Partial<{
  sku: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  slot: ProductSlot;
  season: string | null;
  design_prompt: string | null;
  materials_json: Record<string, unknown>;
  metadata_json: Record<string, unknown>;
  fit_profile_json: Record<string, unknown>;
}>;

export const productsKeys = {
  all: ["products"] as const,
  list: (status?: ProductStatus) =>
    [...productsKeys.all, "list", status ?? "_all_"] as const,
  detail: (id: string) => [...productsKeys.all, "detail", id] as const,
};

const MOD_SKU_RE = /^MOD-(\d+)$/i;

/** Suggest the next MOD-### SKU for the current user. */
export async function suggestNextProductSku(): Promise<string> {
  const { data, error } = await (supabase as any)
    .from("products")
    .select("sku")
    .order("created_at", { ascending: false });
  if (error) throw error;
  let max = 0;
  for (const row of (data ?? []) as { sku: string }[]) {
    const m = MOD_SKU_RE.exec(row.sku);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `MOD-${String(max + 1).padStart(3, "0")}`;
}

export function useProducts(status?: ProductStatus) {
  return useQuery<Product[]>({
    queryKey: productsKeys.list(status),
    queryFn: async () => {
      let q = (supabase as any).from("products").select("*");
      if (status) q = q.eq("status", status);
      q = q.order("updated_at", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });
}

export function useProduct(id: string | undefined) {
  return useQuery<Product | null>({
    queryKey: id ? productsKeys.detail(id) : [...productsKeys.all, "detail", "_none_"],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await (supabase as any)
        .from("products")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Product | null;
    },
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ProductInsert): Promise<Product> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");
      const row = {
        user_id: user.id,
        sku: payload.sku.trim(),
        name: payload.name.trim(),
        description: payload.description ?? null,
        status: payload.status ?? "concept",
        slot: payload.slot,
        season: payload.season ?? null,
        design_prompt: payload.design_prompt ?? null,
        materials_json: payload.materials_json ?? {},
        metadata_json: payload.metadata_json ?? {},
        fit_profile_json: {},
      };
      const { data, error } = await (supabase as any)
        .from("products")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;
      return data as Product;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productsKeys.all });
    },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: ProductPatch;
    }): Promise<Product> => {
      const { data, error } = await (supabase as any)
        .from("products")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as Product;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: productsKeys.all });
      qc.invalidateQueries({ queryKey: productsKeys.detail(row.id) });
    },
  });
}

export function useApproveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<Product> => {
      const { data, error } = await (supabase as any)
        .from("products")
        .update({ status: "approved" })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as Product;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: productsKeys.all });
      qc.invalidateQueries({ queryKey: productsKeys.detail(row.id) });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await (supabase as any)
        .from("products")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productsKeys.all });
    },
  });
}

/** Design Studio + Product Library nav. Off until migrations are applied. */
export function isProductCatalogEnabled(): boolean {
  const flag = import.meta.env.VITE_PRODUCT_CATALOG_ENABLED;
  if (flag === undefined || flag === "") return false;
  return flag === "true" || flag === "1";
}

/** Product picker in Virtual Sample compose. Off until Pair 2 regression passes. */
export function isProductLibraryComposeEnabled(): boolean {
  const flag = import.meta.env.VITE_PRODUCT_LIBRARY_COMPOSE;
  if (flag === undefined || flag === "") return false;
  return flag === "true" || flag === "1";
}

/** Block new wardrobe rows + hide legacy picker. Phase 4 — off until migration is done. */
export function isWardrobeDeprecated(): boolean {
  const flag = import.meta.env.VITE_WARDROBE_DEPRECATED;
  if (flag === undefined || flag === "") return false;
  return flag === "true" || flag === "1";
}

/** User-facing message when the product catalog schema is not deployed yet. */
export function formatProductCatalogError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: string }).code;
    if (code === "PGRST205") {
      return "Product catalog tables are missing on this Supabase project. Apply supabase/migrations/20260617120000_product_catalog.sql and 20260617130000_product_catalog_phases_5_6.sql, then redeploy edge functions.";
    }
  }
  return error instanceof Error ? error.message : String(error);
}
