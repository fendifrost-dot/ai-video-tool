/**
 * The shot's Frame — a punch-in decided in the edit, instead of a regenerate (Fendi, 2026-10-17: "if the shot comes
 * out good except the pants we can edit the zoom or angle to get them out the frame").
 *
 * Zoom, and where the zoom is centred: by the sliders, or by dragging the picture. What the small frame here shows is
 * what Review plays and what a render makes (reframe.ts — one rule for all three). Saved on the shot record, so it
 * belongs to the shot, whichever of its media is showing.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { frameBoxStyle, frameSize } from "@/lib/project/aspect";
import type { StoryboardBox } from "@/lib/storyboard/boxes";
import type { BoxMediaItem } from "@/lib/storyboard/media";
import { IDENTITY_REFRAME, normalizeReframe, reframeStyle, type ShotReframe } from "@/lib/storyboard/reframe";
import { useStoryboard } from "./useStoryboardController";

/** The card offers up to 2× — past that a generated picture no longer holds up. */
const MAX_ZOOM = 2;
const same = (a: ShotReframe, b: ShotReframe) => a.scale === b.scale && a.x === b.x && a.y === b.y;

export function ReframePanel({ box, item }: { box: StoryboardBox; item: BoxMediaItem }) {
  const sb = useStoryboard();
  const saved = normalizeReframe(box.override?.reframe);
  const [draft, setDraft] = useState<ShotReframe>(saved);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const drag = useRef<{ x: number; y: number; from: ShotReframe } | null>(null);
  // a frame saved elsewhere (another tab, a reset) must show here
  useEffect(() => {
    setDraft(normalizeReframe(box.override?.reframe));
    // the stored values are the dependency, not the object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.scale, saved.x, saved.y]);

  const url = sb.urlFor(item.asset);
  const frame = frameSize(sb.aspect);
  const place = size ? reframeStyle(size.w, size.h, draft, frame) : null;
  const zoomed = draft.scale > 1;
  const changed = !same(draft, saved);
  const set = (patch: Partial<ShotReframe>) => setDraft((d) => normalizeReframe({ ...d, ...patch }));

  return (
    <div className="space-y-2 rounded-lg border border-border p-2.5" data-testid="reframe" data-scale={saved.scale}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/60">Frame</span>
        <span className="font-mono text-[10px] tabular-nums text-foreground/50" data-testid="reframe-zoom-value">
          {draft.scale.toFixed(2)}×
        </span>
        <span className="text-[10px] text-foreground/40">{zoomed ? "pushed in — drag the picture to move it" : "as filmed"}</span>
        <div className="ml-auto flex gap-1">
          {changed && (
            <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px]" onClick={() => void sb.saveReframe(box, zoomed ? draft : null)} data-testid="reframe-save">
              Save frame
            </Button>
          )}
          {(saved.scale > 1 || changed) && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[10px]"
              onClick={() => {
                setDraft(IDENTITY_REFRAME);
                if (saved.scale > 1) void sb.saveReframe(box, null);
              }}
              data-testid="reframe-reset"
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        {/* the shot's frame, small: the picture placed in it exactly as Review plays it and a render crops it */}
        <div
          className={cn("relative shrink-0 touch-none overflow-hidden rounded bg-black", zoomed && "cursor-move")}
          style={frameBoxStyle(sb.aspect, "9rem")}
          onPointerDown={(e) => {
            if (!zoomed) return;
            drag.current = { x: e.clientX, y: e.clientY, from: draft };
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || !place) return;
            const r = e.currentTarget.getBoundingClientRect();
            // the picture follows the pointer: a move of the whole source's displayed width is a move of 1 in x
            set({
              x: d.from.x - (e.clientX - d.x) / ((r.width * place.width) / 100 || 1),
              y: d.from.y - (e.clientY - d.y) / ((r.height * place.height) / 100 || 1),
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          data-testid="reframe-stage"
        >
          {url &&
            (item.kind === "image" ? (
              <img
                src={url}
                alt=""
                draggable={false}
                onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                style={place ? { left: `${place.left}%`, top: `${place.top}%`, width: `${place.width}%`, height: `${place.height}%` } : undefined}
                data-testid="reframe-picture"
              />
            ) : (
              // the shot's first picture of the file
              <video
                src={`${url}#t=${(item.sourceIn ?? 0).toFixed(2)}`}
                muted
                playsInline
                preload="metadata"
                onLoadedMetadata={(e) => setSize({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
                className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                style={place ? { left: `${place.left}%`, top: `${place.top}%`, width: `${place.width}%`, height: `${place.height}%` } : undefined}
                data-testid="reframe-picture"
              />
            ))}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <label className="block text-[10px] text-foreground/60">
            zoom
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.05}
              value={Math.min(draft.scale, MAX_ZOOM)}
              onChange={(e) => set({ scale: Number(e.target.value) })}
              className="block w-full accent-primary"
              aria-label="Zoom in on the shot's picture"
              data-testid="reframe-zoom"
            />
          </label>
          <label className="block text-[10px] text-foreground/60">
            across
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={draft.x}
              disabled={!zoomed}
              onChange={(e) => set({ x: Number(e.target.value) })}
              className="block w-full accent-primary disabled:opacity-40"
              aria-label="Where the zoom is centred, left to right"
              data-testid="reframe-x"
            />
          </label>
          <label className="block text-[10px] text-foreground/60">
            up / down
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={draft.y}
              disabled={!zoomed}
              onChange={(e) => set({ y: Number(e.target.value) })}
              className="block w-full accent-primary disabled:opacity-40"
              aria-label="Where the zoom is centred, top to bottom"
              data-testid="reframe-y"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
