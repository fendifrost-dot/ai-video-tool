import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Film, Image as ImageIcon, LayoutGrid, Loader2, Lock, Maximize, Minimize, Plus, Quote, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDuration, formatTimecode, shotTypeLabel } from "@/components/treatment/shotLabels";
import type { StoryboardBox } from "@/lib/storyboard/boxes";
import type { BoxMediaItem } from "@/lib/storyboard/media";
import { sceneText } from "./BoxCard";
import { BoxEditor } from "./BoxEditor";
import { BoxMediaView, ROLE_STYLE, mediaLabel } from "./BoxMediaView";
import { frameBoxStyle } from "@/lib/project/aspect";
import { Overlay } from "./Overlay";
import { useStoryboard } from "./useStoryboardController";

type Tab = "details" | "media" | "versions";
const usd = (n: number) => `$${n.toFixed(2)}`;
const SWIPE_PX = 56;

/**
 * One shot, full screen — the same record the board shows, looked at closely: the media large, then its details,
 * its footage and its earlier versions. Swipe (or the arrows, or ← →) moves through the shots in song order;
 * "Back to storyboard" returns to the board. It is a view, not a route: nothing here is a second copy of the shot.
 */
export function FocusView() {
  const sb = useStoryboard();
  const index = sb.boxes.findIndex((b) => b.id === sb.focusId);
  const box = index >= 0 ? sb.boxes[index] : null;
  const [tab, setTab] = useState<Tab>("details");
  const stage = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  // "Fill the screen" inside the page — what a phone gets, where the browser's own full screen is not offered
  // for anything but a video. The stage covers everything; swiping still moves between shots.
  const [fill, setFill] = useState(false);

  const toggleFullScreen = useCallback(() => {
    if (fill) return setFill(false);
    if (typeof document !== "undefined" && document.fullscreenElement) return void document.exitFullscreen?.();
    const el = stage.current;
    if (el?.requestFullscreen) {
      void el.requestFullscreen().catch(() => setFill(true));
      return;
    }
    setFill(true);
  }, [fill]);

  const go = useCallback(
    (delta: number) => {
      const next = sb.boxes[index + delta];
      if (next) sb.openFocus(next.id);
    },
    [sb, index],
  );

  useEffect(() => {
    if (!box) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") {
        if (fill) setFill(false);
        else sb.openFocus(null);
      }
    };
    window.addEventListener("keydown", onKey);
    // the board behind must not scroll while a shot is open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [box, go, sb, fill]);

  if (!box) return null;
  const number = index + 1;
  const media = sb.mediaOf(box.id);
  const { lines, state } = sb.lyricsOf(box);
  const busy = sb.busyOf(box.id);
  const job = sb.jobOf(box);
  const est = sb.estimatesOf(box);
  const blocked = sb.rewriteBlockedReason(box);

  return (
    <Overlay>
    <div className="fixed inset-0 z-50 flex flex-col bg-background" data-testid="focus-view" data-box-key={box.key} data-box-number={number}>
      {/* Header ------------------------------------------------------------------ */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous shot" className="rounded-md p-2 text-foreground/70 hover:bg-white/5 disabled:opacity-25" data-testid="focus-prev">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="whitespace-nowrap font-mono text-sm tabular-nums" data-testid="focus-position">
          {String(number).padStart(2, "0")} <span className="text-foreground/35">/ {String(sb.boxes.length).padStart(2, "0")}</span>
        </span>
        <button type="button" onClick={() => go(1)} disabled={index === sb.boxes.length - 1} aria-label="Next shot" className="rounded-md p-2 text-foreground/70 hover:bg-white/5 disabled:opacity-25" data-testid="focus-next">
          <ArrowRight className="h-4 w-4" />
        </button>
        <span className="ml-1 hidden font-mono text-xs text-foreground/55 sm:inline">
          {formatTimecode(box.start)}–{formatTimecode(box.end)} ({formatDuration(box.end - box.start)})
        </span>
        {box.section && <span className="hidden rounded-full bg-white/5 px-2 py-0.5 text-[10px] capitalize text-foreground/60 sm:inline">{box.section}</span>}
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">{shotTypeLabel(box.spec.shotType)}</span>
        {box.locked && <Lock className="h-3 w-3 text-foreground/40" />}
        <Button size="sm" variant="outline" className="ml-auto h-8 text-[11px]" onClick={() => sb.openFocus(null)} data-testid="focus-close">
          <LayoutGrid className="mr-1.5 h-3.5 w-3.5" />
          <span className="hidden sm:inline">Back to storyboard</span>
          <span className="sm:hidden">Storyboard</span>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-6xl gap-4 p-3 md:p-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          {/* Stage: the media, swipeable --------------------------------------- */}
          <div className="space-y-3">
            <div
              ref={stage}
              className={cn("touch-pan-y overflow-hidden bg-black", fill ? "fixed inset-0 z-[80] m-0" : "relative mx-auto rounded-xl")}
              // the stage is the project's frame, as large as fits the screen; filling the screen drops the frame
              style={fill ? undefined : frameBoxStyle(sb.aspect, "70vh")}
              data-fill={fill ? "true" : "false"}
              data-aspect={sb.aspect}
              onTouchStart={(e) => {
                touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
              }}
              onTouchEnd={(e) => {
                const s = touch.current;
                touch.current = null;
                if (!s) return;
                const dx = e.changedTouches[0].clientX - s.x;
                const dy = e.changedTouches[0].clientY - s.y;
                // a sideways flick, not a scroll and not a tap on the player
                if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
              }}
              data-testid="focus-stage"
            >
              <div className="absolute inset-0 [&>div]:h-full [&>div]:min-h-0">
                <BoxMediaView key={box.id + (media.showing?.asset.id ?? "none")} box={box} mode="focus" />
              </div>
              <button
                type="button"
                onClick={toggleFullScreen}
                aria-label={fill ? "Leave full screen" : "Full screen"}
                className="absolute right-2 top-2 z-10 rounded-md bg-black/55 p-1.5 text-white/90 backdrop-blur hover:bg-black/75"
                data-testid="focus-fullscreen"
              >
                {fill ? <Minimize className="h-4 w-4" /> : <Maximize className="h-3.5 w-3.5" />}
              </button>
              {fill && (
                <span className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[10px] text-white/80 backdrop-blur" data-testid="focus-fill-position">
                  {String(number).padStart(2, "0")} / {String(sb.boxes.length).padStart(2, "0")}
                </span>
              )}
            </div>
            <p className="text-center text-[10px] text-foreground/35 md:hidden">Swipe left or right to move between shots</p>

            {lines.length > 0 ? (
              <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2" data-testid="focus-lyrics">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">
                  <Quote className="h-3 w-3" /> Lyrics in this shot
                </div>
                {lines.map((l) => (
                  <p key={l.lineIndex} className="text-sm italic leading-snug text-foreground/90">
                    {l.cutIn ? "…" : ""}
                    {l.text}
                    {l.cutOut ? "…" : ""}
                    <span className="ml-2 font-mono text-[10px] not-italic text-foreground/35">{formatTimecode(l.start)}</span>
                  </p>
                ))}
              </div>
            ) : state === "instrumental" ? (
              <p className="text-[10px] uppercase tracking-wider text-foreground/40">Instrumental — no lyrics in this window</p>
            ) : null}

            <p className="text-sm leading-relaxed text-foreground/85" data-testid="focus-scene">
              {sceneText(box)}
            </p>
          </div>

          {/* Side: actions, then tabs ------------------------------------------ */}
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <Button disabled={!!busy} onClick={() => (blocked ? toast.info(blocked) : void sb.rewrite(box))} title={blocked ?? undefined} data-testid="focus-rewrite">
                <Wand2 className="mr-2 h-4 w-4" /> Regenerate scene
              </Button>
              <Button variant="outline" disabled={!!busy} onClick={() => sb.generateImage(box)} data-testid="focus-generate-image">
                <ImageIcon className="mr-2 h-4 w-4" /> Generate image{est ? ` · ${usd(est.image)}` : ""}
              </Button>
              <Button variant="outline" disabled={!!busy} onClick={() => sb.generateClip(box)} data-testid="focus-generate-clip">
                <Film className="mr-2 h-4 w-4" /> Generate clip{est ? ` · ${usd(est.clip)}` : ""}
              </Button>
            </div>
            {(busy || (job && job.state !== "done")) && (
              <p className={cn("flex items-center gap-1.5 text-[11px]", job?.state === "failed" && !busy ? "text-rose-300" : "text-foreground/60")} data-testid="focus-status">
                {(busy || job?.state === "working" || job?.state === "saving") && <Loader2 className="h-3 w-3 animate-spin" />}
                {busy ?? job?.message}
              </p>
            )}

            <div className="flex gap-1 rounded-lg bg-white/5 p-0.5">
              {(["details", "media", "versions"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn("flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize", tab === t ? "glass-raised text-foreground" : "text-foreground/50 hover:text-foreground/80")}
                  data-testid={`focus-tab-${t}`}
                >
                  {t}
                  {t === "media" && <span className="ml-1 text-foreground/35">{media.items.length}</span>}
                  {t === "versions" && <span className="ml-1 text-foreground/35">{box.history.length}</span>}
                </button>
              ))}
            </div>

            {tab === "details" && <BoxEditor key={box.id} box={box} />}
            {tab === "media" && <MediaList box={box} items={media.items} showing={media.showing} />}
            {tab === "versions" && <Versions box={box} />}
          </div>
        </div>
      </div>
    </div>
    </Overlay>
  );
}

