import { useEffect, useState } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { signedUrls, type StorageBucket } from "@/lib/storage";

export type LibraryCardItem = {
  id: string;
  name: string;
  file_url: string;
  tags: string[];
  source_url: string | null;
  category?: string | null;
  notes?: string | null;
};

/**
 * Generic library card used by both /library/locations and /library/props.
 * The bucket is whichever bucket holds the underlying image.
 */
export function LibraryItemCard({
  item,
  bucket,
  onDelete,
  onUpdateMeta,
}: {
  item: LibraryCardItem;
  bucket: StorageBucket | "location-refs" | "prop-refs" | "wardrobe-refs";
  onDelete: (id: string) => Promise<void>;
  onUpdateMeta: (
    id: string,
    patch: { name?: string; tags?: string[]; notes?: string | null },
  ) => Promise<void>;
}) {
  const [signed, setSigned] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [tagsCsv, setTagsCsv] = useState(item.tags.join(", "));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    signedUrls(bucket as StorageBucket, [item.file_url], 3600)
      .then((map) => setSigned(map[item.file_url] ?? null))
      .catch(() => setSigned(null));
  }, [item.file_url, bucket]);

  async function handleDelete() {
    if (!confirm(`Remove "${item.name}"?`)) return;
    setBusy(true);
    try {
      await onDelete(item.id);
      toast.success("Removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    setBusy(true);
    try {
      const tags = tagsCsv
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      await onUpdateMeta(item.id, { name: name.trim() || item.name, tags });
      setEditing(false);
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-card p-2">
      <div className="aspect-square overflow-hidden rounded-sm border border-border bg-muted/30">
        {signed ? (
          <img src={signed} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
            Loading…
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-1">
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
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              className="h-6 flex-1 text-[10px]"
              onClick={handleSave}
              disabled={busy}
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
                setName(item.name);
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
            title="Edit name + tags"
          >
            {item.name}
          </button>
          {item.category && (
            <span className="self-start rounded-sm bg-muted/40 px-1 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {item.category}
            </span>
          )}
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

      <div className="flex items-center justify-end gap-1">
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
          disabled={busy}
          className="rounded-sm p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
          title="Remove"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
