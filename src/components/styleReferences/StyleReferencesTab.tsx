import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { AlertCircle, CheckCircle2, Images, Loader2, RotateCw, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { uploadToBucket } from "@/lib/storage";
import {
  IMAGE_UPLOAD_ACCEPT,
  normalizeImageForUpload,
} from "@/lib/image-normalize";
import type { Artist } from "@/integrations/supabase/aliases";
import { useArtist } from "@/lib/queries/artists";
import { supabase } from "@/lib/supabase";
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
const TRAINING_ZIPS_BUCKET = "training-zips";

type TrainPrepPhase =
  | { kind: "fetching"; current: number; total: number }
  | { kind: "zipping" }
  | { kind: "uploading" }
  | { kind: "starting" };

function trainingStorageNotConfiguredMessage(err: unknown): string | null {
  const statusCode =
    err && typeof err === "object" && "statusCode" in err
      ? (err as { statusCode?: number }).statusCode
      : undefined;
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (
    statusCode === 404 ||
    lower.includes("bucket not found") ||
    (lower.includes("not found") && lower.includes("bucket")) ||
    msg.includes("404")
  ) {
    return "Training storage not configured yet — ping Claude to create the bucket.";
  }
  return null;
}

function parseIdentityTraining(artist: Artist) {
  const identity = (artist.identity_profile_json ?? {}) as Record<string, unknown>;
  const training = identity.style_lora_training as Record<string, unknown> | undefined;
  return training;
}

function trainingElapsedMinutes(startedAt?: string): number | null {
  if (!startedAt) return null;
  const ms = Date.now() - Date.parse(startedAt);
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.floor(ms / 60_000);
}

export function StyleReferencesTab({ artist: initialArtist }: { artist: Artist }) {
  const artistQuery = useArtist(initialArtist.id);
  const artist = artistQuery.data ?? initialArtist;
  const refetchArtist = artistQuery.refetch;
  const query = useStyleReferences(artist.id);
  const items = useMemo(() => query.data ?? [], [query.data]);
  const create = useCreateStyleReference();
  const del = useDeleteStyleReferences();
  const train = useTrainStyleLora();

  const fileRef = useRef<HTMLInputElement>(null);
  // Each pending file carries its own status so a per-file failure surfaces in
  // the UI with a retry path instead of disappearing into an aggregated catch.
  type PendingStatus =
    | { kind: "idle" }
    | { kind: "uploading" }
    | { kind: "succeeded" }
    | { kind: "failed"; error: string };
  type PendingFile = { id: string; file: File; status: PendingStatus };
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [trainPrepPhase, setTrainPrepPhase] = useState<TrainPrepPhase | null>(null);
  const trainingLocally = trainPrepPhase !== null;

  const training = parseIdentityTraining(artist);
  const trainingStatus = typeof training?.status === "string" ? training.status : undefined;
  const trainingPending = trainingStatus === "pending";
  const trainingStartedAt =
    typeof training?.started_at === "string" ? training.started_at : undefined;
  const elapsedMin = trainingElapsedMinutes(trainingStartedAt);
  const prevTrainingStatus = useRef<string | undefined>(trainingStatus);

  useEffect(() => {
    const status = trainingStatus;
    const prev = prevTrainingStatus.current;
    if (prev === "pending" && status === "complete") {
      toast.success(`Style LoRA ready — trigger ${STYLE_LORA_TRIGGER}`);
    } else if (prev === "pending" && status === "failed") {
      toast.error(
        `Style LoRA training failed: ${String(training?.error ?? "unknown")}`,
      );
    }
    prevTrainingStatus.current = status;
  }, [trainingStatus, training?.error]);

  useEffect(() => {
    if (!trainingPending) return;
    const id = window.setInterval(() => {
      void refetchArtist();
    }, 5000);
    return () => window.clearInterval(id);
  }, [trainingPending, refetchArtist]);

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
    setPendingFiles(
      Array.from(files).map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: { kind: "idle" as const },
      })),
    );
  }

  function updateStatus(pendingId: string, status: PendingStatus) {
    setPendingFiles((list) =>
      list.map((p) => (p.id === pendingId ? { ...p, status } : p)),
    );
  }

  async function uploadOne(entry: PendingFile): Promise<boolean> {
    updateStatus(entry.id, { kind: "uploading" });
    try {
      // normalizeImageForUpload is a pass-through for non-HEIC files and
      // returns a JPEG File for HEIC/HEIF input. We let any decoder error
      // bubble up so it surfaces in the per-file status.
      const file = await normalizeImageForUpload(entry.file);
      const id = crypto.randomUUID();
      const path = `${artist.id}/${id}.jpg`;
      await uploadToBucket("style-references" as any, path, file);
      await create.mutateAsync({
        artist_id: artist.id,
        label:
          entry.file.name.replace(/\.[^.]+$/, "").slice(0, 60) ||
          "Style reference",
        file_url: path,
        storage_path: path,
        metadata_json: {
          original_filename: entry.file.name,
          size_bytes: file.size,
          mime_type: file.type,
        },
      });
      updateStatus(entry.id, { kind: "succeeded" });
      return true;
    } catch (err) {
      updateStatus(entry.id, {
        kind: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  async function commitUpload() {
    // Snapshot the entries that still need a run (idle or previously failed).
    // Succeeded entries are skipped so a retry pass after a partial failure
    // doesn't double-upload the survivors.
    const queue = pendingFiles.filter(
      (p) => p.status.kind === "idle" || p.status.kind === "failed",
    );
    if (queue.length === 0) return;
    setUploading(true);
    try {
      // Promise.allSettled — never let one rejection short-circuit the batch
      // and never let a rejection vanish. uploadOne never throws (catches
      // internally) and returns a boolean for the outcome.
      const outcomes = await Promise.all(queue.map((entry) => uploadOne(entry)));
      const succeeded = outcomes.filter(Boolean).length;
      const failed = outcomes.length - succeeded;
      if (failed === 0) {
        toast.success(
          `Uploaded ${succeeded} photo${succeeded === 1 ? "" : "s"}`,
        );
      } else if (succeeded === 0) {
        toast.error(
          `All ${queue.length} upload${queue.length === 1 ? "" : "s"} failed — tap Retry on each photo`,
        );
      } else {
        toast.error(
          `${queue.length} selected -> ${succeeded} succeeded, ${failed} failed. Tap Retry on the red ones.`,
        );
      }
    } finally {
      setUploading(false);
    }
  }

  async function retryOne(pendingId: string) {
    const entry = pendingFiles.find((p) => p.id === pendingId);
    if (!entry) return;
    setUploading(true);
    try {
      await uploadOne(entry);
    } finally {
      setUploading(false);
    }
  }

  function clearSucceeded() {
    setPendingFiles((list) => list.filter((p) => p.status.kind !== "succeeded"));
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

    const urls = trainSet
      .map((item) => {
        const path = item.storage_path ?? item.file_url;
        return path ? styleReferencePublicUrl(path) : null;
      })
      .filter((u): u is string => !!u);

    if (urls.length < MIN_TRAIN_PHOTOS) {
      toast.error(`Need at least ${MIN_TRAIN_PHOTOS} photos with valid URLs`);
      return;
    }

    setTrainPrepPhase({ kind: "fetching", current: 0, total: urls.length });
    try {
      const blobs: Blob[] = [];
      for (let i = 0; i < urls.length; i++) {
        setTrainPrepPhase({ kind: "fetching", current: i + 1, total: urls.length });
        const resp = await fetch(urls[i]);
        if (!resp.ok) {
          throw new Error(`Failed to fetch photo ${i + 1} (${resp.status})`);
        }
        blobs.push(await resp.blob());
      }

      setTrainPrepPhase({ kind: "zipping" });
      const zip = new JSZip();
      blobs.forEach((blob, i) => {
        zip.file(`image_${String(i).padStart(3, "0")}.jpg`, blob);
      });
      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "STORE",
      });

      setTrainPrepPhase({ kind: "uploading" });
      const path = `${artist.id}/${Date.now()}.zip`;
      const { error: uploadError } = await supabase.storage
        .from(TRAINING_ZIPS_BUCKET)
        .upload(path, zipBlob, {
          contentType: "application/zip",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from(TRAINING_ZIPS_BUCKET)
        .getPublicUrl(path);
      const publicUrl = publicData.publicUrl;

      setTrainPrepPhase({ kind: "starting" });
      await train.mutateAsync({
        artistId: artist.id,
        zipUrl: publicUrl,
        triggerWord: STYLE_LORA_TRIGGER,
        imageCount: blobs.length,
      });
      toast.success("Style LoRA training started — this takes a few minutes");
    } catch (err) {
      const storageMsg = trainingStorageNotConfiguredMessage(err);
      if (storageMsg) {
        toast.error(storageMsg);
      } else {
        const msg = err instanceof Error ? err.message : "Training failed to start";
        if (msg.includes("already_training")) {
          toast.error("Style LoRA training is already in progress");
        } else {
          toast.error(msg);
        }
      }
    } finally {
      setTrainPrepPhase(null);
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
        accept={IMAGE_UPLOAD_ACCEPT}
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
        {pendingFiles.some(
          (p) => p.status.kind === "idle" || p.status.kind === "failed",
        ) && (
          <Button
            type="button"
            size="lg"
            className="min-h-11"
            onClick={commitUpload}
            disabled={uploading}
          >
            Upload {
              pendingFiles.filter(
                (p) => p.status.kind === "idle" || p.status.kind === "failed",
              ).length
            }{" "}
            selected
          </Button>
        )}
        {pendingFiles.some((p) => p.status.kind === "succeeded") && !uploading && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-11"
            onClick={clearSucceeded}
          >
            Clear {pendingFiles.filter((p) => p.status.kind === "succeeded").length} done
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="min-h-11"
          onClick={handleTrain}
          disabled={
            items.length < MIN_TRAIN_PHOTOS ||
            train.isPending ||
            trainingPending ||
            uploading ||
            trainingLocally
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

      {uploading && pendingFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Uploading {pendingFiles.filter((p) => p.status.kind === "succeeded").length} of {pendingFiles.length}…
          </p>
          <Progress
            value={
              (pendingFiles.filter((p) => p.status.kind === "succeeded").length /
                Math.max(pendingFiles.length, 1)) *
              100
            }
          />
        </div>
      )}

      {trainPrepPhase && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">
          {trainPrepPhase.kind === "fetching" && (
            <>
              Fetching photos ({trainPrepPhase.current}/{trainPrepPhase.total})…
            </>
          )}
          {trainPrepPhase.kind === "zipping" && <>Zipping…</>}
          {trainPrepPhase.kind === "uploading" && <>Uploading zip…</>}
          {trainPrepPhase.kind === "starting" && <>Starting training…</>}
        </div>
      )}

      {trainingPending && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">
          Training style LoRA ({STYLE_LORA_TRIGGER})… usually 2–3 minutes.
          {elapsedMin != null && elapsedMin > 0
            ? ` Started ${elapsedMin}m ago — checking for completion.`
            : " Checking for completion."}
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
            Staged ({pendingFiles.length}) — {
              pendingFiles.filter((p) => p.status.kind === "succeeded").length
            } done, {
              pendingFiles.filter((p) => p.status.kind === "failed").length
            } failed
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {pendingFiles.map((p) => {
              const status = p.status.kind;
              const ring =
                status === "succeeded"
                  ? "ring-2 ring-emerald-500"
                  : status === "failed"
                  ? "ring-2 ring-destructive"
                  : status === "uploading"
                  ? "ring-2 ring-primary"
                  : "";
              return (
                <div
                  key={p.id}
                  className={`relative aspect-[3/4] overflow-hidden rounded-md border ${ring}`}
                >
                  <img
                    src={URL.createObjectURL(p.file)}
                    alt=""
                    className={`h-full w-full object-cover ${
                      status === "failed" ? "opacity-50" : ""
                    }`}
                  />
                  {status === "uploading" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Loader2 className="h-6 w-6 animate-spin text-white" />
                    </div>
                  )}
                  {status === "succeeded" && (
                    <div className="absolute right-1 top-1 rounded-full bg-emerald-600 p-0.5 text-white">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                  )}
                  {status === "failed" && (
                    <>
                      <div className="absolute right-1 top-1 rounded-full bg-destructive p-0.5 text-white">
                        <AlertCircle className="h-4 w-4" />
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-1">
                        <p
                          className="truncate text-[10px] text-white"
                          title={p.status.kind === "failed" ? p.status.error : undefined}
                        >
                          {p.status.kind === "failed" ? p.status.error : ""}
                        </p>
                        <button
                          type="button"
                          onClick={() => retryOne(p.id)}
                          disabled={uploading}
                          className="mt-1 flex w-full items-center justify-center gap-1 rounded bg-white/90 px-1.5 py-1 text-[10px] font-medium text-black disabled:opacity-50"
                        >
                          <RotateCw className="h-3 w-3" /> Retry
                        </button>
                      </div>
                    </>
                  )}
                  {(status === "idle" || status === "failed") && !uploading && (
                    <button
                      type="button"
                      className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white"
                      onClick={() =>
                        setPendingFiles((list) =>
                          list.filter((x) => x.id !== p.id),
                        )
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
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
