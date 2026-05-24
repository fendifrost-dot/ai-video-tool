import { useMemo, useRef, useState } from "react";
import { Images, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { uploadToBucket } from "@/lib/storage";
import { normalizeImageForUpload } from "@/lib/image-normalize";
import type { Artist } from "@/integrations/supabase/aliases";
import {
  styleReferencePublicUrl,
  useCreateStyleReference,
  useDeleteStyleReferences,
  useStyleReferences,
  useTrainStyleLora,
  type StyleReferenceItem,
} from "@/lib/queries/styleReferences";

const MIN_TRAIN_PHOTOS = 4;
const STYLE_LORA_TRIGGER = "FENDIFITS";

function parseIdentityTraining(artist: Artist) {
  const identity = (artist.identity_profile_json ?? {}) as Record<string, unknown>;
  const training = identity.style_lora_training as Record<string, unknown> | undefined;
  return training;
}

export function StyleReferencesTab({ artist }: { artist: Artist }) {
  const query = useStyleReferences(artist.id);
  const items = useMemo(() => query.data ?? [], [query.data]);
  const create = useCreateStyleReference();
  const del = useDeleteStyleReferences();
  const train = useTrainStyleLora();

  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });

  const training = parseIdentityTraining(artist);
  const trainingPending = training?.status === "pending";

  const selectedItems = useMemo(
    () => items.filter((it) => selected.has(it.id)),
    [items, selected],
  );

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onFilesPicked(files: FileList | null) {
    if (!files?.length) return;
    setPendingFiles(Array.from(files));
  }

  async function commitUpload() {
    if (pendingFiles.length === 0) return;
    setUploading(true);
    setUploadProgress({ done: 0, total: pendingFiles.length });
    try {
      for (let i = 0; i < pendingFiles.length; i++) {
        const raw = pendingFiles[i]!;
        const file = await normalizeImageForUpload(raw);
        const id = crypto.randomUUID();
        const path = `${artist.id}/${id}.jpg`;
        await uploadToBucket("style-references" as any, path, file);
        await create.mutateAsync({
          artist_id: artist.id,
          label: raw.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Style reference",
          file_url: path,
          storage_path: path,
          metadata_json: {
            original_filename: raw.name,
            size_bytes: file.size,
            mime_type: file.type,
          },
        });
        setUploadProgress({ done: i + 1, total: pendingFiles.length });
      }
      toast.success(`Uploaded ${pendingFiles.length} photo${pendingFiles.length === 1 ? "" : "s"}`);
      setPendingFiles([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress({ done: 0, total: 0 });
    }
  }

  async function handleBulkDelete() {
    const targets = selectedItems.length > 0 ? selectedItems : items;
    if (targets.length === 0) return;
    if (!confirm(`Delete ${targets.length} style reference photo(s)?`)) return;
    try {
      await del.mutateAsync({
        artistId: artist.id,
        ids: targets.map((t) => t.id),
        storagePaths: targets
          .map((t) => t.storage_path ?? t.file_url)
          .filter((p): p is string => !!p),
      });
      setSelected(new Set());
      toast.success("Deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleTrain() {
    const trainSet = selectedItems.length > 0 ? selectedItems : items;
    if (trainSet.length < MIN_TRAIN_PHOTOS) {
      toast.error(`Select at least ${MIN_TRAIN_PHOTOS} photos for training`);
      return;
    }
    try {
      await train.mutateAsync({
        artistId: artist.id,
        featureIds: selectedItems.length > 0 ? Array.from(selected) : undefined,
      });
      toast.success("Style LoRA training started — this takes a few minutes");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Training failed to start");
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Style references
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Full-body and three-quarter photos in varied outfits for training a personal style LoRA.
          Face close-ups are already covered by your existing LoRA.
        </p>
      </div>

      <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        For best results: pick 25–50 photos showing your full body or three-quarter shots in varied
        outfits, poses, and lighting. Different jackets, shirts, pants, shoes. Casual and dressed-up.
        Standing, walking, sitting.
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => onFilesPicked(e.target.files)}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="lg"
          className="min-h-11 min-w-[44px]"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || trainingPending}
        >
          <Upload className="mr-2 h-5 w-5" />
          Upload from Photos
        </Button>
        {pendingFiles.length > 0 && (
          <Button
            type="button"
            size="lg"
            className="min-h-11"
            onClick={commitUpload}
            disabled={uploading}
          >
            Upload {pendingFiles.length} selected
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="min-h-11"
          onClick={handleTrain}
          disabled={
            items.length < MIN_TRAIN_PHOTOS || train.isPending || trainingPending || uploading
          }
        >
          <Sparkles className="mr-2 h-5 w-5" />
          {selectedItems.length > 0
            ? `Train from ${selectedItems.length} selected`
            : "Train Style LoRA from all"}
        </Button>
        {selected.size > 0 && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-11"
            onClick={handleBulkDelete}
            disabled={del.isPending}
          >
            <Trash2 className="mr-2 h-5 w-5" />
            Delete selected
          </Button>
        )}
      </div>

      {uploading && uploadProgress.total > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Uploading {uploadProgress.done} of {uploadProgress.total}…
          </p>
          <Progress value={(uploadProgress.done / uploadProgress.total) * 100} />
        </div>
      )}

      {trainingPending && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">
          Training style LoRA ({STYLE_LORA_TRIGGER})… usually 2–3 minutes. Refresh when complete.
        </div>
      )}

      {training?.status === "failed" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Training failed: {String(training.error ?? "unknown")}
        </div>
      )}

      {training?.status === "complete" && typeof training.lora_url === "string" && (
        <div className="rounded-md border border-border p-4 text-sm">
          Style LoRA ready. Trigger: <strong>{STYLE_LORA_TRIGGER}</strong>
        </div>
      )}

      {pendingFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Ready to upload ({pendingFiles.length})
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {pendingFiles.map((f, idx) => (
              <div key={`${f.name}-${idx}`} className="relative aspect-[3/4] overflow-hidden rounded-md border">
                <img
                  src={URL.createObjectURL(f)}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white"
                  onClick={() =>
                    setPendingFiles((list) => list.filter((_, i) => i !== idx))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {query.isLoading ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-16 text-center text-muted-foreground">
          <Images className="mb-3 h-10 w-10 opacity-40" />
          <p className="text-sm">No style references yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {items.map((item) => (
            <StyleReferenceThumb
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              onToggle={() => toggleSelect(item.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function StyleReferenceThumb({
  item,
  selected,
  onToggle,
}: {
  item: StyleReferenceItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const path = item.storage_path ?? item.file_url;
  const src = path ? styleReferencePublicUrl(path) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={`relative aspect-[3/4] cursor-pointer overflow-hidden rounded-md border text-left transition ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        selected ? "ring-2 ring-primary" : ""
      }`}
    >
      {src ? (
        <img
          src={src}
          alt={item.label}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-muted text-xs text-muted-foreground">
          No preview
        </div>
      )}
      <span
        className="absolute left-2 top-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          className="h-5 w-5 border-2 bg-background/80"
        />
      </span>
    </div>
  );
}
