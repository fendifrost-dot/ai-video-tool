import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Lock, Upload, X } from "lucide-react";
import type { ArtistAsset, ArtistAssetType } from "@/integrations/supabase/aliases";
import {
  FACE_360_SLOTS,
  useArtistAssets,
  useCreateArtistAsset,
  useDeleteArtistAsset,
  useSetPrimaryArtistAsset,
} from "@/lib/queries/artists";
import {
  buildStoragePath,
  makeUploadFilename,
  signedUrls,
  uploadToBucket,
  deleteFromBucket,
} from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

const SLOT_LABELS: Record<ArtistAssetType, string> = {
  face_front: "Front",
  face_3q_left: "3/4 left",
  face_3q_right: "3/4 right",
  face_left: "Left profile",
  face_right: "Right profile",
  face_top: "Top",
  face_bottom: "Bottom",
  mouth_open: "Mouth open",
  mouth_closed: "Mouth closed",
  expression: "Expression",
  body: "Body",
  wardrobe: "Wardrobe",
  jewelry: "Jewelry",
  tattoo: "Tattoo",
  hair: "Hair",
  other: "Other",
};

export function Reference360Uploader({ artistId }: { artistId: string }) {
  const assetsQuery = useArtistAssets(artistId);
  const createAsset = useCreateArtistAsset();
  const deleteAsset = useDeleteArtistAsset();
  const setPrimary = useSetPrimaryArtistAsset();

  const slotAssets = useMemo(() => {
    const map: Partial<Record<ArtistAssetType, ArtistAsset>> = {};
    for (const a of assetsQuery.data ?? []) {
      // Prefer the most-recent per slot (assets ordered ascending by created_at)
      map[a.asset_type] = a;
    }
    return map;
  }, [assetsQuery.data]);

  // Sign all current asset URLs in one batch
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const paths = (assetsQuery.data ?? []).map((a) => a.file_url);
    if (paths.length === 0) {
      setUrls({});
      return;
    }
    signedUrls("artist-assets", paths, 3600).then(setUrls).catch(console.error);
  }, [assetsQuery.data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            360 face set
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload one reference per angle. Used as the canonical face library for image-to-video work.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FACE_360_SLOTS.map((slot) => (
          <SlotCard
            key={slot}
            slot={slot}
            asset={slotAssets[slot]}
            signedUrl={slotAssets[slot] ? urls[slotAssets[slot]!.file_url] : undefined}
            disabled={createAsset.isPending || deleteAsset.isPending || setPrimary.isPending}
            isPrimary={!!slotAssets[slot]?.is_primary_reference}
            onLock={async () => {
              const asset = slotAssets[slot];
              if (!asset) return;
              try {
                await setPrimary.mutateAsync({ assetId: asset.id, artistId });
                toast.success(`Locked ${SLOT_LABELS[slot]} as primary reference`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Lock failed");
              }
            }}
            onUpload={async (file) => {
              try {
                const { data: userData } = await supabase.auth.getUser();
                const user = userData.user;
                if (!user) throw new Error("Not signed in");

                const filename = makeUploadFilename(file.name);
                const path = buildStoragePath(user.id, artistId, `${slot}_${filename}`);
                await uploadToBucket("artist-assets", path, file);
                await createAsset.mutateAsync({
                  artist_id: artistId,
                  asset_type: slot,
                  file_url: path,
                  description: null,
                  tags: [],
                  is_primary_reference: slot === "face_front",
                  metadata_json: {
                    original_filename: file.name,
                    size_bytes: file.size,
                    mime_type: file.type,
                  },
                });
                toast.success(`Uploaded ${SLOT_LABELS[slot]}`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Upload failed");
              }
            }}
            onDelete={async () => {
              const asset = slotAssets[slot];
              if (!asset) return;
              try {
                await deleteFromBucket("artist-assets", asset.file_url);
                await deleteAsset.mutateAsync({ id: asset.id, artistId });
                toast.success(`Removed ${SLOT_LABELS[slot]}`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Delete failed");
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SlotCard({
  slot,
  asset,
  signedUrl,
  disabled,
  isPrimary,
  onUpload,
  onDelete,
  onLock,
}: {
  slot: ArtistAssetType;
  asset?: ArtistAsset;
  signedUrl?: string;
  disabled?: boolean;
  isPrimary?: boolean;
  onUpload: (file: File) => Promise<void>;
  onDelete: () => Promise<void>;
  onLock: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const filled = !!asset;

  return (
    <div className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted/30">
      {isPrimary && (
        <div
          className="absolute left-1.5 top-1.5 z-10 flex items-center gap-1 rounded-sm bg-emerald-500/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white"
          title="Primary reference — attached to every prompt"
        >
          <Lock className="h-2.5 w-2.5" />
          Locked
        </div>
      )}
      {filled && signedUrl ? (
        <img
          src={signedUrl}
          loading="lazy"
          alt={SLOT_LABELS[slot]}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
          <Camera className="h-5 w-5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{SLOT_LABELS[slot]}</span>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="text-[10px] uppercase tracking-wider text-white">
          {SLOT_LABELS[slot]}
        </span>
        <div className="flex gap-1">
          {filled && !isPrimary && (
            <button
              type="button"
              onClick={onLock}
              disabled={disabled}
              className="rounded-sm bg-white/10 p-1 text-white hover:bg-emerald-500/60 disabled:opacity-50"
              title="Lock as primary reference"
            >
              <Lock className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="rounded-sm bg-white/10 p-1 text-white hover:bg-white/20 disabled:opacity-50"
            title={filled ? "Replace" : "Upload"}
          >
            <Upload className="h-3 w-3" />
          </button>
          {filled && (
            <button
              type="button"
              onClick={onDelete}
              disabled={disabled}
              className="rounded-sm bg-white/10 p-1 text-white hover:bg-red-500/60 disabled:opacity-50"
              title="Remove"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) await onUpload(file);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
    </div>
  );
}
