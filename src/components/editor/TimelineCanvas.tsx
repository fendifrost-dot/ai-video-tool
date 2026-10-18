import { useMemo, useRef, useState } from "react";
import {
  durationSeconds,
  sourceHandles,
  videoClips,
  type EditClip,
  type EditSequence,
  type Gesture,
} from "../../../supabase/functions/edit-render/model";
import { formatTimecode } from "@/lib/editor/playback";
import { cn } from "@/lib/utils";

type Props = {
  sequence: EditSequence;
  playhead: number;
  selectedId: string | null;
  pxPerSecond: number;
  onSelect: (id: string | null) => void;
  onSeek: (t: number) => void;
  onGesture: (g: Gesture) => void;
};

function clipColor(c: EditClip): string {
  if (c.placeholder) return "#6543c880";
  if (c.labelColor === "Rose") return "#dc8e7980";
  if (c.labelColor === "Mango") return "#f2ce8e66";
  if (c.mouth === "model") return "#a68ae966";
  return "#2c3339";
}

/**
 * Horizontally scrollable picture track: thumbnail-style clips, ruler, playhead,
 * edge trim and body move via drag (buttons also available in the sync panel).
 */
export function TimelineCanvas({
  sequence,
  playhead,
  selectedId,
  pxPerSecond,
  onSelect,
  onSeek,
  onGesture,
}: Props) {
  const clips = videoClips(sequence);
  const duration = Math.max(durationSeconds(sequence), 1);
  const width = Math.max(480, duration * pxPerSecond + 80);
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<null | {
    clipId: string;
    mode: "move" | "trim-in" | "trim-out";
    startX: number;
    lastFrames: number;
  }>(null);

  const ticks = useMemo(() => {
    const step = pxPerSecond < 40 ? 5 : pxPerSecond < 80 ? 2 : 1;
    const out: number[] = [];
    for (let t = 0; t <= duration + 0.001; t += step) out.push(t);
    return out;
  }, [duration, pxPerSecond]);

  const onPointerMove = (clientX: number) => {
    if (!drag) return;
    const dx = clientX - drag.startX;
    const frames = Math.round((dx / pxPerSecond) * sequence.fps);
    if (frames === drag.lastFrames) return;
    const delta = frames - drag.lastFrames;
    setDrag({ ...drag, lastFrames: frames });
    if (drag.mode === "move") {
      onGesture({ kind: "move", clipId: drag.clipId, deltaFrames: delta, ripple: false });
    } else if (drag.mode === "trim-in") {
      onGesture({ kind: "trim", clipId: drag.clipId, edge: "in", deltaFrames: delta, ripple: false });
    } else {
      onGesture({ kind: "trim", clipId: drag.clipId, edge: "out", deltaFrames: delta, ripple: false });
    }
  };

  return (
    <div className="space-y-2" data-testid="timeline-canvas">
      <div
        ref={scroller}
        className="overflow-x-auto rounded-xl border border-border bg-[#101417]"
        onPointerMove={(e) => onPointerMove(e.clientX)}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        <div className="relative select-none" style={{ width, minHeight: 132 }}>
          {/* Ruler */}
          <div
            className="relative h-7 border-b border-border/80"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left + (scroller.current?.scrollLeft ?? 0);
              onSeek(Math.max(0, Math.min(duration, x / pxPerSecond)));
            }}
            data-testid="time-ruler"
          >
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute top-0 h-full border-l border-border/50 pl-1 text-[9px] text-muted-foreground"
                style={{ left: t * pxPerSecond }}
              >
                {formatTimecode(t, sequence.fps)}
              </div>
            ))}
          </div>

          {/* V1 track */}
          <div className="relative h-24 px-0 py-2">
            <p className="absolute left-2 top-1 z-10 text-[9px] uppercase tracking-wide text-muted-foreground">
              Picture
            </p>
            {clips.map((c) => {
              const left = c.timelineIn * pxPerSecond;
              const w = Math.max(8, (c.timelineOut - c.timelineIn) * pxPerSecond);
              const handles = sourceHandles(c);
              const selected = c.id === selectedId;
              return (
                <div
                  key={c.id}
                  className={cn(
                    "absolute top-6 h-14 overflow-hidden rounded-md border text-left",
                    selected ? "border-primary ring-1 ring-primary/60" : "border-border/70",
                  )}
                  style={{ left, width: w, background: clipColor(c) }}
                  data-testid="cut-clip"
                  data-shot={c.shotKey ?? ""}
                  data-mouth={c.mouth ?? ""}
                  data-placeholder={c.placeholder ? "true" : "false"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(c.id);
                    onSeek(c.timelineIn);
                  }}
                >
                  <button
                    type="button"
                    aria-label="Trim in"
                    className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize bg-primary/40"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setDrag({
                        clipId: c.id,
                        mode: "trim-in",
                        startX: e.clientX,
                        lastFrames: 0,
                      });
                    }}
                  />
                  <button
                    type="button"
                    className="absolute inset-0 cursor-grab px-2 py-1 text-left active:cursor-grabbing"
                    onPointerDown={(e) => {
                      if ((e.target as HTMLElement).closest("[data-edge]")) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setDrag({
                        clipId: c.id,
                        mode: "move",
                        startX: e.clientX,
                        lastFrames: 0,
                      });
                    }}
                  >
                    <span className="block truncate text-[11px] font-medium text-foreground">
                      {c.placeholder ? `${c.shotKey ?? c.name} · needs take` : c.shotKey || c.name}
                    </span>
                    <span className="block truncate text-[9px] text-muted-foreground">
                      {handles.known
                        ? `+${handles.head.toFixed(1)}s / ${handles.tail.toFixed(1)}s unused`
                        : c.mouth === "model"
                          ? "Generated mouth — check offset vs articulation"
                          : c.mouth === "camera"
                            ? "Camera take"
                            : "B-roll"}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Trim out"
                    data-edge="out"
                    className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize bg-primary/40"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setDrag({
                        clipId: c.id,
                        mode: "trim-out",
                        startX: e.clientX,
                        lastFrames: 0,
                      });
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Playhead */}
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-primary"
            style={{ left: playhead * pxPerSecond }}
            data-testid="timeline-playhead"
          />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground" data-testid="cut-duration">
        {sequence.name} · {duration.toFixed(3)} s · {clips.length} clips · song offset{" "}
        {sequence.songOffset.toFixed(3)} s
      </p>
    </div>
  );
}
