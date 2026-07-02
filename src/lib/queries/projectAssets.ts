import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { signedUrls, type StorageBucket } from "@/lib/storage";
import type {
  ApprovalStatus,
  Json,
  ProjectAsset,
  ProjectAssetType,
  TablesInsert,
  TablesUpdate,
} from "@/integrations/supabase/aliases";

export const projectAssetsKeys = {
  all: ["project_assets"] as const,
  forProject: (projectId: string) => [...projectAssetsKeys.all, "project", projectId] as const,
  forShot: (shotId: string) => [...projectAssetsKeys.all, "shot", shotId] as const,
  detail: (id: string) => [...projectAssetsKeys.all, "detail", id] as const,
};

/**
 * All project assets (excludes the audio asset, which is queried separately
 * for the project header).
 */
export function useProjectAssets(projectId: string | undefined) {
  return useQuery<ProjectAsset[]>({
    queryKey: projectId
      ? projectAssetsKeys.forProject(projectId)
      : [...projectAssetsKeys.all, "project", "_none_"],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("project_assets")
        .select("*")
        .eq("project_id", projectId)
        .neq("asset_type", "audio")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
  });
}

/**
 * Insert a new project asset row. Storage upload happens in the caller; this
 * just records metadata + file_url.
 */
export function useCreateProjectAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Omit<TablesInsert<"project_assets">, "user_id">,
    ): Promise<ProjectAsset> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");

      const { data, error } = await supabase
        .from("project_assets")
        .insert({ ...payload, user_id: user.id })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (asset) => {
      qc.invalidateQueries({ queryKey: projectAssetsKeys.forProject(asset.project_id) });
      if (asset.shot_id) {
        qc.invalidateQueries({ queryKey: projectAssetsKeys.forShot(asset.shot_id) });
      }
    },
  });
}

export function useUpdateProjectAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: TablesUpdate<"project_assets">;
    }): Promise<ProjectAsset> => {
      const { data, error } = await supabase
        .from("project_assets")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (asset) => {
      qc.invalidateQueries({ queryKey: projectAssetsKeys.forProject(asset.project_id) });
      if (asset.shot_id) {
        qc.invalidateQueries({ queryKey: projectAssetsKeys.forShot(asset.shot_id) });
      }
    },
  });
}

