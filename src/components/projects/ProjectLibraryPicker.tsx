import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, Package, Pin, PinOff, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signedUrls } from "@/lib/storage";
import {
  type LocationItem,
  useLocations,
} from "@/lib/queries/locations";
import { type PropItem, useProps } from "@/lib/queries/props";
import {
  useProjectLocationPicks,
  useProjectPropPicks,
  usePinLocation,
  usePinProp,
  useUnpinLocation,
  useUnpinProp,
} from "@/lib/queries/projectLibraryPicks";

/**
 * Two stacked picker panels on the project page: pinned locations and pinned
 * props, each with an inline "Add from library" picker.
 */
export function ProjectLibraryPicker({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-4">
      <LocationsPicker projectId={projectId} />
      <PropsPicker projectId={projectId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Locations picker
// ---------------------------------------------------------------------------
function LocationsPicker({ projectId }: { projectId: string }) {
  const pinnedQuery = useProjectLocationPicks(projectId);
  const allQuery = useLocations();
  const pin = usePinLocation();
  const unpin = useUnpinLocation();
  const [showAdd, setShowAdd] = useState(false);

  const pinned = pinnedQuery.data ?? [];
  const pinnedIds = useMemo(() => new Set(pinned.map((p) => p.id)), [pinned]);
  const unpinnedAvailable = (allQuery.data ?? []).filter((l) => !pinnedIds.has(l.id));

  return (
    <section className="rounded-md border border-border bg-card/30">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          Locations
          <span className="rounded-sm bg-muted/40 px-1.5 py-0.5 text-[10px] normal-case text-muted-foreground">
            {pinned.length} pinned
          </span>
        </h3>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
            <Link to="/library/locations">Manage library →</Link>
          </Button>
          <Button
            size="sm"
            variant={showAdd ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setShowAdd((v) => !v)}
            disabled={unpinnedAvailable.length === 0}
            title={unpinnedAvailable.length === 0 ? "All library locations already pinned" : undefined}
          >
            {showAdd ? <X className="mr-1 h-3 w-3" /> : <Plus className="mr-1 h-3 w-3" />}
            {showAdd ? "Done" : "Pin"}
          </Button>
        </div>
      </header>

      <div className="p-3">
        {pinned.length === 0 && !showAdd && (
          <p className="rounded-sm border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            No locations pinned to this project yet.{" "}
            {(allQuery.data ?? []).length === 0 ? (
              <Link to="/library/locations" className="underline">
                Build your library
              </Link>
            ) : (
              <button type="button" onClick={() => setShowAdd(true)} className="underline">
                Pick from your library
              </button>
            )}
            .
          </p>
        )}
        {pinned.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {pinned.map((item) => (
              <PickerTile
                key={item.id}
                bucket="location-refs"
                title={item.name}
                fileUrl={item.file_url}
                onUnpin={async () => {
                  try {
                    await unpin.mutateAsync({ projectId, locationId: item.id });
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Unpin failed");
                  }
                }}
              />
            ))}
          </div>
        )}

        {showAdd && unpinnedAvailable.length > 0 && (
          <div className="mt-3 rounded-sm border border-border bg-muted/10 p-3">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              Pick from library
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {unpinnedAvailable.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={async () => {
                    try {
                      await pin.mutateAsync({ projectId, locationId: item.id });
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Pin failed");
                    }
                  }}
                  className="text-left"
                >
                  <PickerTile
                    bucket="location-refs"
                    title={item.name}
                    fileUrl={item.file_url}
                    actionIcon={<Pin className="h-3 w-3" />}
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Props picker
// ---------------------------------------------------------------------------
function PropsPicker({ projectId }: { projectId: string }) {
  const pinnedQuery = useProjectPropPicks(projectId);
  const allQuery = useProps();
  const pin = usePinProp();
  const unpin = useUnpinProp();
  const [showAdd, setShowAdd] = useState(false);

  const pinned = pinnedQuery.data ?? [];
  const pinnedIds = useMemo(() => new Set(pinned.map((p) => p.id)), [pinned]);
  const unpinnedAvailable = (allQuery.data ?? []).filter((p) => !pinnedIds.has(p.id));

  return (
    <section className="rounded-md border border-border bg-card/30">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          Props
          <span className="rounded-sm bg-muted/40 px-1.5 py-0.5 text-[10px] normal-case text-muted-foreground">
            {pinned.length} pinned
          </span>
        </h3>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
            <Link to="/library/props">Manage library →</Link>
          </Button>
          <Button
            size="sm"
            variant={showAdd ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setShowAdd((v) => !v)}
            disabled={unpinnedAvailable.length === 0}
            title={unpinnedAvailable.length === 0 ? "All library props already pinned" : undefined}
          >
            {showAdd ? <X className="mr-1 h-3 w-3" /> : <Plus className="mr-1 h-3 w-3" />}
            {showAdd ? "Done" : "Pin"}
          </Button>
        </div>
      </header>

      <div className="p-3">
        {pinned.length === 0 && !showAdd && (
          <p className="rounded-sm border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            No props pinned to this project yet.{" "}
            {(allQuery.data ?? []).length === 0 ? (
              <Link to="/library/props" className="underline">
                Build your library
              </Link>
            ) : (
              <button type="button" onClick={() => setShowAdd(true)} className="underline">
                Pick from your library
              </button>
            )}
            .
          </p>
        )}
        {pinned.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {pinned.map((item) => (
              <PickerTile
                key={item.id}
                bucket="prop-refs"
                title={item.name}
                fileUrl={item.file_url}
                onUnpin={async () => {
                  try {
                    await unpin.mutateAsync({ projectId, propId: item.id });
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Unpin failed");
                  }
                }}
              />
            ))}
          </div>
        )}

        {showAdd && unpinnedAvailable.length > 0 && (
          <div className="mt-3 rounded-sm border border-border bg-muted/10 p-3">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              Pick from library
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {unpinnedAvailable.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={async () => {
                    try {
                      await pin.mutateAsync({ projectId, propId: item.id });
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Pin failed");
                    }
                  }}
                  className="text-left"
                >
                  <PickerTile
                    bucket="prop-refs"
                    title={item.name}
                    fileUrl={item.file_url}
                    actionIcon={<Pin className="h-3 w-3" />}
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared tile
// ---------------------------------------------------------------------------
function PickerTile({
  bucket,
  title,
  fileUrl,
  onUnpin,
  actionIcon,
}: {
  bucket: "location-refs" | "prop-refs";
  title: string;
  fileUrl: string;
  onUnpin?: () => void | Promise<void>;
  actionIcon?: React.ReactNode;
}) {
  const [signed, setSigned] = useState<string | null>(null);
  useEffect(() => {
    signedUrls(bucket as any, [fileUrl], 3600)
      .then((map) => setSigned(map[fileUrl] ?? null))
      .catch(() => setSigned(null));
  }, [bucket, fileUrl]);
  return (
    <div className="group relative">
      <div className="aspect-square overflow-hidden rounded-sm border border-border bg-muted/30">
        {signed ? (
          <img src={signed} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
            Loading…
          </div>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between gap-1">
        <p className="truncate text-[10px] text-muted-foreground">{title}</p>
        {onUnpin && (
          <button
            type="button"
            onClick={onUnpin}
            className="rounded-sm p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
            title="Unpin from project"
          >
            <PinOff className="h-3 w-3" />
          </button>
        )}
        {!onUnpin && actionIcon && (
          <span className="rounded-sm p-0.5 text-muted-foreground">{actionIcon}</span>
        )}
      </div>
    </div>
  );
}
