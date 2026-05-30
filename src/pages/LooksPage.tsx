import { useCallback, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, ListChecks, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  formatBulkDeleteToast,
  getLookPublicImageUrl,
  shouldFrictionWarn,
  summarizeBulkDeleteResults,
  useAllLooks,
  useDeleteLook,
  LOOK_STATUSES,
} from "@/lib/queries/looks";
import {
  getCanonicalBaseImageUrl,
  useArtists,
} from "@/lib/queries/artists";
import { LookCard } from "@/components/looks/LookCard";

type FilterOption = "all" | LookStatus;

// ---------------------------------------------------------------------------
// /looks — cross-artist library of every saved look. Pairs with the per-artist
// /artists/$id/looks page; this is the global directory the audit identified
// as missing.
//
// Supports a "Select" mode for bulk deletion — Fendi was unable to prune
// his 66-look library on mobile because the per-card hover affordances
// didn't trigger on touch. This page is the cleanup surface.
// ---------------------------------------------------------------------------
export default function LooksPage() {
  const looksQuery = useAllLooks();
  const artistsQuery = useArtists();
  const del = useDeleteLook();
  const [filter, setFilter] = useState<FilterOption>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkInFlight, setBulkInFlight] = useState(false);

  const artistById = useMemo(
    () => new Map((artistsQuery.data ?? []).map((a) => [a.id, a])),
    [artistsQuery.data],
  );

  const visible = useMemo<Look[]>(() => {
    const looks = looksQuery.data ?? [];
    if (filter === "all") return looks.filter((l) => l.status !== "archived");
    return looks.filter((l) => l.status === filter);
  }, [looksQuery.data, filter]);

  // Look IDs that are canonical bases for their artist. We block these
  // from bulk-selection: the recovery path (clear canonical first, then
  // delete) is intentional friction vs. the irreversible mistake of
  // wiping the artist's identity photo.
  const canonicalLookIds = useMemo(() => {
    const ids = new Set<string>();
    for (const look of looksQuery.data ?? []) {
      const url = getLookPublicImageUrl(look);
      if (!url) continue;
      const artist = artistById.get(look.artist_id);
      if (getCanonicalBaseImageUrl(artist) === url) ids.add(look.id);
    }
    return ids;
  }, [looksQuery.data, artistById]);

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

  const toggleSelect = useCallback(
    (lookId: string) => {
      if (canonicalLookIds.has(lookId)) {
        toast.error(
          "This look is the artist's canonical base. Clear it on the look's detail page before deleting.",
        );
        return;
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(lookId)) next.delete(lookId);
        else next.add(lookId);
        return next;
      });
    },
    [canonicalLookIds],
  );

  const enterSelectMode = () => {
    setSelectMode(true);
    setSelectedIds(new Set());
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const selectAllVisible = () => {
    // Skip canonical-base looks — they require the clear-first flow.
    const ids = new Set(
      visible.filter((l) => !canonicalLookIds.has(l.id)).map((l) => l.id),
    );
    setSelectedIds(ids);
  };

  const handleBulkDelete = async () => {
    setBulkInFlight(true);
    const ids = Array.from(selectedIds);
    // Per-item resilience: one failed row should not abort the rest. The
    // mutation cache invalidates after each success, but we accept the
    // small thrash here in exchange for transparent per-item reporting.
    const settled = await Promise.allSettled(
      ids.map((id) => {
        const look = looksQuery.data?.find((l) => l.id === id);
        if (!look) return Promise.reject(new Error("Look missing from cache"));
        return del.mutateAsync({ id: look.id, artistId: look.artist_id });
      }),
    );
    const summary = summarizeBulkDeleteResults(settled);
    if (summary.failed === 0) {
      toast.success(formatBulkDeleteToast(summary));
    } else {
      toast.error(formatBulkDeleteToast(summary));
    }
    setBulkInFlight(false);
    setBulkConfirmOpen(false);
    exitSelectMode();
  };

  const selectedCount = selectedIds.size;
  const friction = shouldFrictionWarn(selectedCount);

  return (
    <>
      <PageHeader
        title="Looks"
        subtitle="Every saved look across all artists."
      />

      <div className="space-y-6 px-4 py-6 md:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as FilterOption)}>
              <SelectTrigger className="h-10 w-[180px] text-xs">
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
            {!selectMode ? (
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                onClick={enterSelectMode}
                disabled={visible.length === 0}
              >
                <ListChecks className="mr-1.5 h-4 w-4" />
                Select
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-[44px]"
                  onClick={selectAllVisible}
                >
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  Select all
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-[44px]"
                  onClick={exitSelectMode}
                >
                  <X className="mr-1.5 h-4 w-4" />
                  Cancel
                </Button>
              </>
            )}
          </div>

          {!selectMode && (
            <div className="text-xs text-muted-foreground">
              New looks are composed inside an artist's profile.
            </div>
          )}
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
          // pb-32 leaves room under the floating bulk-action bar so the
          // last row of cards isn't covered on mobile.
          <div className={`space-y-8 ${selectMode ? "pb-32" : ""}`}>
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
                    {!selectMode && (
                      <Button asChild size="sm" variant="ghost" className="text-xs">
                        <Link
                          to="/artists/$id/looks"
                          params={{ id: artistId }}
                        >
                          View artist looks
                        </Link>
                      </Button>
                    )}
                  </header>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {looks.map((look) => (
                      <LookCard
                        key={look.id}
                        look={look}
                        selectMode={selectMode}
                        selected={selectedIds.has(look.id)}
                        onToggleSelect={toggleSelect}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating bulk-action bar — pinned to bottom on mobile, centered
          on desktop. Only renders in select mode. */}
      {selectMode && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2">
          <div className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
            <span className="text-sm font-medium">
              {selectedCount === 0
                ? "Tap looks to select"
                : `${selectedCount} selected`}
            </span>
            <Button
              variant="destructive"
              size="sm"
              className="min-h-[44px]"
              disabled={selectedCount === 0 || bulkInFlight}
              onClick={() => setBulkConfirmOpen(true)}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {friction
                ? `You're about to delete ${selectedCount} looks.`
                : `Delete ${selectedCount} look${selectedCount === 1 ? "" : "s"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {friction
                ? "This cannot be undone. The selected looks will be removed from your library permanently."
                : "This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]" disabled={bulkInFlight}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkInFlight || selectedCount === 0}
              onClick={(e) => {
                e.preventDefault();
                handleBulkDelete();
              }}
            >
              {bulkInFlight ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                `Delete ${selectedCount}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
