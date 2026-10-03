import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { ROLE_STYLE, mediaLabel } from "@/components/storyboard/BoxMediaView";
import { ContactSheet } from "@/components/storyboard/ContactSheet";
import { CutCheck } from "@/components/storyboard/CutCheck";
import { SequencePlayer } from "@/components/storyboard/SequencePlayer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatTimecode } from "@/components/treatment/shotLabels";
import { useAssignments, useProjectMedia, useStoryboardBoxes, useTakeSyncs } from "@/lib/queries/storyboard";
import { aspectOfProject } from "@/lib/project/aspect";
import { useProject } from "@/lib/queries/projects";
import { useSongAnalysis } from "@/lib/queries/songAnalyses";
import { buildTimeline, isOriginalTake, isUsableSync, timelineIssues, type TimelineSegment } from "@/lib/storyboard/media";
import { cn } from "@/lib/utils";

/**
 * Review — the storyboard watched as one piece. Each shot plays the media selected on its record, in song order,
 * against the song. It is assembled in the browser from the same timeline a render service will read; nothing here
 * is rendered, and nothing is claimed that the tool cannot do yet.
 */
export default function StoryboardReviewPage({ projectId }: { projectId: string }) {
  const boxesQuery = useStoryboardBoxes(projectId);
  const assignmentsData = useAssignments(projectId).data;
  const syncsData = useTakeSyncs(projectId).data;
  const boxes = useMemo(() => boxesQuery.data ?? [], [boxesQuery.data]);
  const assignments = useMemo(() => assignmentsData ?? [], [assignmentsData]);
  const syncs = useMemo(() => syncsData ?? [], [syncsData]);
  const media = useProjectMedia(projectId);
  const analysis = useSongAnalysis(projectId).data ?? null;
  const aspect = aspectOfProject(useProject(projectId).data);
  const [active, setActive] = useState<TimelineSegment | null>(null);
  const [jump, setJump] = useState<{ t: number; n: number } | null>(null);

  const timeline = useMemo(() => buildTimeline({ boxes, assignments, assets: media.byId, syncs }), [boxes, assignments, media.byId, syncs]);
  const issues = useMemo(() => timelineIssues(timeline), [timeline]);
  const songPath = media.song?.file_url ?? null;
  const songName = songPath?.split("/").pop() ?? "the song";
  const song = useMemo(() => (songPath ? { bucket: "project-audio", path: songPath } : null), [songPath]);

  const withFootage = timeline.filter((s) => s.media.kind !== "none").length;
  const songSeconds = analysis?.duration_seconds ?? null;
  const checkSong = useMemo(() => (song ? { ref: song, name: songName, analysisSeconds: songSeconds } : null), [song, songName, songSeconds]);
  const covered = timeline.length ? timeline[timeline.length - 1].end - timeline[0].start : 0;
  const takes = media.list.filter(isOriginalTake);
  const takesSynced = takes.filter((t) => syncs.some((s) => s.performanceAssetId === t.id && isUsableSync(s))).length;

  const checks: { ok: boolean; label: string; detail: string }[] = [
    {
      ok: issues.length === 0 && (!songSeconds || Math.abs(songSeconds - covered) < 1.5),
      label: "Shots cover the song",
      detail: issues.length ? issues.join("; ") : `${covered.toFixed(1)} s of shots${songSeconds ? ` for a ${songSeconds.toFixed(1)} s song` : ""}`,
    },
    { ok: withFootage === timeline.length, label: "Every shot has footage", detail: `${withFootage} of ${timeline.length}` },
    { ok: takes.length === takesSynced, label: "Takes in sync with the song", detail: takes.length ? `${takesSynced} of ${takes.length}` : "no takes in the project" },
  ];

  return (
    <>
      <PageHeader title="Review" subtitle="The storyboard played in order against the song, from the footage selected on each shot." variant="compact" />
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-4 md:px-8 md:py-6" data-testid="review-page">
        {boxesQuery.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : timeline.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-foreground/60">
            There are no shots to play yet.{" "}
            <Link to="/projects/$id/storyboard" params={{ id: projectId }} className="underline">
              Open the storyboard
            </Link>
            .
          </div>
        ) : (
          <>
            <SequencePlayer timeline={timeline} assets={media.byId} song={song} onSegment={setActive} jumpTo={jump} aspect={aspect} />
            <p className="text-[11px] leading-relaxed text-foreground/45" data-testid="review-truth">
              This is a preview assembled in your browser from lighter copies of the footage. Cuts land on the shot boundaries; transitions, camera moves on your takes and the final grade are not shown. A
              finished render is not made in the app yet.
            </p>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              <Card className="p-0" data-testid="review-shots">
                <ul className="max-h-[26rem] divide-y divide-border/50 overflow-y-auto">
                  {timeline.map((s) => (
                    <li key={s.shotId} className={cn(active?.shotId === s.shotId && "bg-primary/10")}>
                     <button
                      type="button"
                      onClick={() => setJump((j) => ({ t: s.start, n: (j?.n ?? 0) + 1 }))}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/5"
                      data-testid="review-shot"
                      data-box-key={s.key}
                      data-media-kind={s.media.kind}
                     >
                      <span className="w-7 shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground/35">{String(s.index).padStart(2, "0")}</span>
                      <span className="w-24 shrink-0 font-mono text-[11px] text-foreground/55">
                        {formatTimecode(s.start)}–{formatTimecode(s.end)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground/75">{s.scene}</span>
                      {s.media.kind === "none" ? (
                        <span className="shrink-0 text-[10px] text-foreground/30">no footage</span>
                      ) : (
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", ROLE_STYLE[s.media.role])}>{mediaLabel({ role: s.media.role, base: s.media.base })}</span>
                      )}
                     </button>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="space-y-2 p-4" data-testid="review-checks">
                <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Checks</h2>
                {checks.map((c) => (
                  <div key={c.label} className="flex items-start gap-2 text-xs" data-testid="review-check" data-ok={c.ok ? "true" : "false"}>
                    <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full", c.ok ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300")}>
                      {c.ok ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    </span>
                    <span>
                      <span className="text-foreground/85">{c.label}</span> <span className="text-foreground/45">— {c.detail}</span>
                    </span>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button asChild size="sm" variant="outline" className="text-[11px]">
                    <Link to="/projects/$id/storyboard" params={{ id: projectId }}>
                      Back to the storyboard
                    </Link>
                  </Button>
                  <Button asChild size="sm" className="text-[11px]">
                    <Link to="/projects/$id/export" params={{ id: projectId }}>
                      Continue to Export
                    </Link>
                  </Button>
                </div>
              </Card>
            </div>

            <ContactSheet timeline={timeline} assets={media.byId} aspect={aspect} />

            <CutCheck timeline={timeline} boxes={boxes} assignments={assignments} assets={media.byId} syncs={syncs} song={checkSong} />
          </>
        )}
      </div>
    </>
  );
}
