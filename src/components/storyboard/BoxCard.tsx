import { useState } from "react";
import { Clapperboard, Film, Image as ImageIcon, Loader2, Lock, Maximize2, MoreHorizontal, Plus, Quote, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDuration, formatTimecode, shotTypeLabel } from "@/components/treatment/shotLabels";
import type { StoryboardBox } from "@/lib/storyboard/boxes";
import { BoxMediaView, ROLE_STYLE, mediaLabel } from "./BoxMediaView";
import { BeatStrip } from "./TimedBeats";
import { CastChips } from "./Cast";
import { ContinuityChips } from "./Continuity";
import { ProductionChips } from "./ShotProduction";
import { useStoryboard } from "./useStoryboardController";

const ENERGY_STYLES: Record<string, string> = {
  low: "bg-sky-500/15 text-sky-300",
  mid: "bg-emerald-500/15 text-emerald-300",
  high: "bg-amber-500/15 text-amber-300",
  drop: "bg-rose-500/15 text-rose-300",
};

/** The scene as the box states it: the director's (or a rewrite's) direction when there is one, else the generated scene. */
export function sceneText(box: StoryboardBox): string {
  return box.spec.origin === "override" && box.spec.performanceDirection ? box.spec.performanceDirection : box.spec.purpose;
}

const usd = (n: number) => `$${n.toFixed(2)}`;

/**
 * One storyboard box on the board: its window, the words sung in it, its scene, the footage on it, and the three
 * things that can be done to it. A drop target for footage dragged from another box.
 */
