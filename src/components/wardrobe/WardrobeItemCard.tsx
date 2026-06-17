import { useEffect, useState } from "react";
import { ExternalLink, Lock, Package, Star, Trash2, Zap } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildStoragePath,
  makeUploadFilename,
  signedUrls,
  uploadToBucket,
} from "@/lib/storage";
import {
  type WardrobeItem,
  useAppendWardrobeReferenceImage,
  useDeleteWardrobeItem,
  useRemoveWardrobeReferenceImage,
  useUpdateWardrobeItem,
  useUpdateWardrobeReferenceImageAngle,
} from "@/lib/queries/wardrobe";
import {
  usePromoteWardrobeToProduct,
  useWardrobeProductLink,
} from "@/lib/queries/promoteWardrobe";
import {
  normaliseReferenceImages,
  type AngleLabel,
} from "@/lib/queries/referenceImages";
import { supabase } from "@/lib/supabase";
import { MultiAngleGallery } from "@/components/library/MultiAngleGallery";

/**
 * Single wardrobe-item tile. Renders the primary signed image, name, tag
 * chips, source URL, and the three lock/primary/reinforce toggles inherited
 * from Character DNA. In editing mode the user also gets a MultiAngleGallery
 * — Phase 4 of the fidelity roadmap — for adding side / three-quarter /
 * detail shots that the composer can feed to Seedream under the 4-URL cap.
 */
