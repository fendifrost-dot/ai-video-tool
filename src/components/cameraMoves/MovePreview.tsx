import { useEffect, useRef } from "react";
import { previewSegments, type MotionKind } from "@/lib/cameraMoves";

/** Animated blockout of a move. The stored pill clip is the reference that would be sent. */
export function MovePreview({ kind, hint }: { kind: MotionKind; hint: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let raf = 0;
    const draw = () => {
      const t = (frame % 96) / 96;
      ctx.fillStyle = "#141414";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const segment of previewSegments(kind, t, hint, canvas.width, canvas.height)) {
        ctx.strokeStyle = `rgb(${segment.tone},${segment.tone},${segment.tone})`;
        ctx.lineWidth = segment.tone > 120 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(segment.x1, segment.y1);
        ctx.lineTo(segment.x2, segment.y2);
        ctx.stroke();
      }
      frame += 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [kind, hint]);
  return (
    <canvas
      ref={ref}
      width={320}
      height={180}
      className="aspect-video w-full rounded-md bg-neutral-950"
      aria-label={`${kind} blockout preview`}
    />
  );
}
