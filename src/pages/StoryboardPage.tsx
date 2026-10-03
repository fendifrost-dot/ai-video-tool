import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Clapperboard, LayoutGrid, List, Loader2, Play, Video } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { BoxCard, sceneText } from "@/components/storyboard/BoxCard";
import { ROLE_STYLE, mediaLabel } from "@/components/storyboard/BoxMediaView";
import { ConfirmHost } from "@/components/storyboard/ConfirmHost";
import { FocusView } from "@/components/storyboard/FocusView";
import { MediaPicker } from "@/components/storyboard/MediaPicker";
import { StoryboardProvider, useStoryboardController } from "@/components/storyboard/useStoryboardController";
import { formatDuration, formatTimecode } from "@/components/treatment/shotLabels";
import { measureCoverage, DEFAULT_COVERAGE_PRESETS } from "@/lib/treatment/coverage";
import { useLyricLines } from "@/lib/queries/lyricLines";
import { cn } from "@/lib/utils";

/**
 * The storyboard — the production desk. Every box is one permanent shot record: its window on the song, the words
 * sung in it, its scene, the footage on it. Scenes are rewritten here, images and clips are generated here, real
 * footage is put on and taken off here, and any box opens full screen.
 */
export default function StoryboardPage({ projectId }: { projectId: string }) {
  const sb = useStoryboardController(projectId);
  const lyricLines = useLyricLines(projectId).data;
  const [view, setView] = useState<"cards" | "list">("cards");

  const specs = useMemo(() => sb.boxes.map((b) => b.spec), [sb.boxes]);
  const coverage = useMemo(() => measureCoverage(specs, DEFAULT_COVERAGE_PRESETS, lyricLines), [specs, lyricLines]);
  const runtime = sb.boxes.length ? Math.max(...sb.boxes.map((b) => b.end)) - Math.min(...sb.boxes.map((b) => b.start)) : 0;
  const filled = sb.boxes.filter((b) => sb.mediaOf(b.id).showing).length;

  return (
    <StoryboardProvider value={sb}>
      <PageHeader title="Storyboard" subtitle="Every shot of the video: write it, generate it, put your footage on it, watch it." variant="compact" />
      <div className="space-y-4 px-4 py-4 md:px-8 md:py-6" data-testid="storyboard-page">
        {sb.loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : sb.error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">The storyboard could not be loaded: {sb.error}</p>
        ) : sb.boxes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-14 text-center" data-testid="storyboard-empty">
            <Clapperboard className="h-6 w-6 text-foreground/30" />
            <p className="text-sm text-foreground/60">No shots yet.</p>
            <p className="max-w-sm text-xs text-foreground/40">The storyboard is written from the treatment. Write the treatment (or let the AI write it) and the shots appear here.</p>
            <Button asChild size="sm" className="mt-2">
              <Link to="/projects/$id/treatment" params={{ id: projectId }}>
                Go to Treatment
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="flex items-center gap-2 text-xs text-foreground/55" data-testid="storyboard-summary">
                <Clapperboard className="h-3.5 w-3.5" />
                {sb.boxes.length} shots · {formatDuration(runtime)} · {filled} with footage
              </span>
              <div className="ml-auto flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg bg-white/5 p-0.5">
                  <button type="button" onClick={() => setView("cards")} className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium", view === "cards" ? "glass-raised text-foreground" : "text-foreground/50")} data-testid="view-cards">
                    <LayoutGrid className="h-3.5 w-3.5" /> Board
                  </button>
                  <button type="button" onClick={() => setView("list")} className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium", view === "list" ? "glass-raised text-foreground" : "text-foreground/50")} data-testid="view-list">
                    <List className="h-3.5 w-3.5" /> List
                  </button>
                </div>
                <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                  <Link to="/projects/$id/review" params={{ id: projectId }} data-testid="storyboard-preview-all">
                    <Play className="mr-1.5 h-3.5 w-3.5" /> Preview all
                  </Link>
                </Button>
              </div>
            </div>

            {sb.migrated && (
              <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200" data-testid="storyboard-migrated">
                This storyboard was moved onto permanent shot records: {sb.migrated.created + sb.migrated.updated} shots
                {sb.migrated.carriedEdits ? `, ${sb.migrated.carriedEdits} saved edit${sb.migrated.carriedEdits > 1 ? "s" : ""} carried across` : ""}
                {sb.migrated.linkedClips ? `, ${sb.migrated.linkedClips} generated clip${sb.migrated.linkedClips > 1 ? "s" : ""} linked to ${sb.migrated.linkedClips > 1 ? "their shots" : "its shot"}` : ""}. Nothing was removed.
              </p>
            )}

            {coverage.sections.length > 0 && (
              <div
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-[10px]",
                  coverage.pass ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300" : "border-amber-500/30 bg-amber-500/5 text-amber-200",
                )}
                data-testid="coverage-report"
              >
                <Video className="h-3 w-3" />
                <span className="font-semibold uppercase tracking-wider">Camera {coverage.pass ? "on the norm" : "needs movement"}</span>
                {coverage.sections.map((s) => (
                  <span key={s.section} className="opacity-80">
                    {s.section}: {Math.round((1 - s.staticShare) * 100)} % moving
                  </span>
                ))}
              </div>
            )}

            {view === "cards" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="storyboard-grid">
                {sb.boxes.map((box) => (
                  <BoxCard key={box.id} box={box} coverageFlag={coverage.flaggedShotIds[box.key]} />
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border" data-testid="storyboard-list">
                {sb.boxes.map((box) => {
                  const showing = sb.mediaOf(box.id).showing;
                  return (
                    <li key={box.id}>
                      <button type="button" onClick={() => sb.openFocus(box.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5" data-testid="list-row" data-box-key={box.key}>
                        <span className="w-7 shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground/35">{String(sb.numberOf(box.id)).padStart(2, "0")}</span>
                        <span className="w-24 shrink-0 font-mono text-[11px] text-foreground/55">
                          {formatTimecode(box.start)}–{formatTimecode(box.end)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-foreground/80">{sceneText(box)}</span>
                        {showing ? (
                          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", ROLE_STYLE[showing.role])}>{mediaLabel(showing)}</span>
                        ) : (
                          <span className="shrink-0 text-[10px] text-foreground/30">no footage</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
      <FocusView />
      <MediaPicker />
      <ConfirmHost request={sb.confirm} onClose={() => sb.askConfirm(null)} />
    </StoryboardProvider>
  );
}