/** The footage on this shot: which one shows, and where each can go. */
function MediaList({ box, items, showing }: { box: StoryboardBox; items: BoxMediaItem[]; showing: BoxMediaItem | null }) {
  const sb = useStoryboard();
  return (
    <div className="space-y-2" data-testid="focus-media">
      {items.length === 0 && <p className="text-xs text-foreground/50">Nothing is on this shot yet. Generate an image or a clip, or put your own footage on it.</p>}
      {items.map((item) => {
        const isShowing = showing === item;
        return (
          <div
            key={item.assignmentId ?? `base-${item.asset.id}`}
            className={cn("space-y-1.5 rounded-lg border p-2.5", isShowing ? "border-primary/60 bg-primary/5" : "border-border")}
            data-testid="focus-media-item"
            data-role={item.role}
            data-base={item.base ? "true" : "false"}
            data-showing={isShowing ? "true" : "false"}
          >
            <div className="flex items-center gap-2">
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", ROLE_STYLE[item.role])}>{mediaLabel(item)}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-foreground/80">{item.asset.name}</span>
              {isShowing && <span className="text-[10px] font-medium text-primary">showing</span>}
            </div>
            {item.kind === "video" && item.sourceIn != null && (
              <p className="font-mono text-[10px] text-foreground/50" data-testid="focus-media-range">
                source {formatTimecode(item.sourceIn)}–{item.sourceOut != null ? formatTimecode(item.sourceOut) : "end"}
                {item.role === "performance" ? ` · in sync with song ${formatTimecode(box.start)}–${formatTimecode(box.end)}` : ""}
              </p>
            )}
            {item.note && <p className="text-[10px] text-amber-300/90">{item.note}</p>}
            <div className="flex flex-wrap items-center gap-1.5">
              {!isShowing && item.role !== "reference" && (
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => void sb.select(item, box)} data-testid="focus-media-show">
                  Show this
                </Button>
              )}
              {isShowing && !item.base && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => void sb.showBaseLayer(box)} data-testid="focus-media-hide">
                  Hide (keep on the shot)
                </Button>
              )}
              {item.assignmentId && (
                <>
                  <select
                    className="h-7 rounded-md border border-border bg-background/60 px-1.5 text-[11px] text-foreground/80"
                    value=""
                    onChange={(e) => e.target.value && void sb.moveTo(item, e.target.value)}
                    aria-label="Move to another shot"
                    data-testid="focus-media-move"
                  >
                    <option value="">Move to…</option>
                    {sb.boxes
                      .filter((b) => b.id !== box.id)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          Shot {String(sb.numberOf(b.id)).padStart(2, "0")} · {formatTimecode(b.start)}
                        </option>
                      ))}
                  </select>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-foreground/60" onClick={() => void sb.takeOff(item)} data-testid="focus-media-remove">
                    Take off this shot
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })}
      <Button size="sm" variant="outline" className="w-full text-[11px]" onClick={() => sb.openPicker(box.id)} data-testid="focus-add-media">
        <Plus className="mr-1.5 h-3.5 w-3.5" /> Put footage on this shot
      </Button>
    </div>
  );
}

