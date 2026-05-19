import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Lock, Plus, Star, Trash2, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  buildStoragePath,
  deleteFromBucket,
  makeUploadFilename,
  signedUrls,
  uploadToBucket,
} from "@/lib/storage";
import { normalizeImageForUpload } from "@/lib/image-normalize";
import {
  type CharacterFeature,
  type FeatureType,
  useCreateCharacterFeature,
  useDeleteCharacterFeature,
  useUpdateCharacterFeature,
} from "@/lib/queries/characterFeatures";
import { formatLabel } from "./featureTaxonomy";
import { Button } from "@/components/ui/button";

/**
 * A single slot in the Character DNA tab — one (feature_type, label) pair.
 * Shows the most recent uploaded feature for that slot, lets the user upload
 * a new one, and exposes the three toggles (primary / locked / reinforce).
 *
 * Multiple uploads per slot are allowed but the slot only renders the most
 * recent. The reference library tab handles the full historical list.
 */
export function FeatureSlot({
  artistId,
  featureType,
  label,
  features,
}: {
  artistId: string;
  featureType: FeatureType;
  label: string;
  features: CharacterFeature[];
}) {
  const matching = features
    .filter((f) => f.feature_type === featureType && f.label === label)
    .sort((a, b) => (b.uploaded_at > a.uploaded_at ? 1 : -1));
  const current = matching[0] ?? null;

  const inputRef = useRef<HTMLInputElement>(null);
  const create = useCreateCharacterFeature();
  const update = useUpdateCharacterFeature();
  const del = useDeleteCharacterFeature();

  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = current?.file_url;
    if (!url) {
      setSignedUrl(null);
      return;
    }
    signedUrls("artist-assets", [url], 3600)
      .then((map) => setSignedUrl(map[url] ?? null))
      .catch((err) => console.error("signedUrl failed", err));
  }, [current?.file_url]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const rawFile = files[0]; // one per slot
    try {
      const file = await normalizeImageForUpload(rawFile);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");

      const filename = makeUploadFilename(file.name);
      const path = buildStoragePath(
        user.id,
        artistId,
        `${featureType}_${label}_${filename}`,
      );
      await uploadToBucket("artist-assets", path, file);
      await create.mutateAsync({
        artist_id: artistId,
        feature_type: featureType,
        label,
        file_url: path,
        storage_path: path,
        is_primary: !current, // first upload becomes primary by default
        is_locked: !current,
        reinforce_on_drift: true,
        metadata_json: {
          original_filename: file.name,
          size_bytes: file.size,
          mime_type: file.type,
        },
      });
      toast.success(`${formatLabel(label)} uploaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function handleDelete() {
    if (!current) return;
    if (!confirm(`Remove the "${formatLabel(label)}" reference?`)) return;
    try {
      if (current.file_url) {
        await deleteFromBucket("artist-assets", current.file_url);
      }
      await del.mutateAsync({ id: current.id, artistId });
      toast.success("Reference removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    }
  }

  async function toggle(field: "is_primary" | "is_locked" | "reinforce_on_drift") {
    if (!current) return;
    const next = !current[field];
    try {
      await update.mutateAsync({
        id: current.id,
        artistId,
        patch: { [field]: next },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <div className="group relative flex flex-col gap-1.5">
      <div className="aspect-square overflow-hidden rounded-md border border-border bg-muted/30">
        {current && signedUrl ? (
          <img
            src={signedUrl}
            alt={`${featureType} ${label}`}
            className="h-full w-full object-cover"
          />
        ) : current ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Loading…
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-muted/50"
            disabled={create.isPending}
          >
            <Plus className="h-5 w-5" />
            <span className="text-[10px] uppercase tracking-wider">Upload</span>
          </button>
        )}

        {current && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex gap-1 p-1.5">
            {current.is_locked && (
              <span
                className="pointer-events-auto rounded-sm bg-black/60 p-0.5 text-white"
                title="Locked reference — compiler uses this"
              >
                <Lock className="h-3 w-3" />
              </span>
            )}
            {current.is_primary && (
              <span
                className="pointer-events-auto rounded-sm bg-amber-500/80 p-0.5 text-white"
                title="Primary reference for this feature"
              >
                <Star className="h-3 w-3" />
              </span>
            )}
            {current.reinforce_on_drift && (
              <span
                className="pointer-events-auto rounded-sm bg-emerald-500/80 p-0.5 text-white"
                title="Reinforce on drift"
              >
                <Zap className="h-3 w-3" />
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[11px] font-medium text-foreground">
          {formatLabel(label)}
        </span>
        {current && (
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-sm p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
            title="Remove"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {current && (
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            size="sm"
            variant={current.is_locked ? "default" : "outline"}
            className="h-6 px-1.5 text-[10px]"
            onClick={() => toggle("is_locked")}
            disabled={update.isPending}
          >
            Lock
          </Button>
          <Button
            type="button"
            size="sm"
            variant={current.is_primary ? "default" : "outline"}
            className="h-6 px-1.5 text-[10px]"
            onClick={() => toggle("is_primary")}
            disabled={update.isPending}
          >
            Primary
          </Button>
          <Button
            type="button"
            size="sm"
            variant={current.reinforce_on_drift ? "default" : "outline"}
            className="h-6 px-1.5 text-[10px]"
            onClick={() => toggle("reinforce_on_drift")}
            disabled={update.isPending}
          >
            Reinforce
          </Button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
    </div>
  );
}
