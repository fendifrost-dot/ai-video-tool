import { useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  buildStoragePath,
  makeUploadFilename,
  uploadToBucket,
} from "@/lib/storage";
import {
  IMAGE_UPLOAD_ACCEPT,
  normalizeImageForUpload,
} from "@/lib/image-normalize";
import { supabase } from "@/lib/supabase";
import {
  type WardrobeFeatureType,
  useCreateWardrobeItem,
  useImportWardrobeFromUrl,
  useWardrobe,
} from "@/lib/queries/wardrobe";
import {
  WARDROBE_TAXONOMY,
  WARDROBE_TYPES_ORDERED,
} from "./wardrobeTaxonomy";
import { WardrobeItemCard } from "./WardrobeItemCard";
import { UrlImportPanel, parseTagsCsv } from "./UrlImportPanel";

/**
 * Wardrobe tab — artist-scoped library of clothing references, sub-categorized
 * by garment type. Built on top of character_features so locked items flow
 * into the prompt compiler the same way Character DNA features do.
 */
export function WardrobeTab({ artistId }: { artistId: string }) {
  const query = useWardrobe(artistId);
  const items = useMemo(() => query.data ?? [], [query.data]);

  const [active, setActive] = useState<WardrobeFeatureType>("wardrobe_top");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const create = useCreateWardrobeItem();
  const importFromUrl = useImportWardrobeFromUrl();

  const counts = useMemo(() => {
    const out: Record<WardrobeFeatureType, number> = {
      wardrobe_top: 0,
      wardrobe_bottom: 0,
      wardrobe_outerwear: 0,
      wardrobe_footwear: 0,
      wardrobe_accessory: 0,
    };
    for (const it of items) out[it.feature_type] += 1;
    return out;
  }, [items]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      if (it.feature_type !== active) continue;
      for (const t of it.tags) set.add(t);
    }
    return Array.from(set).sort();
  }, [items, active]);

  const visible = useMemo(() => {
    let list = items.filter((it) => it.feature_type === active);
    if (tagFilter) list = list.filter((it) => it.tags.includes(tagFilter));
    return list;
  }, [items, active, tagFilter]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const rawFile = files[0];
    try {
      const file = await normalizeImageForUpload(rawFile);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");
      const filename = makeUploadFilename(file.name);
      const path = buildStoragePath(user.id, artistId, filename);
      await uploadToBucket("wardrobe-refs" as any, path, file);
      await create.mutateAsync({
        artist_id: artistId,
        feature_type: active,
        label:
          file.name.replace(/\.[^.]+$/, "").slice(0, 60) ||
          WARDROBE_TAXONOMY[active].label,
        file_url: path,
        storage_path: path,
        tags: [],
        source_url: null,
        is_primary: false,
        is_locked: false,
        reinforce_on_drift: true,
        metadata_json: {
          original_filename: file.name,
          size_bytes: file.size,
          mime_type: file.type,
        },
      });
      toast.success("Wardrobe item added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function handleUrlImport(input: { url: string; name?: string; tagsCsv?: string }) {
    await importFromUrl.mutateAsync({
      artistId,
      url: input.url,
      featureType: active,
      label:
        input.name?.trim() ||
        new URL(input.url).pathname.split("/").pop()?.slice(0, 60) ||
        WARDROBE_TAXONOMY[active].label,
      tags: parseTagsCsv(input.tagsCsv),
    });
    toast.success("Imported from URL");
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Wardrobe
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          This artist's clothing library. Lock items to lock them into the prompt
          compiler the same way Character DNA features lock in.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-md border border-border bg-muted/20 p-1">
        {WARDROBE_TYPES_ORDERED.map((t) => {
          const isActive = t === active;
          return (
            <button
              key={t}
              type="button"
              onClick={() => {
                setActive(t);
                setTagFilter(null);
              }}
              className={[
                "rounded-sm px-3 py-1.5 text-xs font-medium transition",
                isActive
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              {WARDROBE_TAXONOMY[t].label}
              <span className="ml-1.5 text-[10px] opacity-70">{counts[t]}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-md border border-border p-3">
        <p className="text-xs text-muted-foreground">
          {WARDROBE_TAXONOMY[active].description}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={create.isPending}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            Upload
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_UPLOAD_ACCEPT}
            className="hidden"
            onChange={(e) => {
              handleUpload(e.target.files);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 min-w-[300px]">
            <UrlImportPanel
              label={`Paste URL for a ${WARDROBE_TAXONOMY[active].label.toLowerCase().replace(/s$/, "")}`}
              onSubmit={handleUrlImport}
              showName
              showTags
              helpText="Paste the direct image URL (right-click → 'Copy image address' on a product page)."
            />
          </div>
        </div>

        {allTags.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Filter:
            </span>
            <button
              type="button"
              onClick={() => setTagFilter(null)}
              className={`rounded-sm px-2 py-0.5 text-[11px] ${tagFilter === null ? "bg-foreground text-background" : "bg-muted/30 text-muted-foreground hover:bg-muted/60"}`}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setTagFilter((cur) => (cur === tag ? null : tag))}
                className={`rounded-sm px-2 py-0.5 text-[11px] ${tagFilter === tag ? "bg-foreground text-background" : "bg-muted/30 text-muted-foreground hover:bg-muted/60"}`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4">
          {query.isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square animate-pulse rounded-md border border-border bg-muted/30"
                />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              {tagFilter
                ? `No ${WARDROBE_TAXONOMY[active].label.toLowerCase()} tagged "${tagFilter}".`
                : `No ${WARDROBE_TAXONOMY[active].label.toLowerCase()} yet — upload an image or paste a URL.`}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {visible.map((item) => (
                <WardrobeItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
