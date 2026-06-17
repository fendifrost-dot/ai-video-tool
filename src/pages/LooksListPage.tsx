import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ImageUp, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useArtist } from "@/lib/queries/artists";
import {
  type LookStatus,
  useArtistLooks,
  LOOK_STATUSES,
} from "@/lib/queries/looks";
import { LookCard } from "@/components/looks/LookCard";
import {
  IMAGE_UPLOAD_ACCEPT,
  normalizeImageForUpload,
} from "@/lib/image-normalize";

type FilterOption = "all" | LookStatus;

// ---------------------------------------------------------------------------
// /artists/$id/looks — grid of saved looks for one artist
// ---------------------------------------------------------------------------
export default function LooksListPage({ artistId }: { artistId: string }) {
  const artistQuery = useArtist(artistId);
  const looksQuery = useArtistLooks(artistId);
  const [filter, setFilter] = useState<FilterOption>("all");
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);

  async function handleImportFile(rawFile: File) {
    setImporting(true);
    try {
      // iPhone canvases arrive as HEIC; transcode to JPEG before Storage so the
      // imported composite is web-safe for the downstream identity-swap.
      const file = await normalizeImageForUpload(rawFile);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${user.id}/${artistId}/imported_${Date.now()}.${ext}`;
      const { error: upErr } = await (supabase as any).storage
        .from("look-composites")
        .upload(path, file, { contentType: file.type || "image/png" });
      if (upErr) throw upErr;
      const { data: row, error } = await supabase
        .from("artist_looks")
        .insert({
          artist_id: artistId,
          user_id: user.id,
          name: `Canvas · ${file.name.replace(/\.[^.]+$/, "").slice(0, 48)}`,
          status: "complete",
          generated_image_url: path,
          generated_storage_path: path,
          composition_recipe_json: { imported_canvas: true } as never,
        } as never)
        .select("*")
        .single();
      if (error) throw error;
      toast.success("Canvas imported — now apply your identity");
      navigate({
        to: "/artists/$id/looks/$lookId",
        params: { id: artistId, lookId: (row as { id: string }).id },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const visible = useMemo(() => {
    const looks = looksQuery.data ?? [];
    if (filter === "all") return looks.filter((l) => l.status !== "archived");
    return looks.filter((l) => l.status === filter);
  }, [looksQuery.data, filter]);

  const counts = useMemo(() => {
    const looks = looksQuery.data ?? [];
    return {
      all: looks.filter((l) => l.status !== "archived").length,
      draft: looks.filter((l) => l.status === "draft").length,
      approved: looks.filter((l) => l.status === "approved").length,
      locked: looks.filter((l) => l.status === "locked").length,
      archived: looks.filter((l) => l.status === "archived").length,
      failed: looks.filter((l) => l.status === "failed").length,
      complete: looks.filter((l) => l.status === "complete").length,
      error: looks.filter((l) => l.status === "error").length,
      pending: looks.filter((l) => l.status === "pending").length,
    };
  }, [looksQuery.data]);

  return (
    <>
      <PageHeader
        title={artistQuery.data ? `${artistQuery.data.name} — Virtual Samples` : "Virtual Samples"}
        subtitle="Identity-locked outfit composites. Reusable across shots and projects."
      />
      <div className="space-y-6 px-8 py-6">
        <div className="flex items-center justify-between gap-3">
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_UPLOAD_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={importing}
            onClick={() => fileRef.current?.click()}
            title="Upload a fully-clothed stand-in image (e.g. from Grok) to use as an identity-swap canvas"
          >
            <ImageUp className="mr-1.5 h-3.5 w-3.5" />
            {importing ? "Importing…" : "Import canvas"}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/artists">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              All artists
            </Link>
          </Button>

          <div className="flex items-center gap-3">
            <Select value={filter} onValueChange={(v) => setFilter(v as FilterOption)}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  All looks ({counts.all})
                </SelectItem>
                {LOOK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s} ({counts[s]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button asChild size="sm">
              <Link
                to="/artists/$id/looks/new"
                params={{ id: artistId }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Compose look
              </Link>
            </Button>
          </div>
        </div>

        {looksQuery.isLoading && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] animate-pulse rounded-md border border-border bg-muted/20"
              />
            ))}
          </div>
        )}

        {!looksQuery.isLoading && visible.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-12 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <h2 className="mt-3 text-base font-medium">
              {filter === "all"
                ? "No looks yet"
                : `No ${filter} looks`}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {filter === "all"
                ? "Compose your first identity-locked outfit."
                : "Try a different filter or create a new look."}
            </p>
            <div className="mt-4">
              <Button asChild size="sm">
                <Link
                  to="/artists/$id/looks/new"
                  params={{ id: artistId }}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Compose your first look
                </Link>
              </Button>
            </div>
          </div>
        )}

        {visible.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visible.map((look) => (
              <LookCard key={look.id} look={look} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