export function useDeleteProjectAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
    }: {
      id: string;
      projectId: string;
    }): Promise<void> => {
      const { error } = await supabase.from("project_assets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_void, { projectId }) => {
      qc.invalidateQueries({ queryKey: projectAssetsKeys.forProject(projectId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Static metadata
// ---------------------------------------------------------------------------
export const PROJECT_ASSET_TYPE_OPTIONS: {
  value: ProjectAssetType;
  label: string;
  group: "input" | "generated" | "edit" | "export";
}[] = [
  { value: "reference_image", label: "Reference image", group: "input" },
  { value: "reference_video", label: "Reference video", group: "input" },
  { value: "lyrics_doc", label: "Lyrics document", group: "input" },
  { value: "generated_still", label: "Generated still", group: "generated" },
  { value: "generated_clip", label: "Generated clip", group: "generated" },
  { value: "edited_clip", label: "Edited clip", group: "edit" },
  { value: "lut", label: "LUT", group: "edit" },
  { value: "overlay", label: "Overlay", group: "edit" },
  { value: "sfx", label: "SFX", group: "edit" },
  { value: "thumbnail", label: "Thumbnail", group: "export" },
  { value: "premiere_export", label: "Premiere export", group: "export" },
  { value: "ae_asset", label: "After Effects asset", group: "export" },
  { value: "social_cutdown", label: "Social cutdown", group: "export" },
  { value: "other", label: "Other", group: "input" },
];

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  archived: "Archived",
};

/**
 * Best-guess asset type from a File. Used to set a sensible default in the
 * uploader; the user can override before saving.
 */
export function guessAssetType(file: File): ProjectAssetType {
  const type = file.type;
  const name = file.name.toLowerCase();
  if (type.startsWith("video/")) return "generated_clip";
  if (
    type === "image/webp" ||
    type === "image/avif" ||
    /\.(webp|avif)$/i.test(name)
  ) {
    return "reference_image";
  }
  if (type.startsWith("image/")) return "generated_still";
  if (type.startsWith("audio/")) return "sfx";
  if (type === "application/pdf" || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
    return "lyrics_doc";
  }
  return "other";
}

/**
 * Which storage bucket to use for a given asset_type.
 */
export function bucketForAssetType(t: ProjectAssetType) {
  switch (t) {
    case "reference_image":
    case "reference_video":
    case "lyrics_doc":
      return "project-references" as const;
    case "ae_asset":
    case "premiere_export":
      return "project-exports" as const;
    case "generated_still":
    case "generated_clip":
    case "edited_clip":
    case "thumbnail":
    case "social_cutdown":
    case "lut":
    case "overlay":
    case "sfx":
    case "other":
    default:
      return "project-clips" as const;
  }
}

const IMAGE_ASSET_TYPES: ProjectAssetType[] = [
  "reference_image",
  "generated_still",
  "thumbnail",
];

/** Whether a file_url is renderable as an image preview. */
export function isImageAsset(asset: ProjectAsset): boolean {
  // Trust asset_type for known image rows — generated/API assets often lack
  // mime_type metadata and extensionless storage paths.
  if (IMAGE_ASSET_TYPES.includes(asset.asset_type)) return true;
  const meta = asset.metadata_json as { mime_type?: string } | null;
  const mime = meta?.mime_type ?? "";
  if (mime.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(asset.file_url);
}

/** Whether a file_url is renderable as a video preview. */
export function isVideoAsset(asset: ProjectAsset): boolean {
  const meta = asset.metadata_json as { mime_type?: string } | null;
  const mime = meta?.mime_type ?? "";
  if (mime.startsWith("video/")) return true;
  return /\.(mp4|mov|webm|m4v|mkv)$/i.test(asset.file_url);
}

/**
 * Read mp4/mov duration from a File via a temporary <video>.
 * Hard timeout: some containers cause the metadata loader to hang silently
 * (neither onloadedmetadata nor onerror fires). The 5 s cap ensures uploads
 * never block on duration probing.
 */
export function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    let settled = false;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Video metadata probe timed out"));
    }, 5000);
    video.onloadedmetadata = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      const d = video.duration;
      cleanup();
      if (Number.isFinite(d)) resolve(d);
      else reject(new Error("Couldn't read duration"));
    };
    video.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      cleanup();
      reject(new Error("Couldn't decode video"));
    };
    video.src = url;
  });
}

/** Batch-sign asset preview URLs once per page instead of N per-card POSTs. */
export function useBatchAssetSignedUrls(assets: ProjectAsset[]) {
  const assetKey = useMemo(
    () => assets.map((a) => `${a.id}:${a.file_url}`).join("|"),
    [assets],
  );
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(assets.length > 0);

  useEffect(() => {
    let cancelled = false;
    if (assets.length === 0) {
      setUrls({});
      setLoading(false);
      return;
    }

    setLoading(true);
    const byBucket = new Map<StorageBucket, string[]>();
    for (const asset of assets) {
      const bucket = bucketForAssetType(asset.asset_type);
      const paths = byBucket.get(bucket) ?? [];
      paths.push(asset.file_url);
      byBucket.set(bucket, paths);
    }

    (async () => {
      const merged: Record<string, string> = {};
      for (const [bucket, paths] of byBucket) {
        const unique = [...new Set(paths)];
        const signed = await signedUrls(bucket, unique, 3600);
        for (const asset of assets) {
          if (bucketForAssetType(asset.asset_type) !== bucket) continue;
          const url = signed[asset.file_url];
          if (url) merged[asset.id] = url;
        }
      }
      if (!cancelled) {
        setUrls(merged);
        setLoading(false);
      }
    })().catch((err) => {
      console.error("batch signedUrls failed:", err);
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [assetKey]);

  return { urls, loading };
}
