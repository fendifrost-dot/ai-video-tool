import { useState } from "react";
import { Check, Eye, Ruler, ScanSearch, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acceptanceLine, FINDING_LABEL, SOURCE_LABEL, VERDICT_LABEL, type AcceptanceVerdict, type Finding, type Requirement } from "@/lib/storyboard/acceptance";
import type { BoxMediaItem } from "@/lib/storyboard/media";
import { cn } from "@/lib/utils";
import { useStoryboard } from "./useStoryboardController";

/** A moment of the song to the hundredth: the stretch to watch is given exactly. */
const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;

export const FINDING_STYLE: Record<Finding, string> = {
  meets: "bg-emerald-500/15 text-emerald-300",
  fails: "bg-rose-500/15 text-rose-300",
  undetermined: "bg-sky-500/15 text-sky-200",
  unverified: "bg-white/10 text-foreground/70",
};
export const VERDICT_STYLE: Record<AcceptanceVerdict, string> = {
  meets: "bg-emerald-500/15 text-emerald-300",
  fails: "bg-rose-500/15 text-rose-300",
  unverified: "bg-amber-500/15 text-amber-200",
};

/** A clip's acceptance as one chip — for the head of a media item and for lists. */
export function AcceptanceChip({ verdict, className }: { verdict: AcceptanceVerdict; className?: string }) {
  return (
    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", VERDICT_STYLE[verdict], className)} data-testid="acceptance-chip" data-verdict={verdict}>
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

/**
 * A generated clip held against everything it was asked for. Playing is not passing: each thing asked of the clip
 * has its own finding, and beside it where the finding comes from — MEASURED off the file, REVIEWED by a model that
 * was shown frames of the cut, or decided BY EYE by whoever looked. What nothing has looked at is said to be not
 * verified, and a clip with anything failing or open is not accepted. A judgement is recorded here with a note; it
 * never changes a measurement or a review.
 */
export function AcceptancePanel({ item, shot }: { item: BoxMediaItem; shot?: { number: number; start: number; end: number } }) {
  const sb = useStoryboard();
  const asset = item.asset;
  const acceptance = item.kind === "video" ? sb.acceptanceOf(asset) : null;
  const [judging, setJudging] = useState<{ requirement: Requirement; finding: "meets" | "fails" } | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  if (!acceptance) return null;

  const keep = async () => {
    if (!judging || saving) return;
    setSaving(true);
    await sb.judge(asset, judging.requirement, judging.finding, note);
    setSaving(false);
    setJudging(null);
    setNote("");
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-white/[0.02] p-2.5" data-testid="acceptance" data-asset-id={asset.id} data-verdict={acceptance.verdict} data-fails={acceptance.fails} data-open={acceptance.open}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/55">Does it do what was asked</p>
        <AcceptanceChip verdict={acceptance.verdict} />
        <span className="text-[10px] text-foreground/50" data-testid="acceptance-line">
          {acceptanceLine(acceptance)}
        </span>
      </div>

      {acceptance.lines.map((l) => (
        <div key={l.requirement} className="space-y-1" data-testid="acceptance-requirement" data-requirement={l.requirement} data-finding={l.finding} data-source={l.source} data-measured={l.measured?.finding ?? ""}>
          <p className="text-[11px] leading-snug text-foreground/80">
            <span className={cn("mr-1.5 rounded-full px-1.5 py-px text-[10px] font-medium", FINDING_STYLE[l.finding])}>{FINDING_LABEL[l.finding]}</span>
            <span className="font-medium text-foreground/90">{l.label}</span>
            <span className="mx-1.5 inline-flex items-center gap-0.5 text-[10px] text-foreground/45">
              {l.source === "measured" ? <Ruler className="h-2.5 w-2.5" /> : l.source === "reviewed" ? <ScanSearch className="h-2.5 w-2.5" /> : l.source === "by_eye" ? <Eye className="h-2.5 w-2.5" /> : null}
              {SOURCE_LABEL[l.source]}
              {l.judged ? ` · ${l.judged.at.slice(0, 10)}` : ""}
            </span>
            — {l.says}
          </p>
          {l.judged && l.measured && (
            <p className="pl-4 text-[10px] leading-snug text-foreground/50" data-testid="acceptance-measured">
              {l.requirement === "review" ? <ScanSearch className="mr-1 inline h-2.5 w-2.5" /> : <Ruler className="mr-1 inline h-2.5 w-2.5" />}
              {l.requirement === "review" ? "the review said" : "measured"}: {FINDING_LABEL[l.measured.finding]} — {l.measured.says}
            </p>
          )}
          {l.requirement === "lips" && shot && !l.judged && (
            <p className="pl-4 text-[10px] leading-snug text-foreground/55" data-testid="acceptance-watch">
              To settle it: watch shot {String(shot.number).padStart(2, "0")} with the song, {clock(shot.start)}–{clock(shot.end)} —{" "}
              <a className="underline decoration-dotted underline-offset-2 hover:text-foreground/80" href={`/projects/${sb.projectId}/review?from=${shot.number}&to=${shot.number}`} target="_blank" rel="noreferrer" data-testid="acceptance-watch-link">
                open it in Review
              </a>
              .
            </p>
          )}
          {judging?.requirement === l.requirement ? (
            <div className="flex flex-wrap items-center gap-1.5 pl-4">
              <input
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void keep();
                  if (e.key === "Escape") setJudging(null);
                }}
                placeholder={judging.finding === "fails" ? "What is wrong, as you saw it" : "What you saw (optional)"}
                className="h-6 min-w-0 flex-1 rounded border border-border bg-transparent px-1.5 text-[11px] text-foreground/90 outline-none focus:border-primary/60"
                data-testid="acceptance-note"
              />
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => void keep()} disabled={saving} data-testid="acceptance-keep">
                Keep “{judging.finding}”
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-foreground/50" onClick={() => setJudging(null)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1 pl-4">
              <span className="text-[10px] text-foreground/40">I looked:</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 px-1.5 text-[10px] text-emerald-300/80"
                onClick={() => {
                  setNote(l.judged?.finding === "meets" ? l.judged.note : "");
                  setJudging({ requirement: l.requirement, finding: "meets" });
                }}
                data-testid="acceptance-meets"
              >
                <Check className="mr-0.5 h-3 w-3" /> it does
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 px-1.5 text-[10px] text-rose-300/80"
                onClick={() => {
                  setNote(l.judged?.finding === "fails" ? l.judged.note : "");
                  setJudging({ requirement: l.requirement, finding: "fails" });
                }}
                data-testid="acceptance-fails"
              >
                <X className="mr-0.5 h-3 w-3" /> it does not
              </Button>
              {l.judged && (
                <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] text-foreground/45" onClick={() => void sb.judge(asset, l.requirement, null, "")} data-testid="acceptance-take-back">
                  take it back
                </Button>
              )}
            </div>
          )}
        </div>
      ))}

      <p className="text-[10px] leading-snug text-foreground/45" data-testid="acceptance-note-foot">
        Measured is what was read off the file — and a timing is of a change of light, not of what changed. Reviewed is what a model said after being shown frames of the cut. By eye is what someone decided by looking, kept with its note and date — it settles the line
        and never changes a measurement or a review. A clip that plays is not thereby a clip that does what it was asked: it is accepted only when every line is met.
      </p>
    </div>
  );
}
