import { useCallback, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { QuadNorm } from "@/lib/garment/placementEngine";

type CornerIndex = 0 | 1 | 2 | 3;

const CORNER_LABELS = ["TL", "TR", "BR", "BL"] as const;

/** Default stripe-ish quad in upper chest (normalized VTON space). */
export function defaultChestStripeQuad(): QuadNorm {
  return [
    [0.22, 0.38],
    [0.78, 0.4],
    [0.76, 0.48],
    [0.24, 0.46],
  ];
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function ManualKeyframeQuadEditor({
  imageUrl,
  initialQuad,
  keyframeId = "default",
  disabled,
  onSave,
}: {
  imageUrl: string;
  initialQuad?: QuadNorm | null;
  keyframeId?: string;
  disabled?: boolean;
  onSave: (quad: QuadNorm, keyframeId: string) => Promise<void>;
}) {
  const [quad, setQuad] = useState<QuadNorm>(initialQuad ?? defaultChestStripeQuad());
  const [dragCorner, setDragCorner] = useState<CornerIndex | null>(null);
  const [saving, setSaving] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const pointerToNorm = useCallback((clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  }, []);

  function onCornerDown(e: React.PointerEvent, corner: CornerIndex) {
    if (disabled) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragCorner(corner);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragCorner === null) return;
    const pt = pointerToNorm(e.clientX, e.clientY);
    if (!pt) return;
    setQuad((prev) => {
      const next = prev.map((p) => [...p]) as QuadNorm;
      next[dragCorner] = [pt.x, pt.y];
      return next;
    });
  }

  function onPointerUp(e: React.PointerEvent) {
    if (dragCorner === null) return;
    setDragCorner(null);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(quad, keyframeId);
      toast.success("Manual placement saved — re-run VTON to apply");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const svgPoints = quad.map(([x, y]) => `${x * 100},${y * 100}`).join(" ");

  return (
    <section className="space-y-3 rounded-md border border-border bg-card/30 p-4">
      <div>
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Manual logo placement (VTON frame)
        </h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Drag the four corners onto the navy chest stripe. This quad is the source of truth —
          auto-detection only validates. Saved to product_details for keyframe{" "}
          <span className="font-mono">{keyframeId}</span>.
        </p>
      </div>

      <div
        className="relative max-w-md overflow-hidden rounded-md border border-border bg-muted/20 touch-none"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt="VTON frame for manual placement"
          className="block w-full select-none"
          draggable={false}
        />
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polygon
            points={svgPoints}
            fill="rgba(var(--primary), 0.15)"
            stroke="hsl(var(--primary))"
            strokeWidth="0.4"
          />
        </svg>
        {quad.map(([x, y], i) => (
          <button
            key={CORNER_LABELS[i]}
            type="button"
            aria-label={`Corner ${CORNER_LABELS[i]}`}
            disabled={disabled}
            className="absolute z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background shadow-sm disabled:opacity-50"
            style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
            onPointerDown={(e) => onCornerDown(e, i as CornerIndex)}
          />
        ))}
      </div>

      {!disabled ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Save manual quad
        </Button>
      ) : null}
    </section>
  );
}
