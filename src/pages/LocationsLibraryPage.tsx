import { useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildStoragePath,
  makeUploadFilename,
  uploadToBucket,
} from "@/lib/storage";
import { normalizeImageForUpload } from "@/lib/image-normalize";
import { supabase } from "@/lib/supabase";
import {
  LOCATION_CATEGORIES,
  type LocationCategory,
  useAppendLocationReferenceImage,
  useCreateLocation,
  useDeleteLocation,
  useImportLocationFromUrl,
  useLocations,
  useRemoveLocationReferenceImage,
  useUpdateLocation,
  useUpdateLocationReferenceImageAngle,
} from "@/lib/queries/locations";
import { LibraryItemCard } from "@/components/library/LibraryItemCard";
import { UrlImportPanel, parseTagsCsv } from "@/components/wardrobe/UrlImportPanel";

export default function LocationsLibraryPage() {
  const [category, setCategory] = useState<LocationCategory | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const query = useLocations(category ?? undefined);
  const items = useMemo(() => query.data ?? [], [query.data]);

  const create = useCreateLocation();
  const update = useUpdateLocation();
  const del = useDeleteLocation();
  const importFromUrl = useImportLocationFromUrl();
  const appendRefImg = useAppendLocationReferenceImage();
  const removeRefImg = useRemoveLocationReferenceImage();
  const updateRefImgAngle = useUpdateLocationReferenceImageAngle();

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) for (const t of it.tags) set.add(t);
    return Array.from(set).sort();
  }, [items]);

  const visible = useMemo(() => {
    let list = items;
    if (tagFilter) list = list.filter((it) => it.tags.includes(tagFilter));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (it) =>
          it.name.toLowerCase().includes(q) ||
          it.tags.some((t) => t.toLowerCase().includes(q)) ||
          (it.notes ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, tagFilter, search]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const rawFile = files[0];
    try {
      const file = await normalizeImageForUpload(rawFile);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");
      const filename = makeUploadFilename(file.name);
      const path = buildStoragePath(user.id, filename);
      await uploadToBucket("location-refs" as any, path, file);
      await create.mutateAsync({
        name:
          file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Untitled location",
        file_url: path,
        storage_path: path,
        category: category ?? null,
      });
      toast.success("Location added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function handleUrlImport(input: { url: string; name?: string; tagsCsv?: string }) {
    await importFromUrl.mutateAsync({
      url: input.url,
      name:
        input.name?.trim() ||
        new URL(input.url).pathname.split("/").pop()?.slice(0, 80) ||
        "Untitled location",
      tags: parseTagsCsv(input.tagsCsv),
      category: category ?? undefined,
    });
    toast.success("Imported from URL");
  }

  /**
   * Upload one or more additional angles for a given location row, then
   * append them to its `reference_images` jsonb column. Files are already
   * HEIC-normalised by the gallery component.
   */
  async function handleAddAngles(rowId: string, files: File[]) {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) throw new Error("Not signed in");
    const entries: { url: string; storage_path: string }[] = [];
    for (const file of files) {
      const filename = makeUploadFilename(file.name);
      const path = buildStoragePath(user.id, filename);
      await uploadToBucket("location-refs" as any, path, file);
      entries.push({ url: path, storage_path: path });
    }
    await appendRefImg.mutateAsync({ rowId, entries });
    toast.success(
      `${entries.length} angle${entries.length === 1 ? "" : "s"} added`,
    );
  }

  return (
    <>
      <PageHeader
        title="Locations library"
        subtitle="Reusable backdrops and environments — pin to a project when you're ready to use them."
      />
      <div className="space-y-5 px-8 py-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Category:
          </span>
          <button
            type="button"
            onClick={() => setCategory(null)}
            className={`rounded-sm px-2 py-1 text-xs ${category === null ? "bg-foreground text-background" : "bg-muted/30 text-muted-foreground hover:bg-muted/60"}`}
          >
            All
          </button>
          {LOCATION_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory((cur) => (cur === c ? null : c))}
              className={`rounded-sm px-2 py-1 text-xs capitalize ${category === c ? "bg-foreground text-background" : "bg-muted/30 text-muted-foreground hover:bg-muted/60"}`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              handleUpload(e.target.files);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 min-w-[300px]">
            <UrlImportPanel
              label="Paste location image URL"
              onSubmit={handleUrlImport}
              showName
              showTags
              helpText="A marble lobby, a rain-slick street, an interior — paste the direct image URL."
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, tag, or note…"
            className="max-w-xs"
          />
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Tags:
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
        </div>

        {query.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square animate-pulse rounded-md border border-border bg-muted/30"
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {category || tagFilter || search
              ? "No locations match these filters."
              : "No locations yet. Upload an image or paste a URL to start building the library."}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {visible.map((item) => (
              <LibraryItemCard
                key={item.id}
                bucket="location-refs"
                item={{
                  id: item.id,
                  name: item.name,
                  file_url: item.file_url,
                  tags: item.tags,
                  source_url: item.source_url,
                  category: item.category,
                  notes: item.notes,
                  reference_images: item.reference_images,
                }}
                onDelete={async (id) => {
                  await del.mutateAsync({ id });
                }}
                onUpdateMeta={async (id, patch) => {
                  await update.mutateAsync({ id, patch });
                }}
                onAddReferenceImages={(files) => handleAddAngles(item.id, files)}
                onRemoveReferenceImage={(referenceImageId) =>
                  removeRefImg
                    .mutateAsync({ rowId: item.id, referenceImageId })
                    .then(() => undefined)
                }
                onUpdateReferenceImageAngle={(referenceImageId, angle) =>
                  updateRefImgAngle
                    .mutateAsync({ rowId: item.id, referenceImageId, angle })
                    .then(() => undefined)
                }
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
