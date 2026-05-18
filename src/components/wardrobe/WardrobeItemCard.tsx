import { useEffect, useState } from "react";
import { ExternalLink, Lock, Star, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signedUrls } from "@/lib/storage";
import {
  type WardrobeItem,
  useDeleteWardrobeItem,
  useUpdateWardrobeItem,
} from "@/lib/queries/wardrobe";
import { supabase } from "@/lib/supabase";

/**
 * Single wardrobe-item tile. Renders the signed image, name, tag chips,
 * source URL, and the three lock/primary/reinforce toggles inherited from
 * Character DNA.
 */
export function WardrobeItemCard({ item }: { item: WardrobeItem }) {
  const update = useUpdateWardrobeItem();
  const del = useDeleteWardrobeItem();

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
            title="Edit name + tags"
          >
            {item.label}
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
