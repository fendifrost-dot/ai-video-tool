/**
 * This variation's own cut of an inherited take — the controls, and the one sentence a director needs to know
 * which of the two layers they are looking at.
 *
 * The take and its place on the song belong to the PROJECT: every variation of the song gets them without asking,
 * which is why a take appears under a shot of a brand-new variation with no rows of its own. What is edited here
 * belongs to THIS VARIATION ALONE (`shot_asset_assignments`, which is variation-scoped), so a trim made here
 * cannot reach Paris Black Runway or another candidate — and nothing here writes a sync.
 *
 * A trim is typed in seconds OF THE SHOT, not of the file, because that is the only form in which it cannot
 * break sync: trimming shortens what the shot uses and never slides the footage. The file seconds shown
 * underneath are derived, every time, and are there to be checked against the take.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  coverageLabel,
  editOf,
  isSyncedTake,
  takeCoverage,
  type TakeCoverage,
} from "@/lib/storyboard/footageEdit";
import type { BoxMediaItem } from "@/lib/storyboard/media";
import type { StoryboardBox } from "@/lib/storyboard/boxes";
import { useStoryboard } from "./useStoryboardController";

const secs = (v: string): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1e3) / 1e3 : 0;
};

export function FootageEditPanel({ item, box }: { item: BoxMediaItem; box: StoryboardBox }) {
  const sb = useStoryboard();
  const row = item.assignmentId ? (sb.assignmentOf?.(item.assignmentId) ?? null) : null;
  const edit = editOf(row);
  const [head, setHead] = useState(String(edit.head));
  const [tail, setTail] = useState(String(edit.tail));
  // a trim saved elsewhere (another tab, an undo) must show here, without stamping on what is being typed
  useEffect(() => {
    setHead(String(edit.head));
    setTail(String(edit.tail));
  }, [edit.head, edit.tail]);

  if (!isSyncedTake(item)) return null;

  // the base layer has no row, so its coverage is the whole synced coverage: what this shot would use if nobody
  // decided anything. Showing it is what makes an inherited take editable rather than merely visible.
  const coverage: TakeCoverage =
    item.edit ??
    takeCoverage({
      box,
      sync: sb.syncOf?.(item.asset.id) ?? null,
      takeDurationSeconds: item.asset.durationSeconds,
    });
  const excluded = coverage.from === "excluded";
  const touched = edit.head > 0 || edit.tail > 0;
  const seconds = box.end - box.start;

  const save = (h: string, t: string) =>
    void sb.editFootage(box, item.asset.id, { do: "trim", head: secs(h), tail: secs(t) });

  return (
    <div
      className={cn(
        "space-y-1.5 rounded-md border px-2 py-1.5",
        excluded ? "border-amber-500/40 bg-amber-500/5" : "border-border/60 bg-background/40",
      )}
      data-testid="footage-edit"
      data-edit-from={coverage.from}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[10px] font-medium text-foreground/70"
          data-testid="footage-edit-state"
        >
          {coverageLabel(coverage)}
        </span>
        {/* which layer this is, said plainly: inherited and untouched, or a decision this variation made */}
        <span
          className="text-[9px] uppercase tracking-wide text-foreground/40"
          data-testid="footage-edit-layer"
        >
          {item.base && !touched && !excluded
            ? "inherited · this variation has made no cut"
            : "this variation only"}
        </span>
      </div>

      {!excluded && (
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="flex items-center gap-1 text-[10px] text-foreground/60">
            trim in
            <input
              type="number"
              min={0}
              max={seconds}
              step={0.04}
              value={head}
              onChange={(e) => setHead(e.target.value)}
              onBlur={(e) => save(e.target.value, tail)}
              className="h-6 w-16 rounded border border-border bg-background/60 px-1 font-mono text-[10px]"
              data-testid="footage-trim-head"
              aria-label="Seconds of the shot trimmed off the start of this take"
            />
          </label>
          <label className="flex items-center gap-1 text-[10px] text-foreground/60">
            trim out
            <input
              type="number"
              min={0}
              max={seconds}
              step={0.04}
              value={tail}
              onChange={(e) => setTail(e.target.value)}
              onBlur={(e) => save(head, e.target.value)}
              className="h-6 w-16 rounded border border-border bg-background/60 px-1 font-mono text-[10px]"
              data-testid="footage-trim-tail"
              aria-label="Seconds of the shot trimmed off the end of this take"
            />
          </label>
          {touched && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[10px]"
              onClick={() => void sb.editFootage(box, item.asset.id, { do: "reset" })}
              data-testid="footage-edit-reset"
            >
              Back to the synced coverage
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {excluded ? (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-1.5 text-[10px]"
            onClick={() => void sb.editFootage(box, item.asset.id, { do: "restore" })}
            data-testid="footage-edit-restore"
          >
            Use this take here again
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px] text-amber-300/90"
            onClick={() => void sb.editFootage(box, item.asset.id, { do: "exclude" })}
            data-testid="footage-edit-exclude"
          >
            Leave this take out of this shot
          </Button>
        )}
      </div>

      {/* derived, never stored: the sync maps the shot's window onto the file, and a trim narrows that window */}
      {coverage.sourceIn != null && (
        <p className="font-mono text-[9px] text-foreground/40" data-testid="footage-edit-derived">
          {item.asset.name} {coverage.sourceIn.toFixed(2)}–{coverage.sourceOut!.toFixed(2)} s
          {coverage.leadIn > 0
            ? ` · ${coverage.leadIn.toFixed(2)} s of the shot before it starts`
            : ""}
          {coverage.tailOut > 0 ? ` · ${coverage.tailOut.toFixed(2)} s after it ends` : ""}
        </p>
      )}
      {excluded && (
        <p className="text-[9px] text-amber-300/70" data-testid="footage-edit-excluded-note">
          A decision, not an absence — the take is still in the project and still synced, and
          another variation is unaffected.
        </p>
      )}
    </div>
  );
}
