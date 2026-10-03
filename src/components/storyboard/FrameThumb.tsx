import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { frameOf } from "@/lib/media/frames";

/**
 * One frame of a video file, drawn without a media element — a picture of what a shot plays that needs nothing
 * loaded but the frame itself. `fit="contain"` shows the whole frame.
 */
export function FrameThumb({
  fileKey,
  url,
  seconds,
  className,
  testId = "frame-thumb",
  maxWidth = 360,
}: {
  /** The file's own identity (bucket:path) — the index is read once per file, whatever its link. */
  fileKey: string;
  url: string | undefined;
  seconds: number;
  className?: string;
  testId?: string;
  /** Pixels across the canvas holds, at most. */
  maxWidth?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [note, setNote] = useState<string | null>(null);
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    if (!url) return;
    let stop = false;
    setState("loading");
    setNote(null);
    void frameOf(fileKey, url, seconds).then((r) => {
      if (!r.ok) {
        if (!stop) {
          setState("failed");
          setNote(r.note);
        }
        return;
      }
      const el = canvas.current;
      if (stop || !el) return r.frame.close();
      const scale = Math.min(1, maxWidth / r.frame.displayWidth);
      el.width = Math.max(1, Math.round(r.frame.displayWidth * scale));
      el.height = Math.max(1, Math.round(r.frame.displayHeight * scale));
      el.getContext("2d")?.drawImage(r.frame, 0, 0, el.width, el.height);
      r.frame.close();
      setShown(r.time);
      setState("ready");
    });
    return () => {
      stop = true;
    };
  }, [fileKey, url, seconds, maxWidth]);

  return (
    <canvas
      ref={canvas}
      className={cn("h-full w-full object-contain", state !== "ready" && "opacity-0", className)}
      data-testid={testId}
      data-state={state}
      data-time={shown ?? undefined}
      data-note={note ?? undefined}
      title={note ?? undefined}
    />
  );
}
