import { useCallback, useEffect, useRef, useState } from "react";
import {
  dist,
  drawFlightGuides,
  pointerToNorm,
  simplifyPath,
  tangentAt,
  nearestPathT,
  pointAt,
  type FlightArrow,
  type FlightGuides,
  type Point,
} from "@/lib/coverFlight";
import { cn } from "@/lib/utils";

export type CoverFlightTool = "path" | "arrow";

const CONTINUE_THRESHOLD = 0.05;
const HIT_THRESHOLD = 0.045;

type DragMode = { kind: "draw" } | { kind: "rotate"; index: number } | null;

export function CoverFlightAnnotator({
  imageUrl,
  guides,
  tool,
  onChange,
  onBeginEdit,
  onImageSize,
  className,
}: {
  imageUrl: string | null;
  guides: FlightGuides;
  tool: CoverFlightTool;
  onChange: (next: FlightGuides) => void;
  onBeginEdit?: () => void;
  onImageSize?: (size: { width: number; height: number }) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [selectedArrow, setSelectedArrow] = useState<number | null>(null);
  const dragRef = useRef<DragMode>(null);
  const strokeRef = useRef<Point[]>([]);
  const guidesRef = useRef(guides);
  guidesRef.current = guides;

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !natural) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.drawImage(img, 0, 0, cssW, cssH);
    drawFlightGuides(ctx, guidesRef.current, cssW, cssH);
    if (selectedArrow != null) {
      const arrow = guidesRef.current.arrows[selectedArrow];
      if (arrow) {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2;
        const r = Math.max(cssW, cssH) * 0.035;
        ctx.arc(arrow.x * cssW, arrow.y * cssH, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }, [natural, selectedArrow]);

  useEffect(() => {
    if (!imageUrl) {
      setNatural(null);
      imageRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      const size = { width: img.naturalWidth, height: img.naturalHeight };
      setNatural(size);
      onImageSize?.(size);
    };
    img.onerror = () => {
      imageRef.current = null;
      setNatural(null);
    };
    img.src = imageUrl;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [imageUrl, onImageSize]);

  useEffect(() => {
    paint();
  }, [paint, guides, imageUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(el);
    return () => ro.disconnect();
  }, [paint]);

  function normFromEvent(e: React.PointerEvent): Point | null {
    const el = containerRef.current;
    if (!el || !natural) return null;
    return pointerToNorm(
      e.clientX,
      e.clientY,
      el.getBoundingClientRect(),
      natural.width,
      natural.height,
    );
  }

  function hitArrow(p: Point, arrows: FlightArrow[]): number {
    let best = -1;
    let bestD = HIT_THRESHOLD;
    arrows.forEach((a, i) => {
      const d = dist(p, a);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!imageUrl || !natural) return;
    const p = normFromEvent(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const current = guidesRef.current;

    if (tool === "arrow") {
      const hit = hitArrow(p, current.arrows);
      if (hit >= 0) {
        onBeginEdit?.();
        setSelectedArrow(hit);
        dragRef.current = { kind: "rotate", index: hit };
        return;
      }
      if (current.path.length < 2) return;
      if (current.arrows.length >= 3) {
        return;
      }
      onBeginEdit?.();
      const t = nearestPathT(current.path, p);
      const snapped = pointAt(current.path, t) ?? p;
      const arrow: FlightArrow = {
        x: snapped.x,
        y: snapped.y,
        angle: tangentAt(current.path, t),
      };
      onChange({ ...current, arrows: [...current.arrows, arrow] });
      setSelectedArrow(current.arrows.length);
      dragRef.current = { kind: "rotate", index: current.arrows.length };
      return;
    }

    onBeginEdit?.();

    const last = current.path[current.path.length - 1];
    const continuing = last != null && dist(last, p) <= CONTINUE_THRESHOLD;
    strokeRef.current = continuing ? [...current.path, p] : [p];
    dragRef.current = { kind: "draw" };
    setSelectedArrow(null);
    onChange({ ...current, path: strokeRef.current });
  }

  function onPointerMove(e: React.PointerEvent) {
    const mode = dragRef.current;
    if (!mode) return;
    const p = normFromEvent(e);
    if (!p) return;
    const current = guidesRef.current;

    if (mode.kind === "draw") {
      const prev = strokeRef.current[strokeRef.current.length - 1];
      if (prev && dist(prev, p) < 0.006) return;
      strokeRef.current = [...strokeRef.current, p];
      onChange({ ...current, path: strokeRef.current });
      return;
    }

    const arrow = current.arrows[mode.index];
    if (!arrow) return;
    const next = current.arrows.slice();
    next[mode.index] = {
      ...arrow,
      angle: Math.atan2(p.y - arrow.y, p.x - arrow.x),
    };
    onChange({ ...current, arrows: next });
  }

  function onPointerUp() {
    if (dragRef.current?.kind === "draw") {
      const simplified = simplifyPath(strokeRef.current);
      onChange({ ...guidesRef.current, path: simplified });
    }
    dragRef.current = null;
    strokeRef.current = [];
  }

  const aspect = natural ? `${natural.width} / ${natural.height}` : "1 / 1";

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative max-w-xl overflow-hidden rounded-md border border-border bg-muted/20 touch-none",
        className,
      )}
      style={{ aspectRatio: aspect }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {imageUrl ? (
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      ) : (
        <div className="flex h-full min-h-64 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Pick a cover still, or drop a local image, then draw one red flight line.
        </div>
      )}
    </div>
  );
}
