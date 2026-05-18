import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { signedUrls } from "@/lib/storage";
import { usePickableLooksForArtist, type Look } from "@/lib/queries/looks";
import {
  useShotLockedLook,
  useSetShotLockedLook,
} from "@/lib/queries/shotLockedLook";

const NONE_VALUE = "_none_";

/**
 * Inline picker mounted on the shot detail page. Lets the user lock the shot
 * to one approved/locked look for the artist on the project. Once set, the
 * prompt compiler picks up the look's generated_image_url as the primary
 * reference for image-to-video providers.
 */
export function ShotLockedLookPicker({
  shotId,
  projectId,
  artistId,
}: {
  shotId: string;
  projectId: string;
  artistId: string | null;
}) {
  const lockedQuery = useShotLockedLook(shotId);
  const pickableQuery = usePickableLooksForArtist(artistId ?? undefined);
  const setLockedLook = useSetShotLockedLook();
  const [preview, setPreview] = useState<string | null>(null);

  const lockedLook = lockedQuery.data ?? null;
  const lockedPath = lockedLook?.generated_storage_path ?? null;

  useEffect(() => {
    if (!lockedPath) {
      setPreview(null);
      return;
    }
    signedUrls("look-composites" as any, [lockedPath], 3600)
      .then((m) => setPreview(m[lockedPath] ?? null))
      .catch(() => setPreview(null));
  }, [lockedPath]);

  if (!artistId) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        Assign an artist to this project to lock looks to shots.
      </div>
    );
  }

  const looks: Look[] = pickableQuery.data ?? [];
  const noLooks = !pickableQuery.isLoading && looks.length === 0;

  return (
    <section className="rounded-md border border-border bg-card/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Locked look
        </h2>
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
          <Link to="/artists/$id/looks" params={{ id: artistId }}>
            Manage looks →
          </Link>
        </Button>
      </div>

      {noLooks && (
        <div className="rounded-sm border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
          No approved or locked looks for this artist yet.{" "}
          <Link
            to="/artists/$id/looks/new"
            params={{ id: artistId }}
            className="underline"
          >
            Compose one
          </Link>{" "}
          first.
        </div>
      )}

      {!noLooks && (
        <div className="space-y-3">
          <Select
            value={lockedLook?.id ?? NONE_VALUE}
            onValueChange={async (v) => {
              try {
                await setLockedLook.mutateAsync({
                  shotId,
                  lookId: v === NONE_VALUE ? null : v,
                  projectId,
                });
                toast.success(v === NONE_VALUE ? "Unlocked" : "Look locked to shot");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed");
              }
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="No look locked" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>
                <span className="inline-flex items-center gap-1.5">
                  <Unlock className="h-3 w-3" />
                  No look (use Character DNA)
                </span>
              </SelectItem>
              {looks.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                  {l.status === "locked" ? " · primary" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {lockedLook && (
            <div className="flex items-center gap-3 rounded-sm border border-border bg-muted/10 p-2">
              <div className="h-16 w-16 overflow-hidden rounded-sm border border-border bg-muted/30">
                {preview ? (
                  <img src={preview} alt={lockedLook.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[9px] text-muted-foreground">
                    …
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{lockedLook.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  This image is now the primary reference for any image-to-video
                  generation on this shot.
                </p>
              </div>
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                <Link
                  to="/artists/$id/looks/$lookId"
                  params={{ id: artistId, lookId: lockedLook.id }}
                >
                  Open
                </Link>
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
