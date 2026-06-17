import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { productsKeys } from "./products";

export type TechPack = {
  id: string;
  product_id: string;
  user_id: string;
  status: "draft" | "approved" | "sent" | "archived";
  spec_json: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ManufacturingPackage = {
  id: string;
  product_id: string;
  tech_pack_id: string | null;
  user_id: string;
  package_json: Record<string, unknown>;
  storage_path: string | null;
  created_at: string;
};

export const techPacksKeys = {
  all: ["tech_packs"] as const,
  forProduct: (productId: string) => [...techPacksKeys.all, productId] as const,
};

export function useTechPacks(productId: string | undefined) {
  return useQuery<TechPack[]>({
    queryKey: productId ? techPacksKeys.forProduct(productId) : [...techPacksKeys.all, "_none_"],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await (supabase as any)
        .from("tech_packs")
        .select("*")
        .eq("product_id", productId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TechPack[];
    },
    enabled: !!productId,
  });
}

export function useCreateTechPack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      productId,
      notes,
    }: {
      productId: string;
      notes?: string;
    }): Promise<TechPack> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");
      const { data, error } = await (supabase as any)
        .from("tech_packs")
        .insert({
          product_id: productId,
          user_id: user.id,
          notes: notes ?? null,
          status: "draft",
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as TechPack;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: techPacksKeys.forProduct(row.product_id) });
    },
  });
}

export function useManufacturingPackages(productId: string | undefined) {
  return useQuery<ManufacturingPackage[]>({
    queryKey: productId
      ? [...techPacksKeys.forProduct(productId), "packages"]
      : [...techPacksKeys.all, "packages", "_none_"],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await (supabase as any)
        .from("manufacturing_packages")
        .select("*")
        .eq("product_id", productId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ManufacturingPackage[];
    },
    enabled: !!productId,
  });
}

export function useRecordManufacturingPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      productId,
      techPackId,
      packageJson,
    }: {
      productId: string;
      techPackId?: string | null;
      packageJson: Record<string, unknown>;
    }): Promise<ManufacturingPackage> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");
      const { data, error } = await (supabase as any)
        .from("manufacturing_packages")
        .insert({
          product_id: productId,
          tech_pack_id: techPackId ?? null,
          user_id: user.id,
          package_json: packageJson,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as ManufacturingPackage;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: techPacksKeys.forProduct(row.product_id) });
      qc.invalidateQueries({ queryKey: productsKeys.detail(row.product_id) });
    },
  });
}
