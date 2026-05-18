import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { signedUrls } from "@/lib/storage";

export type AssetBucket =
  | "artist-assets"
  | "wardrobe-refs"
  | "location-refs"
  | "prop-refs"
  | "look-composites";

// ---------------------------------------------------------------------------
// AssetThumb — generic square thumbnail with category badge + optional remove
// ---------------------------------------------------------------------------
export function AssetThumb({
  bucket,
  path,
  label,
  badge,
  onRemove,
  size = "md",
  rounded = "sm",
  onClick,
  selected,
}: {
  bucket: AssetBucket;
  path: string | null | undefined;
  label?: string;
  badge?: string;
  onRemove?: () => void;
  size?: "sm" | "md" | "lg";
  rounded?: "sm" | "md";
  onClick?: () => void;
  selected?: boolean;
}) {
  const [signed, setSigned] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setSigned(null);
      return;
    }
    let cancelled = false;
    signedUrls(bucket as any, [path], 3600)
      .then((map) => {
        if (cancelled) return;
        setSigned(map[path] ?? null);
      })
      .catch(() => {
        if (!cancelled) setSigned(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bucket, path]);

  const sizeClass =
    size === "sm" ? "h-14 w-14" : size === "lg" ? "h-24 w-24" : "h-20 w-20";
  const roundedClass = rounded === "md" ? "rounded-md" : "rounded-sm";
  const ringClass = selected
    ? "ring-2 ring-primary"
    : "border border-border";

  const inner = (
    <div className={`relative ${sizeClass} ${roundedClass} ${ringClass} overflow-hidden bg-muted/30`}>
      {signed ? (
        <img src={signed} alt={label ?? ""} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-[9px] text-muted-foreground">
          {path ? "…" : "—"}
        </div>
      )}
      {badge && (
        <span className="absolute left-0.5 top-0.5 rounded-sm bg-black/60 px-1 py-[1px] text-[8px] uppercase tracking-wide text-white">
          {badge}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 hover:bg-destructive group-hover:opacity-100"
          aria-label="Remove"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group block text-left"
        title={label}
      >
        {inner}
        {label && (
          <p className="mt-1 max-w-[80px] truncate text-[9px] text-muted-foreground">
            {label}
          </p>
        )}
      </button>
    );
  }

  return (
    <div className="group">
      {inner}
      {label && (
        <p className="mt-1 max-w-[80px] truncate text-[9px] text-muted-foreground">
          {label}
        </p>
      )}
    </div>
  );
}