export function BoxCard({ box, coverageFlag }: { box: StoryboardBox; coverageFlag?: string }) {
  const sb = useStoryboard();
  const [menu, setMenu] = useState(false);
  const [dropping, setDropping] = useState(false);
  const number = sb.numberOf(box.id);
  const media = sb.mediaOf(box.id);
  const { lines, state } = sb.lyricsOf(box);
  const energy = sb.energyOf(box);
  const job = sb.jobOf(box);
  const busy = sb.busyOf(box.id);
  const est = sb.estimatesOf(box);
  const blocked = sb.rewriteBlockedReason(box);
  const unmet = sb.unmetOf(box);
  const working = !!busy || job?.state === "working" || job?.state === "saving";

  return (
    <Card
      className={cn("studio-shot overflow-hidden transition-[border-color,box-shadow]", dropping && "ring-2 ring-primary")}
      data-testid="box-card"
      data-box-key={box.key}
      data-box-id={box.id}
      data-box-number={number}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-avt-assignment")) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        setDropping(false);
        const raw = e.dataTransfer.getData("application/x-avt-assignment");
        if (!raw) return;
        e.preventDefault();
        const from = sb.boxes.flatMap((b) => sb.mediaOf(b.id).items).find((i) => i.assignmentId === raw);
        if (from) void sb.moveTo(from, box.id);
      }}
    >
      <div className="relative">
        <BoxMediaView box={box} mode="card" />
        <button
          type="button"
          onClick={() => sb.openFocus(box.id)}
          aria-label={`Open shot ${number}`}
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-md border border-white/20 bg-black/70 p-1.5 text-white/90 backdrop-blur transition-colors hover:bg-black/75"
          data-testid="box-open"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-3 p-4">
        {/* Slate ---------------------------------------------------------------- */}
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 min-w-10 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-background px-1.5 font-mono text-lg font-semibold tabular-nums text-primary">{String(number).padStart(2, "0")}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-foreground/60">
                {formatTimecode(box.start)}–{formatTimecode(box.end)}
                <span className="ml-1 text-foreground/35">({formatDuration(box.end - box.start)})</span>
              </span>
              {box.section && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] capitalize text-foreground/60">{box.section}</span>}
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                <Clapperboard className="h-3 w-3" />
                {shotTypeLabel(box.spec.shotType)}
              </span>
              {energy && <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", ENERGY_STYLES[energy])}>{energy}</span>}
              {box.override && (
                <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-medium text-fuchsia-300" data-testid="box-edited-tag">
                  edited
                </span>
              )}
              {sb.staleOf(box) && (
                <span
                  className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300"
                  title="Written from an earlier version of the treatment. Regenerate its scene, or rewrite it yourself, to bring it to the treatment as it stands."
                  data-testid="box-stale"
                >
                  earlier treatment
                </span>
              )}
              {box.locked && (
                <span className="inline-flex items-center gap-1 text-[10px] text-foreground/45" title="Whole-board generation skips this shot" data-testid="box-locked">
                  <Lock className="h-3 w-3" /> yours
                </span>
              )}
            </div>
            {sb.wardrobeGapOf(box) && (
              <p className="mt-1 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[11px] leading-snug text-amber-200" data-testid="box-wardrobe-gap">
                {sb.wardrobeGapOf(box)}
              </p>
            )}
            {/* The take standing in for work not done. Red, not amber: an unfinished shot that LOOKS finished is the
                failure this card exists to prevent — a draft is watchable, but it must never read as done. */}
            {unmet && (
              <p
                className="mt-1 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] leading-snug text-red-200"
                data-testid="box-unmet"
                data-unmet-kind={unmet.kind}
              >
                {unmet.text} <span className="text-red-200/70">{unmet.fix}</span>
              </p>
            )}
            <p className="mt-1 line-clamp-4 text-sm leading-snug text-foreground/85" data-testid="box-scene">
              {sceneText(box)}
            </p>
          </div>
        </div>

        {/* Lyrics --------------------------------------------------------------- */}
        {lines.length > 0 ? (
          <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2" data-testid="box-lyrics">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">
              <Quote className="h-3 w-3" /> Lyrics in this shot
            </div>
            {lines.map((l) => (
              <p key={l.lineIndex} className="text-sm italic leading-snug text-foreground/90">
                {l.cutIn ? "…" : ""}
                {l.text}
                {l.cutOut ? "…" : ""}
              </p>
            ))}
          </div>
        ) : state === "instrumental" ? (
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-foreground/40">
            <Quote className="h-3 w-3" /> Instrumental — no lyrics in this window
          </div>
        ) : null}

        <ContinuityChips box={box} />
        <CastChips box={box} />
            <ProductionChips box={box} />
        <BeatStrip box={box} compact />

        {coverageFlag && <p className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-200">{coverageFlag}</p>}

        {/* Footage on this shot ------------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-1.5" data-testid="box-media-strip">
          {media.items.map((item) => {
            const showing = media.showing === item;
            return (
              <button
                key={item.assignmentId ?? `base-${item.asset.id}`}
                type="button"
                draggable={!!item.assignmentId}
                onDragStart={(e) => {
                  if (!item.assignmentId) return;
                  e.dataTransfer.setData("application/x-avt-assignment", item.assignmentId);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => (showing ? sb.openFocus(box.id) : void sb.select(item, box))}
                title={`${mediaLabel(item)} · ${item.asset.name}${showing ? " (showing)" : " — click to show this"}`}
                className={cn(
                  "max-w-[11rem] truncate rounded-full px-2 py-0.5 text-[10px] font-medium transition-all",
                  ROLE_STYLE[item.role],
                  showing ? "ring-1 ring-white/60" : "opacity-60 hover:opacity-100",
                )}
                data-testid="box-media-chip"
                data-role={item.role}
                data-showing={showing ? "true" : "false"}
              >
                {mediaLabel(item)}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => sb.openPicker(box.id)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-foreground/55 hover:text-foreground"
            data-testid="box-add-media"
          >
            <Plus className="h-3 w-3" /> footage
          </button>
        </div>

        {(busy || (job && job.state !== "done")) && (
          <p
            className={cn("flex items-center gap-1.5 text-[11px]", job?.state === "failed" && !busy ? "text-rose-300" : "text-foreground/60")}
            data-testid="box-status"
          >
            {working && <Loader2 className="h-3 w-3 animate-spin" />}
            {busy ?? job?.message}
          </p>
        )}

        {/* The three actions ---------------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          <Button
            size="sm"
            className="h-8 px-2.5 text-[11px]"
            disabled={!!busy}
            onClick={() => (blocked ? toast.info(blocked) : void sb.rewrite(box))}
            title={blocked ?? "Rewrite this shot's scene from the treatment and the words sung in it. Its footage is not touched."}
            variant="generation"
            data-testid="box-rewrite"
          >
            <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Regenerate scene
          </Button>
          <Button size="sm" variant="outline" className="h-8 px-2.5 text-[11px]" disabled={!!busy} onClick={() => sb.generateImage(box)} data-testid="box-generate-image">
            <ImageIcon className="mr-1.5 h-3.5 w-3.5" /> {est?.restage ? "Place" : "Image"}{est ? ` · ${usd(est.image)}` : ""}
          </Button>
          <Button size="sm" variant="outline" className="h-8 px-2.5 text-[11px]" disabled={!!busy} onClick={() => sb.generateClip(box)} data-testid="box-generate-clip">
            <Film className="mr-1.5 h-3.5 w-3.5" /> {est?.restage ? "Restage" : "Clip"}{est && !est.clipBlocked ? ` · ${usd(est.clip)}` : ""}
          </Button>
          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              aria-label="More"
              className="rounded-md p-1.5 text-foreground/50 hover:bg-white/5 hover:text-foreground"
              data-testid="box-menu"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menu && (
              <div
                className="absolute bottom-full right-0 z-20 mb-1 w-52 overflow-hidden rounded-lg border border-border bg-popover py-1 text-xs shadow-lg"
                onMouseLeave={() => setMenu(false)}
              >
                {(
                  [
                    ["Edit this shot", () => sb.openFocus(box.id), "box-menu-edit"],
                    ["Push the scene further", () => void sb.rewrite(box, "surreal"), "box-menu-further"],
                    ["Split shot", () => sb.openFocus(box.id), "box-menu-split"],
                    ["Merge with next", () => sb.mergeWithNext(box), "box-menu-merge"],
                    [box.locked ? "Unlock (let the board rewrite it)" : "Lock (keep it as it is)", () => void sb.toggleLock(box), "box-menu-lock"],
                    ...(box.override ? ([["Reset to the generated scene", () => void sb.resetBox(box), "box-menu-reset"]] as const) : []),
                  ] as ReadonlyArray<readonly [string, () => void, string]>
                ).map(([label, fn, testId]) => (
                  <button
                    key={testId}
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-foreground/80 hover:bg-white/5"
                    onClick={() => {
                      setMenu(false);
                      fn();
                    }}
                    data-testid={testId}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