export function WardrobeItemCard({ item }: { item: WardrobeItem }) {
  const update = useUpdateWardrobeItem();
  const del = useDeleteWardrobeItem();
  const appendRef = useAppendWardrobeReferenceImage();
  const removeRef = useRemoveWardrobeReferenceImage();
  const updateAngleRef = useUpdateWardrobeReferenceImageAngle();
  const promote = usePromoteWardrobeToProduct();
  const linkQuery = useWardrobeProductLink(item.id);

  const [signed, setSigned] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.label);
  const [tagsCsv, setTagsCsv] = useState(item.tags.join(", "));

  useEffect(() => {
    if (!item.file_url) {
      setSigned(null);
      return;
    }
    // Wardrobe lives in the wardrobe-refs bucket. Some items may still
    // resolve via the legacy artist-assets bucket if they were promoted
    // from there — handle both with a fallback.
    signedUrls("wardrobe-refs" as any, [item.file_url], 3600)
      .then((map) => setSigned(map[item.file_url!] ?? null))
      .catch(async () => {
        try {
          const { data, error } = await supabase.storage
            .from("artist-assets")
            .createSignedUrl(item.file_url!, 3600);
          if (!error && data) setSigned(data.signedUrl);
        } catch {
          /* swallow */
        }
      });
  }, [item.file_url]);

  async function toggle(field: "is_primary" | "is_locked" | "reinforce_on_drift") {
    try {
      await update.mutateAsync({
        id: item.id,
        artistId: item.artist_id,
        patch: { [field]: !item[field] },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove "${item.label}"?`)) return;
    try {
      await del.mutateAsync({ id: item.id, artistId: item.artist_id });
      toast.success("Removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    }
  }

  async function handleSaveMeta() {
    try {
      const tags = tagsCsv
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      await update.mutateAsync({
        id: item.id,
        artistId: item.artist_id,
        patch: { label: name.trim() || item.label, tags },
      });
      setEditing(false);
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  // -------------------------------------------------------------------------
  // Multi-angle gallery wiring. The gallery passes raw File[]s (already HEIC-
  // normalised) and lets us own the bucket / path layout — wardrobe lives at
  // `{user_id}/{artist_id}/{filename}` in `wardrobe-refs`, matching the
  // create flow in WardrobeTab.
  // -------------------------------------------------------------------------
  async function handleAddAngles(files: File[]) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");
      const entries = [] as { url: string; storage_path: string }[];
      for (const file of files) {
        const filename = makeUploadFilename(file.name);
        const path = buildStoragePath(user.id, item.artist_id, filename);
        await uploadToBucket("wardrobe-refs" as any, path, file);
        entries.push({ url: path, storage_path: path });
      }
      await appendRef.mutateAsync({
        rowId: item.id,
        entries,
      });
      toast.success(
        `${entries.length} angle${entries.length === 1 ? "" : "s"} added`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Add angle failed");
    }
  }

  async function handleRemoveAngle(refId: string) {
    try {
      await removeRef.mutateAsync({
        rowId: item.id,
        referenceImageId: refId,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    }
  }

  async function handleAngleLabel(refId: string, angle: AngleLabel | null) {
    try {
      await updateAngleRef.mutateAsync({
        rowId: item.id,
        referenceImageId: refId,
        angle,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Label update failed");
    }
  }

  const refImages = normaliseReferenceImages(item.reference_images);

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-card p-2">
      <div className="aspect-square overflow-hidden rounded-sm border border-border bg-muted/30">
        {signed ? (
          <img src={signed} alt={item.label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
            Loading…
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="h-7 text-xs"
          />
          <Input
            type="text"
            value={tagsCsv}
            onChange={(e) => setTagsCsv(e.target.value)}
            placeholder="tags, comma, separated"
            className="h-7 text-xs"
          />

          {/* Multi-angle gallery — Phase 4 fidelity */}
          <div className="rounded-sm border border-border/60 p-2">
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              Reference angles
            </p>
            <MultiAngleGallery
              images={refImages}
              bucket={"wardrobe-refs" as any}
              onAdd={handleAddAngles}
              onRemove={handleRemoveAngle}
              onLabelChange={handleAngleLabel}
              disabled={
                appendRef.isPending ||
                removeRef.isPending ||
                updateAngleRef.isPending
              }
            />
          </div>

          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              className="h-6 flex-1 text-[10px]"
              onClick={handleSaveMeta}
              disabled={update.isPending}
            >
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 flex-1 text-[10px]"
              onClick={() => {
                setEditing(false);
                setName(item.label);
                setTagsCsv(item.tags.join(", "));
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-left text-xs font-medium text-foreground hover:underline"
            title="Edit name + tags + reference angles"
          >
            {item.label}
            {refImages.length > 1 && (
              <span
                className="ml-1 rounded-sm bg-muted/40 px-1 py-0.5 text-[9px] text-muted-foreground"
                title={`${refImages.length} reference angles`}
              >
                +{refImages.length - 1}
              </span>
            )}
          </button>
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-sm bg-muted/40 px-1 py-0.5 text-[10px] text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex items-center justify-between gap-1">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => toggle("is_locked")}
            className={`rounded-sm p-1 ${item.is_locked ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/40"}`}
            title="Lock — compiler uses this reference"
          >
            <Lock className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => toggle("is_primary")}
            className={`rounded-sm p-1 ${item.is_primary ? "bg-amber-500/80 text-white" : "text-muted-foreground hover:bg-muted/40"}`}
            title="Primary reference"
          >
            <Star className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => toggle("reinforce_on_drift")}
            className={`rounded-sm p-1 ${item.reinforce_on_drift ? "bg-emerald-500/80 text-white" : "text-muted-foreground hover:bg-muted/40"}`}
            title="Reinforce on drift"
          >
            <Zap className="h-3 w-3" />
          </button>
        </div>
        <div className="flex gap-1">
          {linkQuery.data?.product_id ? (
            <Link
              to="/products/$id"
              params={{ id: linkQuery.data.product_id }}
              className="rounded-sm p-1 text-primary hover:bg-muted/40"
              title="View promoted product"
            >
              <Package className="h-3 w-3" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={async () => {
                try {
                  const product = await promote.mutateAsync(item);
                  toast.success(`Promoted to ${product.sku}`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Promote failed");
                }
              }}
              disabled={promote.isPending}
              className="rounded-sm p-1 text-muted-foreground hover:bg-muted/40"
              title="Promote to Product Library"
            >
              <Package className="h-3 w-3" />
            </button>
          )}
          {item.source_url && (
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm p-1 text-muted-foreground hover:bg-muted/40"
              title={`Source: ${item.source_url}`}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-sm p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
            title="Remove"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
