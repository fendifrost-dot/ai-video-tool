import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Archive,
  Check,
  Copy,
  Edit,
  Loader2,
  Lock,
  MoreHorizontal,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signedUrls } from "@/lib/storage";
import {
  type Look,
  formatCost,
  getLookPublicImageUrl,
  useDeleteLook,
  useLockLookAsPrimary,
  useUpdateLook,
} from "@/lib/queries/looks";
import {
  getCanonicalBaseImageUrl,
  useArtist,
} from "@/lib/queries/artists";

// ---------------------------------------------------------------------------
// LookCard — single tile in the artist Looks grid.
//
// Supports an optional select-mode (used by the cross-artist /looks library
// for bulk delete). When `selectMode` is true the card becomes a tap target
// for toggling selection rather than a link to the detail page, and a
// checkbox overlays the top-left corner.
// ---------------------------------------------------------------------------
export function LookCard({
  look,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: {
  look: Look;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (lookId: string) => void;
}) {
  const [signed, setSigned] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const update = useUpdateLook();
  const lock = useLockLookAsPrimary();
  const del = useDeleteLook();

  useEffect(() => {
    if (!look.generated_storage_path) {
      setSigned(null);
      return;
    }
    signedUrls("look-composites" as any, [look.generated_storage_path], 3600)
      .then((map) => setSigned(map[look.generated_storage_path!] ?? null))
      .catch(() => setSigned(null));
  }, [look.generated_storage_path]);

  const isLocked = look.status === "locked";
  const isArchived = look.status === "archived";
  // Read the artist row to surface the canonical-base badge. The cached
  // query is shared with the rest of the app so this doesn't add a fetch
  // when the user navigates between the library and detail page.
  const artistQuery = useArtist(look.artist_id);
  const lookPublicUrl = getLookPublicImageUrl(look);
  const isCanonicalBase =
    !!lookPublicUrl &&
    getCanonicalBaseImageUrl(artistQuery.data) === lookPublicUrl;

  const onSelectTap = () => onToggleSelect?.(look.id);

  const handleDelete = async () => {
    try {
      await del.mutateAsync({ id: look.id, artistId: look.artist_id });
      toast.success("Deleted");
      setDeleteOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  // ---- image element (re-used inside Link or button wrapper) ------------
  const imageEl = (
    <div className="aspect-[3/4] overflow-hidden rounded-t-md bg-muted/30">
      {signed ? (
        <img
          src={signed}
          alt={look.name}
          className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
        />
      ) : look.status === "pending" ? (
        <LookCardPendingSkeleton />
      ) : (
        <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
          {look.generated_storage_path ? "Loading…" : "No image"}
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`group relative flex flex-col rounded-md border bg-card/30 ${
        selectMode && selected
          ? "border-primary ring-2 ring-primary/60"
          : "border-border"
      }`}
    >
      {isCanonicalBase && (
        <span
          className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1 rounded-sm bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-50 shadow"
          title="Saved as the artist's canonical base identity photo"
        >
          <Star className="h-2.5 w-2.5 fill-current" />
          Canonical
        </span>
      )}

      {/* Select-mode overlay: large tap target with checkbox in the corner.
          We intentionally cover the whole image so finger taps anywhere on
          the thumbnail toggle selection on mobile. */}
      {selectMode && (
        <button
          type="button"
          onClick={onSelectTap}
          aria-label={selected ? "Deselect look" : "Select look"}
          aria-pressed={selected}
          className="absolute inset-x-0 top-0 z-20 flex aspect-[3/4] items-start justify-start p-2"
        >
          <span
            className={`flex h-11 w-11 items-center justify-center rounded-full shadow-md ${
              selected
                ? "bg-primary text-primary-foreground"
                : "bg-background/80 backdrop-blur"
            }`}
          >
            <Checkbox
              checked={selected}
              tabIndex={-1}
              className="pointer-events-none h-5 w-5"
            />
          </span>
        </button>
      )}

      {selectMode ? (
        // In select mode the image is decorative; the overlay button owns
        // taps. Render the same imageEl but without a Link so accidental
        // navigation can't happen mid-bulk-select.
        <div className="block">{imageEl}</div>
      ) : (
        <Link
          to="/artists/$id/looks/$lookId"
          params={{ id: look.artist_id, lookId: look.id }}
          className="block"
        >
          {imageEl}
        </Link>
      )}

      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium" title={look.name}>
            {look.name}
          </h3>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <StatusPill status={look.status} />
            <span>·</span>
            <span>{formatCost(look.cost_cents)}</span>
            {look.iterations > 1 && (
              <>
                <span>·</span>
                <span>v{look.iterations}</span>
              </>
            )}
          </div>
        </div>

        {/* Action menu is hidden in select mode to keep the UI focused on
            the bulk-delete affordance and avoid a double-confirm flow. */}
        {!selectMode && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                // 44px touch target — mobile-friendly, replaces the old
                // 28px hover-fade trigger.
                className="h-11 w-11 shrink-0"
                aria-label="Look actions"
              >
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs">
              <DropdownMenuItem asChild>
                <Link
                  to="/artists/$id/looks/$lookId"
                  params={{ id: look.artist_id, lookId: look.id }}
                >
                  <Edit className="mr-2 h-3.5 w-3.5" />
                  View / edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={async () => {
                  try {
                    await update.mutateAsync({
                      id: look.id,
                      artistId: look.artist_id,
                      patch: { status: "approved" },
                    });
                    toast.success("Approved");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Approve failed");
                  }
                }}
                disabled={isArchived || look.status === "approved" || isLocked}
              >
                <Check className="mr-2 h-3.5 w-3.5" />
                Approve
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={async () => {
                  try {
                    await lock.mutateAsync({ id: look.id, artistId: look.artist_id });
                    toast.success("Locked as primary look");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Lock failed");
                  }
                }}
                disabled={isArchived || isLocked}
              >
                <Lock className="mr-2 h-3.5 w-3.5" />
                Lock as primary
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link
                  to="/artists/$id/looks/new"
                  params={{ id: look.artist_id }}
                  search={{ parentLookId: look.id } as any}
                >
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Duplicate / iterate
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={async () => {
                  try {
                    await update.mutateAsync({
                      id: look.id,
                      artistId: look.artist_id,
                      patch: { status: "archived" },
                    });
                    toast.success("Archived");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Archive failed");
                  }
                }}
                disabled={isArchived}
              >
                <Archive className="mr-2 h-3.5 w-3.5" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                // Block delete on the canonical base — it's a one-step
                // recovery (clear the canonical, then delete) vs. an
                // irreversible mistake (delete the photo CC pipelines
                // reference).
                disabled={isCanonicalBase}
                onSelect={(e) => {
                  // Defer dialog open until the menu has fully closed so
                  // Radix's focus management doesn't race with the new
                  // dialog's focus trap on mobile.
                  e.preventDefault();
                  setTimeout(() => setDeleteOpen(true), 0);
                }}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                {isCanonicalBase ? "Delete (clear canonical first)" : "Delete permanently"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Confirm dialog — replaces native confirm() which can be unreliable
          on mobile browsers (especially when wrapped in a Radix menu). */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this look?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{look.name}</span> will be removed
              from your library. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={del.isPending}
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
            >
              {del.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LookCardPendingSkeleton — gradient shimmer + spinner + "Generating…" caption.
// Rendered in place of the static "No image" text while the async pipeline
// runs (status === 'pending'). Reused by the composer's pending preview so
// the two surfaces stay visually consistent.
// ---------------------------------------------------------------------------
export function LookCardPendingSkeleton({
  caption = "Generating…",
}: {
  caption?: string;
}) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-muted/30">
      {/* Animated gradient shimmer */}
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
      <style>{`@keyframes shimmer { 100% { transform: translateX(100%); } }`}</style>
      <div className="relative z-10 flex flex-col items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{caption}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status pill (compact)
// ---------------------------------------------------------------------------
export function StatusPill({ status }: { status: Look["status"] }) {
  const styles: Record<Look["status"], string> = {
    draft: "bg-muted/40 text-muted-foreground",
    approved: "bg-emerald-500/15 text-emerald-400",
    locked: "bg-blue-500/15 text-blue-400",
    archived: "bg-muted/20 text-muted-foreground/60 line-through",
    failed: "bg-red-500/15 text-red-400",
    complete: "bg-violet-500/15 text-violet-400",
    error: "bg-red-500/15 text-red-400",
    pending: "bg-amber-500/15 text-amber-400",
  };
  return (
    <span
      className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${styles[status]}`}
    >
      {status === "locked" && <Lock className="mr-0.5 inline-block h-2.5 w-2.5 -translate-y-px" />}
      {status}
    </span>
  );
}
