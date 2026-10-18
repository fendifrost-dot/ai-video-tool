import { useMemo, useState } from "react";
import type { ProjectAsset } from "@/integrations/supabase/aliases";
import { groupVersions, versionLabel, type VersionKind } from "@/lib/editor/versionLabels";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ORDER: VersionKind[] = ["original", "dressed", "montage", "composite", "restaged", "other"];
const SECTION: Record<VersionKind, string> = {
  original: "Original takes",
  dressed: "Dressed takes",
  montage: "Montages",
  composite: "Composites",
  restaged: "Restaged",
  other: "Other versions",
};

type Props = {
  assets: ProjectAsset[];
  previewAssetId: string | null;
  onPreview: (asset: ProjectAsset) => void;
  onAddToTimeline: (asset: ProjectAsset) => void;
  onReplaceSelected: (asset: ProjectAsset) => void;
  hasSelection: boolean;
  className?: string;
};

/**
 * Version browser: preview without changing the production selection.
 * Adding or replacing a timeline clip is always an explicit button.
 */
export function MediaBrowser({
  assets,
  previewAssetId,
  onPreview,
  onAddToTimeline,
  onReplaceSelected,
  hasSelection,
  className,
}: Props) {
  const groups = useMemo(() => groupVersions(assets), [assets]);
  const [open, setOpen] = useState<VersionKind | "all">("all");

  return (
    <div
      className={cn("flex h-full min-h-0 flex-col rounded-xl border border-border bg-card", className)}
      data-testid="media-browser"
    >
      <div className="border-b border-border px-3 py-2">
        <h2 className="font-display text-sm font-semibold text-foreground">Versions</h2>
        <p className="text-[11px] text-muted-foreground">
          Preview first. Add or replace on the timeline only when you choose.
        </p>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
        <Button
          size="sm"
          variant={open === "all" ? "default" : "outline"}
          onClick={() => setOpen("all")}
        >
          All
        </Button>
        {ORDER.map((k) =>
          groups[k].length ? (
            <Button
              key={k}
              size="sm"
              variant={open === k ? "default" : "outline"}
              onClick={() => setOpen(k)}
            >
              {SECTION[k]} ({groups[k].length})
            </Button>
          ) : null,
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
        {ORDER.filter((k) => open === "all" || open === k).map((k) => {
          const list = groups[k];
          if (!list.length) return null;
          return (
            <section key={k}>
              <h3 className="mb-1 px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {SECTION[k]}
              </h3>
              <ul className="space-y-1">
                {list.map((asset) => {
                  const active = previewAssetId === asset.id;
                  return (
                    <li
                      key={asset.id}
                      className={cn(
                        "rounded-lg border px-2 py-1.5",
                        active ? "border-primary bg-secondary" : "border-border/70 bg-background/40",
                      )}
                    >
                      <button
                        type="button"
                        className="w-full text-left text-xs text-foreground"
                        onClick={() => onPreview(asset)}
                      >
                        {versionLabel(asset)}
                      </button>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" onClick={() => onPreview(asset)}>
                          Preview
                        </Button>
                        <Button size="sm" variant="default" onClick={() => onAddToTimeline(asset)}>
                          Add to timeline
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!hasSelection}
                          onClick={() => onReplaceSelected(asset)}
                        >
                          Replace selected
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {!ORDER.some((k) => groups[k].length) && (
          <p className="px-2 py-4 text-sm text-muted-foreground">No video versions in this project yet.</p>
        )}
      </div>
    </div>
  );
}
