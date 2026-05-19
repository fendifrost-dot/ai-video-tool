import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { signedUrls, type StorageBucket } from "@/lib/storage";
import { normalizeImageForUpload } from "@/lib/image-normalize";

// ---------------------------------------------------------------------------
// MultiAngleGallery — shared component for managing a gallery of reference
// images on a single library item (wardrobe / jewelry / location / prop).
// ---------------------------------------------------------------------------
// Phase 4 of the fidelity roadmap. Replaces the single-image uploader on every
// asset edit panel. Each image entry tracks its storage_path (canonical),
// the URL form (legacy back-compat with rows that haven't been re-uploaded
// since the multi-angle migration), and an optional angle label so the
// composer / proxy can ration the 4-URL cap by selecting complementary views.
//
// The component is intentionally presentation-only: it owns no fetch, no
// mutation, no cache invalidation. The parent owns the array and tells us
// what to do when the user adds/removes/relabels an entry. Wiring it into a
// specific asset type is therefore three lines in the parent's edit panel.

export type ReferenceImage = {
  id: string;
  url: string;
  storage_path: string | null;
  angle?: AngleLabel | null;
  label?: string | null;
};

export const ANGLE_LABELS = [
  "front",
  "side",
  "three-quarter",
  "back",
  "detail",
  "other",
] as const;
export type AngleLabel = (typeof ANGLE_LABELS)[number];

export function isAngleLabel(s: string): s is AngleLabel {
  return (ANGLE_LABELS as readonly string[]).includes(s);
}

export type MultiAngleGalleryProps = {
  images: ReferenceImage[];
  /** Bucket used to sign storage paths for preview. */
  bucket: StorageBucket | string;
  /**
   * Called when the user picks one or more files to add. The parent is
   * responsible for uploading the files and producing the new entries
   * (after which it should call back with the updated array, or trigger
   * a refetch). Files are pre-normalised via normalizeImageForUpload so
   * the parent always sees web-safe bytes (HEIC → JPG).
   */
  onAdd: (files: File[]) => Promise<void> | void;
  onRemove: (id: string) => Promise<void> | void;
  onReorder?: (orderedIds: string[]) => Promise<void> | void;
  onLabelChange?: (id: string, angle: AngleLabel | null) => Promise<void> | void;
  /** Disable interactions while the parent is mid-mutation. */
  disabled?: boolean;
  /** Optional cap on the number of images. Default 8. */
  max?: number;
};

export function MultiAngleGallery({
  images,
  bucket,
  onAdd,
  onRemove,
  onReorder: _onReorder,
  onLabelChange,
  disabled,
  max = 8,
}: MultiAngleGalleryProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [signed, setSigned] = useState<Record<string, string>>({});

  // Sign all storage paths in one batch. Failures are tolerated — the affected
  // tile will fall back to its raw url (which may itself be the storage path).
  const paths = useMemo(
    () => images.map((i) => i.storage_path ?? i.url).filter((p): p is string => !!p),
    [images],
  );
  useEffect(() => {
    if (paths.length === 0) {
      setSigned({});
      return;
    }
    let cancelled = false;
    signedUrls(bucket as StorageBucket, paths, 3600)
      .then((map) => {
        if (!cancelled) setSigned(map);
      })
      .catch(() => {
        if (!cancelled) setSigned({});
      });
    return () => {
      cancelled = true;
    };
  }, [paths.join("|"), bucket]);

  function previewFor(img: ReferenceImage): string | null {
    const key = img.storage_path ?? img.url;
    return signed[key] ?? null;
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    if (disabled) return;
    setBusy(true);
    try {
      const normalised: File[] = [];
      for (const f of Array.from(fileList)) {
        // HEIC → JPG. Non-HEIC passes through unchanged. See
        // src/lib/image-normalize.ts for the rationale.
        normalised.push(await normalizeImageForUpload(f));
      }
      // Respect the cap. We do not throw — silently drop the overflow and
      // surface a toast so the user knows.
      const room = Math.max(0, max - images.length);
      const accepted = normalised.slice(0, room);
      const dropped = normalised.length - accepted.length;
      if (accepted.length > 0) {
        await onAdd(accepted);
      }
      if (dropped > 0) {
        toast.warning(
          `Skipped ${dropped} image${dropped === 1 ? "" : "s"} — gallery is full (${max} max).`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRemove(id: string) {
    if (disabled) return;
    setBusy(true);
    try {
      await onRemove(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleAngleChange(id: string, raw: string) {
    if (!onLabelChange) return;
    const next: AngleLabel | null = raw === "_clear_" ? null : (raw as AngleLabel);
    try {
      await onLabelChange(id, next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Label change failed");
    }
  }

  const atCapacity = images.length >= max;

  return (
    <div className="space-y-2" data-testid="multi-angle-gallery">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((img) => {
          const previewUrl = previewFor(img);
          return (
            <div
              key={img.id}
              className="group relative aspect-square overflow-hidden rounded-sm border border-border bg-muted/30"
              data-testid="multi-angle-tile"
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={img.label ?? img.angle ?? "reference"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                  Loading…
                </div>
              )}

              {/* Hover overlay: delete + angle selector */}
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                <div className="pointer-events-auto flex justify-end p-1">
                  <button
                    type="button"
                    onClick={() => handleRemove(img.id)}
                    disabled={disabled || busy}
                    className="rounded-sm bg-black/60 p-1 text-white hover:bg-destructive/80"
                    title="Remove this reference"
                    aria-label="Remove reference"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                {onLabelChange && (
                  <div className="pointer-events-auto p-1">
                    <Select
                      value={img.angle ?? "_clear_"}
                      onValueChange={(v) => handleAngleChange(img.id, v)}
                    >
                      <SelectTrigger
                        className="h-6 w-full bg-black/60 text-[10px] text-white"
                        aria-label="Angle label"
                      >
                        <SelectValue placeholder="Label" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_clear_">No label</SelectItem>
                        {ANGLE_LABELS.map((a) => (
                          <SelectItem key={a} value={a}>
                            {a.charAt(0).toUpperCase() + a.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Persistent angle chip in the corner when one is set */}
              {img.angle && (
                <div className="pointer-events-none absolute left-1 top-1 rounded-sm bg-black/60 px-1 py-0.5 text-[9px] uppercase tracking-wider text-white">
                  {img.angle}
                </div>
              )}
            </div>
          );
        })}

        {/* Add-angle tile */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || busy || atCapacity}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border bg-muted/10 text-[10px] text-muted-foreground transition hover:border-foreground/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Add angle"
          data-testid="multi-angle-add"
        >
          <Plus className="h-4 w-4" />
          {atCapacity ? "Full" : "Add angle"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Helper line — count + cap, kept terse */}
      <p className="text-[10px] text-muted-foreground">
        {images.length} of {max} angles.
        {images.length === 0 && " Add the front view first — additional angles improve fidelity."}
      </p>
    </div>
  );
}

export default MultiAngleGallery;
