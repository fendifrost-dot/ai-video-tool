import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  src: string | null | undefined;
  sourceTime?: number;
  className?: string;
  alt?: string;
};

/**
 * First-frame (or near sourceTime) strip tile for timeline clips.
 * Falls back to empty charcoal when media is missing or decode fails.
 */
export function ClipThumb({ src, sourceTime = 0.05, className, alt }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!src) {
      setOk(false);
      return;
    }
    let cancelled = false;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.crossOrigin = "anonymous";

    const draw = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const w = canvas.width;
      const h = canvas.height;
      const ctx = canvas.getContext("2d");
      if (!ctx || !video.videoWidth) return;
      ctx.fillStyle = "#101417";
      ctx.fillRect(0, 0, w, h);
      const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
      const dw = video.videoWidth * scale;
      const dh = video.videoHeight * scale;
      ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
      setOk(true);
    };

    const onMeta = () => {
      try {
        video.currentTime = Math.max(0.01, sourceTime);
      } catch {
        draw();
      }
    };

    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("seeked", draw);
    video.addEventListener("error", () => {
      if (!cancelled) setOk(false);
    });
    video.src = src;

    return () => {
      cancelled = true;
      video.removeAttribute("src");
      video.load();
    };
  }, [src, sourceTime]);

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={90}
      aria-label={alt}
      className={cn("pointer-events-none h-full w-full object-cover", !ok && "opacity-0", className)}
      data-testid="clip-thumb"
      data-ready={ok ? "true" : "false"}
    />
  );
}
