import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Archive, Check, Copy, Edit, Lock, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  useDeleteLook,
  useLockLookAsPrimary,
  useUpdateLook,
} from "@/lib/queries/looks";

// ---------------------------------------------------------------------------
// LookCard — single tile in the artist Looks grid.
// ---------------------------------------------------------------------------
export function LookCard({ look }: { look: Look }) {
  const [signed, setSigned] = useState<string | null>(null);
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

  return (
    <div className="group relative flex flex-col rounded-md border border-border bg-card/30">
      <Link
        to="/artists/$id/looks/$lookId"
        params={{ id: look.artist_id, lookId: look.id }}
        className="block"
      >
        <div className="aspect-[3/4] overflow-hidden rounded-t-md bg-muted/30">
          {signed ? (
            <img
              src={signed}
              alt={look.name}
              className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
              {look.generated_storage_path ? "Loading…" : "No image"}
            </div>
          )}
        </div>
      </Link>

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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-60 hover:opacity-100"
              aria-label="Look actions"
            >
              <MoreHorizontal className="h-4 w-4" />
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
              onSelect={async () => {
                if (
                  !confirm(
                    `Delete look "${look.name}"? This cannot be undone.`,
                  )
                ) {
                  return;
                }
                try {
                  await del.mutateAsync({ id: look.id, artistId: look.artist_id });
                  toast.success("Deleted");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Delete failed");
                }
              }}
            >
              Delete permanently
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
