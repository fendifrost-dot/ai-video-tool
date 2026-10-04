import { useEffect, useMemo, useState } from "react";
import { useEventClock } from "@/lib/queries/eventClock";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { ROLE_STYLE, mediaLabel } from "@/components/storyboard/BoxMediaView";
import { AstraSectionReview } from "@/components/storyboard/AstraSectionReview";
import { ContactSheet } from "@/components/storyboard/ContactSheet";
import { CutCheck } from "@/components/storyboard/CutCheck";
import { AcceptanceChip } from "@/components/storyboard/Acceptance";
import { asksByAsset } from "@/lib/queries/acceptance";
import { useProjectProviderJobs } from "@/lib/providerJobs/queries";
import { acceptanceLine, cutAcceptance, cutAcceptanceLine, reviewedByAsset } from "@/lib/storyboard/acceptance";
import { readStoredReview } from "@/lib/storyboard/astraSection";
import { SequencePlayer } from "@/components/storyboard/SequencePlayer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatTimecode } from "@/components/treatment/shotLabels";
import { useLyricLines } from "@/lib/queries/lyricLines";
import { useAssignments, useProjectMedia, useStoryboardBoxes, useTakeSyncs } from "@/lib/queries/storyboard";
import { aspectOfProject } from "@/lib/project/aspect";
import { useProject } from "@/lib/queries/projects";
import { useSongAnalysis } from "@/lib/queries/songAnalyses";
import { buildTimeline, isOriginalTake, isUsableSync, timelineIssues, type TimelineSegment } from "@/lib/storyboard/media";
import { normalSection, sectionFromSearch, sectionOf, type ReviewSection } from "@/lib/storyboard/section";
import { directorNotes, parseTreatmentDoc } from "@/lib/treatment/treatmentDoc";
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
  const project = useProject(projectId).data ?? null;
  const aspect = aspectOfProject(project);
  const lyricLines = useLyricLines(projectId).data;
  const treatmentDoc = useMemo(() => parseTreatmentDoc(project?.treatment_json), [project?.treatment_json]);
  const [active, setActive] = useState<TimelineSegment | null>(null);
  const [jump, setJump] = useState<{ t: number; n: number } | null>(null);

  // what a timed event's trigger is looked up in: the lyric timing and the song's beats
  const clock = useEventClock(projectId);
  const whole = useMemo(() => buildTimeline({ boxes, assignments, assets: media.byId, syncs, clock }), [boxes, assignments, media.byId, syncs, clock]);
  // a section of the song to look at on its own: the shots from one number to another (kept in the link, so it can be sent)
  const [section, setSection] = useState<ReviewSection | null>(() => sectionFromSearch(typeof window === "undefined" ? "" : window.location.search));
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (section) {
      url.searchParams.set("from", String(section.from));
      url.searchParams.set("to", String(section.to));
    } else {
      url.searchParams.delete("from");
      url.searchParams.delete("to");
    }
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url.href);
  }, [section]);
  const timeline = useMemo(() => sectionOf(whole, section), [whole, section]);
  const inSection = section != null && timeline.length > 0 && timeline.length < whole.length;
  const issues = useMemo(() => timelineIssues(whole), [whole]);
  const songPath = media.song?.file_url ?? null;
  const songName = songPath?.split("/").pop() ?? "the song";
  const song = useMemo(() => (songPath ? { bucket: "project-audio", path: songPath } : null), [songPath]);

  const withFootage = whole.filter((s) => s.media.kind !== "none").length;
  const songSeconds = analysis?.duration_seconds ?? null;
  const checkSong = useMemo(() => (song ? { ref: song, name: songName, analysisSeconds: songSeconds } : null), [song, songName, songSeconds]);
  const covered = whole.length ? whole[whole.length - 1].end - whole[0].start : 0;
  const takes = media.list.filter(isOriginalTake);
  const takesSynced = takes.filter((t) => syncs.some((s) => s.performanceAssetId === t.id && isUsableSync(s))).length;

  // Whether each generated clip does what it was asked to — which is not whether it plays. What each was asked for is
  // on the job that made it; what was measured and what was judged by eye is on the clip.
  const jobsData = useProjectProviderJobs(projectId).data;
  const asks = useMemo(() => asksByAsset((jobsData ?? []) as never), [jobsData]);
  // …and what the last second opinion found, tied to the clip each shot was showing when it looked
  const reviewed = useMemo(() => reviewedByAsset(readStoredReview(project?.treatment_json), assignments, media.byId, asks), [project?.treatment_json, assignments, media.byId, asks]);
  const accepted = useMemo(() => cutAcceptance(whole, media.byId, asks, reviewed), [whole, media.byId, asks, reviewed]);
  const acceptedHere = useMemo(() => new Map(accepted.clips.map((c) => [c.shotId, c])), [accepted]);
  const shownAccepted = accepted.clips.filter((c) => timeline.some((s) => s.shotId === c.shotId));

  const checks: { ok: boolean; label: string; detail: string }[] = [
    {
      ok: issues.length === 0 && (!songSeconds || Math.abs(songSeconds - covered) < 1.5),
      label: "Shots cover the song",
      detail: issues.length ? issues.join("; ") : `${covered.toFixed(1)} s of shots${songSeconds ? ` for a ${songSeconds.toFixed(1)} s song` : ""}`,
    },
    { ok: withFootage === whole.length, label: "Every shot has footage", detail: `${withFootage} of ${whole.length}` },
    { ok: takes.length === takesSynced, label: "Takes in sync with the song", detail: takes.length ? `${takesSynced} of ${takes.length}` : "no takes in the project" },
    ...(accepted.verdict === "none" ? [] : [{ ok: accepted.verdict === "meets", label: "Generated clips do what was asked", detail: cutAcceptanceLine(accepted).replace(/^\d+ generated clips?: /, "") }]),
  ];

  return (
    <>
      <PageHeader title="Review" subtitle="The storyboard played in order against the song, from the footage selected on each shot." variant="compact" />
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-4 md:px-8 md:py-6" data-testid="review-page">
        {boxesQuery.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : whole.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-foreground/60">
            There are no shots to play yet.{" "}
            <Link to="/projects/$id/storyboard" params={{ id: projectId }} className="underline">
              Open the storyboard
            </Link>
            .
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60" data-testid="review-section" data-section={inSection ? `${section!.from}-${section!.to}` : "all"}>
              <span>Play</span>
              <select
                className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                value={section?.from ?? 1}
                onChange={(e) => setSection(normalSection({ from: Number(e.target.value), to: section?.to ?? whole.length }, whole.length))}
                aria-label="First shot of the section"
                data-testid="review-section-from"
              >
                {whole.map((s) => (
                  <option key={s.shotId} value={s.index}>
                    shot {String(s.index).padStart(2, "0")} · {formatTimecode(s.start)}
                  </option>
                ))}
              </select>
              <span>to</span>
              <select
                className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                value={section?.to ?? whole.length}
                onChange={(e) => setSection(normalSection({ from: section?.from ?? 1, to: Number(e.target.value) }, whole.length))}
                aria-label="Last shot of the section"
                data-testid="review-section-to"
              >
                {whole.map((s) => (
                  <option key={s.shotId} value={s.index}>
                    shot {String(s.index).padStart(2, "0")} · {formatTimecode(s.end)}
                  </option>
                ))}
              </select>
              {inSection ? (
                <>
                  <span className="text-foreground/45" data-testid="review-section-summary">
                    {timeline.length} shots · {(timeline[timeline.length - 1].end - timeline[0].start).toFixed(1)} s of the song
                  </span>
                  <button type="button" className="underline hover:text-foreground" onClick={() => setSection(null)} data-testid="review-section-clear">
                    whole song
                  </button>
                </>
              ) : (
                <span className="text-foreground/45">the whole song</span>
              )}
            </div>
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
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", ROLE_STYLE[s.media.role])}>{mediaLabel({ role: s.media.role, base: s.media.base, asset: media.byId.get(s.media.assetId) })}</span>
                      )}
                      {acceptedHere.has(s.shotId) && <AcceptanceChip verdict={acceptedHere.get(s.shotId)!.acceptance.verdict} />}
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

            {shownAccepted.length > 0 && (
              <Card className="space-y-2 p-4" data-testid="review-acceptance" data-verdict={accepted.verdict} data-fails={accepted.fails} data-open={accepted.open} data-meets={accepted.meets}>
                <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">What was asked for</h2>
                <p className="text-xs text-foreground/55">
                  A clip that plays is not thereby the clip that was asked for. Each generated clip is held against its own request — timing, framing, lip sync, lighting, camera, whole bodies and objects, the action — by what was measured off the file, what a second opinion found and what was judged by eye; what nothing has
                  looked at is not counted as met. In the whole cut: {cutAcceptanceLine(accepted)}.
                </p>
                <ul className="space-y-1.5">
                  {shownAccepted.map((c) => (
                    <li key={c.shotId} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-testid="review-acceptance-clip" data-box-key={c.key} data-asset-id={c.assetId} data-verdict={c.acceptance.verdict}>
                      <span className="w-7 shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground/35">{String(c.index).padStart(2, "0")}</span>
                      <AcceptanceChip verdict={c.acceptance.verdict} />
                      <span className="text-foreground/75">{acceptanceLine(c.acceptance)}</span>
                      <Link to="/projects/$id/storyboard" params={{ id: projectId }} className="text-[10px] text-foreground/40 underline decoration-dotted underline-offset-2 hover:text-foreground/70">
                        judge it on the shot
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <ContactSheet timeline={timeline} assets={media.byId} aspect={aspect} close={inSection} />

            <AstraSectionReview
              projectId={projectId}
              section={timeline}
              isSection={inSection}
              assets={media.byId}
              lyricLines={lyricLines}
              treatment={treatmentDoc.text}
              notes={directorNotes(project?.notes, treatmentDoc.notes)}
              songTitle={project?.song_title ?? null}
              takeWears={takes.find((t) => t.shows)?.shows ?? null}
              projectJson={project?.treatment_json}
            />

            {/* the check is of the whole cut, whatever section is being looked at: a section cannot be right inside a cut that is not */}
            <CutCheck timeline={whole} boxes={boxes} assignments={assignments} assets={media.byId} syncs={syncs} song={checkSong} playerTimeline={inSection ? timeline : undefined} accepted={accepted} />
          </>
        )}
      </div>
    </>
  );
}
