import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type Look,
  type LookStatus,
  useAllLooks,
  LOOK_STATUSES,
} from "@/lib/queries/looks";
import { useArtists } from "@/lib/queries/artists";
import { LookCard } from "@/components/looks/LookCard";

type FilterOption = "all" | LookStatus;

// ---------------------------------------------------------------------------
// /looks — cross-artist library of every saved look. Pairs with the per-artist
// /artists/$id/looks page; this is the global directory the audit identified
// as missing.
// ---------------------------------------------------------------------------
export default function LooksPage() {
  const looksQuery = useAllLooks();
  const artistsQuery = useArtists();
  const [filter, setFilter] = useState<FilterOption>("all");

  const artistById = useMemo(
    () => new Map((artistsQuery.data ?? []).map((a) => [a.id, a])),
    [artistsQuery.data],
  );

  const visible = useMemo<Look[]>(() => {
    const looks = looksQuery.data ?? [];
    if (filter === "all") return looks.filter((l) => l.status !== "archived");
    return looks.filter((l) => l.status === filter);
  }, [looksQuery.data, filter]);

  const counts = useMemo(() => {
    const looks = looksQuery.data ?? [];
    const result: Record<"all" | LookStatus, number> = {
      all: 0,
      draft: 0,
      approved: 0,
      locked: 0,
      archived: 0,
      failed: 0,
      complete: 0,
      error: 0,
      pending: 0,
    };
    result.all = looks.filter((l) => l.status !== "archived").length;
    for (const l of looks) {
      result[l.status] += 1;
    }
    return result;
  }, [looksQuery.data]);

  // Group looks by artist for section rendering.
  const grouped = useMemo(() => {
    const map = new Map<string, Look[]>();
    for (const look of visible) {
      const arr = map.get(look.artist_id) ?? [];
      arr.push(look);
      map.set(look.artist_id, arr);
    }
    // Stable order: artist name asc, then unknown bucket last.
    return Array.from(map.entries()).sort(([a], [b]) => {
      const an = artistById.get(a)?.name ?? "￿";
      const bn = artistById.get(b)?.name ?? "￿";
      return an.localeCompare(bn);
    });
  }, [visible, artistById]);

  return (
    <>
      <PageHeader
        title="Looks"
        subtitle="Every saved look across all artists."
      />

      <div className="space-y-6 px-4 py-6 md:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterOption)}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All looks ({counts.all})</SelectItem>
              {LOOK_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s} ({counts[s]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="text-xs text-muted-foreground">
            New looks are composed inside an artist's profile.
          </div>
        </div>

        {looksQuery.isLoading && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] animate-pulse rounded-md border border-border bg-muted/20"
              />
            ))}
          </div>
        )}

        {looksQuery.error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load looks:{" "}
            {looksQuery.error instanceof Error
              ? looksQuery.error.message
              : String(looksQuery.error)}
          </div>
        )}

        {!looksQuery.isLoading && visible.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-12 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <h2 className="mt-3 text-base font-medium">
              {filter === "all" ? "No looks yet" : `No ${filter} looks`}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {filter === "all"
                ? "Open an artist's profile and compose your first identity-locked outfit."
                : "Try a different filter or compose a new look from an artist's profile."}
            </p>
            <div className="mt-4">
              <Button asChild size="sm" variant="outline">
                <Link to="/artists">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Open artists
                </Link>
              </Button>
            </div>
          </div>
        )}

        {grouped.length > 0 && (
          <div className="space-y-8">
            {grouped.map(([artistId, looks]) => {
              const artist = artistById.get(artistId);
              return (
                <section key={artistId}>
                  <header className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold tracking-tight">
                      {artist?.name ?? "Unknown artist"}{" "}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        ({looks.length})
                      </span>
                    </h2>
                    <Button asChild size="sm" variant="ghost" className="text-xs">
                      <Link
                        to="/artists/$id/looks"
                        params={{ id: artistId }}
                      >
                        View artist looks
                      </Link>
                    </Button>
                  </header>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {looks.map((look) => (
                      <LookCard key={look.id} look={look} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
