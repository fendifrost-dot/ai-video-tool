import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import type { ArtistAsset, ArtistAssetType } from "@/integrations/supabase/aliases";
import {
  ARTIST_ASSET_TYPES,
  FACE_360_SLOTS,
  useArtistAssets,
  useCreateArtistAsset,
  useDeleteArtistAsset,
} from "@/lib/queries/artists";
import {
  buildStoragePath,
  deleteFromBucket,
  makeUploadFilename,
  signedUrls,
  uploadToBucket,
} from "@/lib/storage";
import {
  IMAGE_UPLOAD_ACCEPT,
  normalizeImageForUpload,
} from "@/lib/image-normalize";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Asset types NOT shown in this grid (the 360 face slots are handled separately)
const FACE_360_SET = new Set<ArtistAssetType>(FACE_360_SLOTS);

export function ArtistAssetGrid({ artistId }: { artistId: string }) {
  const assetsQuery = useArtistAssets(artistId);
  const createAsset = useCreateArtistAsset();
  const deleteAsset = useDeleteArtistAsset();
  const inputRef = useRef<HTMLInputElement>(null);
  const [assetType, setAssetType] = useState<ArtistAssetType>("wardrobe");

  const items = useMemo(
    () => (assetsQuery.data ?? []).filter((a) => !FACE_360_SET.has(a.asset_type)),
    [assetsQuery.data],
  );

  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const paths = items.map((a) => a.file_url);
    if (paths.length === 0) {
      setUrls({});
      return;
    }
    signedUrls("artist-assets", paths, 3600).then(setUrls).catch(console.error);
  }, [items]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    // Snapshot synchronously: the caller clears `inputRef.current.value = ""`
    // immediately after invoking handleFiles, which empties the FileList we
    // hold a live reference to. Materialising into a plain Array<File> here
    // detaches us from the input lifecycle so the for-loop below has stable
    // input across the awaits.
    const snapshot = Array.from(files);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");

      for (const rawFile of snapshot) {
        const file = await normalizeImageForUpload(rawFile);
        const filename = makeUploadFilename(file.name);
        const path = buildStoragePath(user.id, artistId, `${assetType}_${filename}`);
        await uploadToBucket("artist-assets", path, file);
        await createAsset.mutateAsync({
          artist_id: artistId,
          asset_type: assetType,
          file_url: path,
          description: null,
          tags: [],
          is_primary_reference: false,
          metadata_json: {
            original_filename: file.name,
            size_bytes: file.size,
            mime_type: file.type,
          },
        });
      }
      toast.success(
        `Uploaded ${snapshot.length} ${snapshot.length === 1 ? "asset" : "assets"}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function handleDelete(asset: ArtistAsset) {
    if (!confirm(`Delete this ${asset.asset_type} asset?`)) return;
    try {
      await deleteFromBucket("artist-assets", asset.file_url);
      await deleteAsset.mutateAsync({ id: asset.id, artistId });
      toast.success("Asset removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Reference library
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Wardrobe, jewelry, tattoos, body, hair, and miscellaneous references.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={assetType} onValueChange={(v) => setAssetType(v as ArtistAssetType)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ARTIST_ASSET_TYPES.filter((t) => !FACE_360_SET.has(t.value)).map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={createAsset.isPending}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={IMAGE_UPLOAD_ACCEPT}
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No reference assets yet. Pick a type and add some.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {items.map((asset) => (
            <div
              key={asset.id}
              className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted/30"
            >
              {urls[asset.file_url] ? (
                <img
                  src={urls[asset.file_url]}
                  alt={asset.asset_type}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Loading…
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="text-[10px] uppercase tracking-wider text-white">
                  {asset.asset_type}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(asset)}
                  className="rounded-sm bg-white/10 p-1 text-white hover:bg-red-500/60"
                  title="Remove"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
