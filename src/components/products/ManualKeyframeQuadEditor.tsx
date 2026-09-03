import { useCallback, useEffect, useRef, useState } from "react";
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

function cloneQuad(q: QuadNorm): QuadNorm {
  return q.map(([x, y]) => [x, y]) as QuadNorm;
}

export function ManualKeyframeQuadEditor({
  imageUrl,
  initialQuad,
  keyframeId = "default",
  disabled,
  onSave,
  onQuadChange,
  saveLabel = "Save manual quad",
  heading = "Manual logo placement (VTON frame)",
  hint = "Drag the four corners onto the navy chest stripe. This quad is the source of truth — auto-detection only validates.",
}: {
  imageUrl: string;
  initialQuad?: QuadNorm | null;
  keyframeId?: string;
  disabled?: boolean;
  onSave: (quad: QuadNorm, keyframeId: string) => Promise<void>;
  /** Live updates while dragging or editing numeric fields (does not require Save). */
  onQuadChange?: (quad: QuadNorm) => void;
  saveLabel?: string;
  heading?: string;
  hint?: string;
}) {
  const [quad, setQuad] = useState<QuadNorm>(
    () => cloneQuad(initialQuad ?? defaultChestStripeQuad()),
  );
  const [dragCorner, setDragCorner] = useState<CornerIndex | null>(null);
  const [saving, setSaving] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Remount (via parent `key`) or still/keyframe change reloads the seed.
  // Do not sync every `initialQuad` reference change — that fights live drag/numeric edits.
  useEffect(() => {
    if (!initialQuad) return;
    setQuad(cloneQuad(initialQuad));
  }, [imageUrl, keyframeId]); // eslint-disable-line react-hooks/exhaustive-deps -- seed on still/keyframe only

  const emitQuad = useCallback(
    (next: QuadNorm) => {
      setQuad(next);
      onQuadChange?.(next);
    },
    [onQuadChange],
  );

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
    const next = quad.map((p) => [...p]) as QuadNorm;
    next[dragCorner] = [pt.x, pt.y];
    emitQuad(next);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (dragCorner === null) return;
    setDragCorner(null);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }

  function setCornerCoord(corner: CornerIndex, axis: 0 | 1, raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const next = quad.map((p) => [...p]) as QuadNorm;
    next[corner] = [...next[corner]] as [number, number];
    next[corner][axis] = clamp01(n);
    emitQuad(next);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(quad, keyframeId);
      toast.success("Manual placement saved");
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
          {heading}
        </h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {hint} Saved for keyframe <span className="font-mono">{keyframeId}</span>.
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
          alt="Frame for manual placement"
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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CORNER_LABELS.map((label, i) => (
          <fieldset
            key={label}
            className="space-y-1 rounded border border-border/60 px-2 py-1.5"
            disabled={disabled}
          >
            <legend className="px-0.5 text-[10px] font-medium text-muted-foreground">{label}</legend>
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
              x
              <input
                type="number"
                step="0.001"
                min={0}
                max={1}
                className="w-full rounded border border-border bg-background px-1 py-0.5 font-mono text-[11px]"
                value={Number(quad[i][0].toFixed(3))}
                onChange={(e) => setCornerCoord(i as CornerIndex, 0, e.target.value)}
                disabled={disabled}
              />
            </label>
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
              y
              <input
                type="number"
                step="0.001"
                min={0}
                max={1}
                className="w-full rounded border border-border bg-background px-1 py-0.5 font-mono text-[11px]"
                value={Number(quad[i][1].toFixed(3))}
                onChange={(e) => setCornerCoord(i as CornerIndex, 1, e.target.value)}
                disabled={disabled}
              />
            </label>
          </fieldset>
        ))}
      </div>

      {!disabled ? (
        <Button type="button" size="sm" variant="outline" disabled={saving} onClick={handleSave}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          {saveLabel}
        </Button>
      ) : null}
    </section>
  );
}