/** Earlier versions of this shot's scene, newest first. Restoring one makes it the scene again; nothing is deleted. */
function Versions({ box }: { box: StoryboardBox }) {
  const sb = useStoryboard();
  const entries = [...box.history].reverse();
  const EVENT: Record<string, string> = {
    treatment: "before the treatment rewrote it",
    rewrite: "before a scene rewrite",
    edit: "before your edit",
    reset: "before the reset",
    split: "split",
    merge: "merged in",
    migrated: "moved onto this record",
  };
  return (
    <div className="space-y-2" data-testid="focus-versions">
      {entries.length === 0 && <p className="text-xs text-foreground/50">No earlier versions yet.</p>}
      {entries.map((e, i) => (
        <div key={`${e.at}-${i}`} className="space-y-1 rounded-lg border border-border p-2.5">
          <p className="text-[10px] text-foreground/45">
            {e.at.slice(0, 16).replace("T", " ")} · {EVENT[e.event] ?? e.event}
            {e.note ? ` · ${e.note}` : ""}
          </p>
          {(e.direction || e.purpose) && <p className="text-xs leading-snug text-foreground/75">{e.direction || e.purpose}</p>}
          {(e.direction || e.purpose) && e.event !== "migrated" && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={!!sb.busyOf(box.id)} onClick={() => void sb.restoreVersion(box, e)} data-testid="focus-version-restore">
              Use this version
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
