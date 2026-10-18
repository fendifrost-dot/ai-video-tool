import {
  MOUTH_GUIDANCE,
  historyLine,
  sourceHandles,
  timingExplanation,
  type EditClip,
  type EditSequence,
  type Gesture,
  type PerformanceProvenance,
} from "../../../supabase/functions/edit-render/model";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  sequence: EditSequence;
  clip: EditClip | null;
  slipBaseline: { sourceIn: number; sourceOut: number } | null;
  onGesture: (g: Gesture) => void;
  onResetSlip: () => void;
  /** How the selected clip's picture was made (asset lineage). Display only. */
  provenance?: PerformanceProvenance | null;
  className?: string;
};

const STEPS = [
  { label: "1f", frames: 1 },
  { label: "5f", frames: 5 },
  { label: "12f", frames: 12 },
  { label: "1s", frames: 24 },
] as const;

/**
 * Move clip = where it sits on the song.
 * Adjust footage timing = which source frames play inside the same timeline slot (slip).
 */
export function SyncPanel({
  sequence,
  clip,
  slipBaseline,
  onGesture,
  onResetSlip,
  provenance = null,
  className,
}: Props) {
  if (!clip) {
    return (
      <div className={cn("rounded-xl border border-border bg-card p-3", className)} data-testid="sync-panel">
        <h2 className="font-display text-sm font-semibold">Timing</h2>
        <p className="mt-1 text-xs text-muted-foreground">Select a clip to move it or adjust footage timing.</p>
      </div>
    );
  }

  const handles = sourceHandles(clip);
  const slipDelta =
    slipBaseline != null
      ? Math.round((clip.sourceIn - slipBaseline.sourceIn) * sequence.fps)
      : 0;
  const slipCopy = timingExplanation("slip", slipDelta, sequence.fps);

  return (
    <div className={cn("space-y-3 rounded-xl border border-border bg-card p-3", className)} data-testid="sync-panel">
      <div>
        <h2 className="font-display text-sm font-semibold text-foreground">Timing</h2>
        <p className="text-[11px] text-muted-foreground">
          <strong className="text-foreground">Move clip</strong> changes where it appears on the song.{" "}
          <strong className="text-foreground">Adjust footage timing</strong> changes which source frames
          play inside the same slot.
        </p>
      </div>

      <div className="rounded-lg border border-border/70 bg-background/50 px-2 py-1.5 text-[11px]">
        <p className="font-medium text-foreground">{clip.shotKey || clip.name}</p>
        <p className="text-muted-foreground">
          Source {clip.sourceIn.toFixed(2)}–{clip.sourceOut.toFixed(2)}s · Timeline{" "}
          {clip.timelineIn.toFixed(2)}–{clip.timelineOut.toFixed(2)}s
        </p>
        <p className="text-muted-foreground">
          {handles.known
            ? `Available unused footage: ${handles.head.toFixed(2)}s before · ${handles.tail.toFixed(2)}s after`
            : "Source length unknown — extend only when the file has unused footage"}
        </p>
        {clip.mouth && (
          <p className="mt-1 text-muted-foreground" data-testid="sync-provenance" data-mouth={clip.mouth}>
            {MOUTH_GUIDANCE[clip.mouth]}
          </p>
        )}
        {!clip.mouth && clip.assetId && (
          <p className="mt-1 text-muted-foreground" data-testid="sync-provenance" data-mouth="">
            Not a performance picture.
          </p>
        )}
        {provenance && provenance.history.length > 0 && (
          <p className="text-[10px] text-muted-foreground/80" data-testid="sync-provenance-history">
            History: {historyLine(provenance.history)}
          </p>
        )}
      </div>

      <section>
        <h3 className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Move clip on song</h3>
        <div className="flex flex-wrap gap-1">
          {STEPS.map((s) => (
            <Button
              key={`m-${s.label}`}
              size="sm"
              variant="outline"
              onClick={() =>
                onGesture({ kind: "move", clipId: clip.id, deltaFrames: -s.frames, ripple: false })
              }
            >
              Earlier {s.label}
            </Button>
          ))}
          {STEPS.map((s) => (
            <Button
              key={`m+${s.label}`}
              size="sm"
              variant="outline"
              onClick={() =>
                onGesture({ kind: "move", clipId: clip.id, deltaFrames: s.frames, ripple: false })
              }
            >
              Later {s.label}
            </Button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Adjust footage timing
        </h3>
        <p className="mb-1 text-[11px] text-muted-foreground" data-testid="slip-explanation">
          {slipCopy.label}
        </p>
        <div className="flex flex-wrap gap-1">
          {STEPS.map((s) => (
            <Button
              key={`s-${s.label}`}
              size="sm"
              variant="secondary"
              onClick={() => onGesture({ kind: "slip", clipId: clip.id, deltaFrames: -s.frames })}
            >
              Mouth later {s.label}
            </Button>
          ))}
          {STEPS.map((s) => (
            <Button
              key={`s+${s.label}`}
              size="sm"
              variant="secondary"
              onClick={() => onGesture({ kind: "slip", clipId: clip.id, deltaFrames: s.frames })}
            >
              Mouth earlier {s.label}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={onResetSlip} disabled={!slipBaseline}>
            Reset timing
          </Button>
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Trim / extend</h3>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onGesture({ kind: "trim", clipId: clip.id, edge: "in", deltaFrames: 1, ripple: false })
            }
          >
            Trim head 1f
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={handles.known && handles.head < 1 / sequence.fps}
            onClick={() =>
              onGesture({ kind: "trim", clipId: clip.id, edge: "in", deltaFrames: -1, ripple: false })
            }
          >
            Extend head 1f
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onGesture({ kind: "trim", clipId: clip.id, edge: "out", deltaFrames: -1, ripple: false })
            }
          >
            Trim tail 1f
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={handles.known && handles.tail < 1 / sequence.fps}
            onClick={() =>
              onGesture({ kind: "trim", clipId: clip.id, edge: "out", deltaFrames: 1, ripple: false })
            }
          >
            Extend tail 1f
          </Button>
        </div>
      </section>
    </div>
  );
}
