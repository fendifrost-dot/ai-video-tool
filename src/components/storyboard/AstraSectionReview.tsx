import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { lyricsForShot, type LyricLine } from "@/lib/lyrics/lyricsForShot";
import { projectsKeys } from "@/lib/queries/projects";
import {
  parseSectionReview,
  pollSectionReview,
  readStoredReview,
  reviewBrief,
  reviewEstimateUsd,
  saveStoredReview,
  sectionPictures,
  showsOf,
  submitSectionReview,
  type ReviewShot,
  type StoredSectionReview,
} from "@/lib/storyboard/astraSection";
import type { MediaAsset, TimelineSegment } from "@/lib/storyboard/media";
import { cn } from "@/lib/utils";
import { ConfirmHost } from "./ConfirmHost";
import { mediaRefKey, playbackRef, signRefs } from "./signedUrls";
import type { ConfirmRequest } from "./useStoryboardController";

/** The most shots one review looks at: three pictures a shot, and the reviewer has to keep them all in view. */
export const MAX_REVIEW_SHOTS = 16;
const POLL_MS = 8000;
const GIVE_UP_AFTER_MS = 12 * 60_000;

const SEVERITY_STYLE: Record<string, string> = {
  blocker: "bg-red-500/20 text-red-200",
  major: "bg-amber-500/20 text-amber-200",
  minor: "bg-white/10 text-foreground/70",
};
const VERDICT_WORDS: Record<StoredSectionReview["verdict"], string> = { pass: "Ready as it stands", revise: "Good, with shots to fix", fail: "Does not work yet" };

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Review → "Ask Astra about this section". A second opinion on the section being looked at: Astra sees three frames
 * of every shot beside what the shot was meant to be, and reports by shot number. The last review is kept on the
 * project and shown until the next one.
 */
export function AstraSectionReview({
  projectId,
  section,
  isSection,
  assets,
  lyricLines,
  treatment,
  notes,
  songTitle,
  takeWears,
  projectJson,
}: {
  projectId: string;
  /** The shots being looked at (the whole cut when no section is chosen). */
  section: readonly TimelineSegment[];
  isSection: boolean;
  assets: ReadonlyMap<string, MediaAsset>;
  lyricLines: readonly LyricLine[] | undefined;
  treatment: string;
  notes: string;
  songTitle: string | null;
  takeWears: string | null;
  /** The project's treatment_json: where the last review is kept. */
  projectJson: unknown;
}) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<StoredSectionReview | null>(null);
  const busy = useRef(false);

  const stored = useMemo(() => readStoredReview(projectJson), [projectJson]);
  const review = fresh ?? stored;

  const shots: ReviewShot[] = useMemo(
    () =>
      section.map((s) => ({
        number: s.index,
        key: s.key,
        shotId: s.shotId,
        start: s.start,
        end: s.end,
        shows: showsOf(s, s.media.kind === "none" ? null : assets.get(s.media.assetId)),
        scene: s.scene,
        lyrics: lyricsForShot((lyricLines ?? []) as LyricLine[], { start: s.start, end: s.end })
          .map((l) => l.text)
          .join(" / "),
      })),
    [section, assets, lyricLines],
  );
  const tooMany = shots.length > MAX_REVIEW_SHOTS;
  const brief = useMemo(() => (shots.length ? reviewBrief({ songTitle, treatment, notes, takeWears, shots }) : ""), [shots, songTitle, treatment, notes, takeWears]);
  const pictureCount = section.reduce((n, s) => n + (s.media.kind === "video" ? 3 : s.media.kind === "image" ? 1 : 0), 0);
  const estimate = reviewEstimateUsd(pictureCount, brief.length);

  const run = async () => {
    if (busy.current || shots.length === 0) return;
    busy.current = true;
    setError(null);
    try {
      setStage("reading the frames of each shot…");
      const { pictures, unreadable } = await sectionPictures({
        shots: section,
        assets,
        linkOf: async (asset) => {
          const ref = playbackRef(asset);
          const url = (await signRefs([ref]))[mediaRefKey(ref)];
          return url ? { key: mediaRefKey(ref), url } : null;
        },
      });
      if (pictures.length === 0) throw new Error("None of this section's footage could be read into frames");
      setStage(`sending ${pictures.length} frames to Astra…`);
      const from = shots[0].number;
      const to = shots[shots.length - 1].number;
      const note = unreadable.length ? `\n\nNo frames could be read for shot${unreadable.length === 1 ? "" : "s"} ${unreadable.join(", ")}: say nothing about ${unreadable.length === 1 ? "it" : "them"}.` : "";
      const sent = await submitSectionReview({ projectId, from, to, brief: brief + note, pictures, maxCostUsd: Math.max(1, estimate * 2) });
      const started = Date.now();
      for (;;) {
        setStage(`Astra is looking at the section… ${Math.round((Date.now() - started) / 1000)} s`);
        await wait(POLL_MS);
        const r = await pollSectionReview({ projectId, draftId: sent.draftId, responseId: sent.responseId });
        if (r.done) {
          const parsed = parseSectionReview(r.review, shots);
          const record: StoredSectionReview = { at: new Date().toISOString(), from, to, model: r.model, costUsd: r.costUsd, ...parsed };
          setFresh(record);
          await saveStoredReview(projectId, record).catch(() => undefined);
          void qc.invalidateQueries({ queryKey: projectsKeys.detail(projectId) });
          break;
        }
        if (Date.now() - started > GIVE_UP_AFTER_MS) throw new Error("Astra has not answered after twelve minutes — the review may still finish; ask again later");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStage(null);
      busy.current = false;
    }
  };

  const ask = () =>
    setConfirm({
      title: `Ask Astra about shots ${shots[0]?.number}–${shots[shots.length - 1]?.number}?`,
      body: `About $${estimate.toFixed(2)} at list price. Astra is shown ${pictureCount} frames — the opening, middle and close of each shot — with the treatment and what each shot was meant to be, and answers by shot number. It takes a few minutes. Nothing on the storyboard is changed.`,
      confirmLabel: `Ask Astra · $${estimate.toFixed(2)}`,
      testId: "confirm-astra-review",
      onConfirm: run,
    });

  const byShot = useMemo(() => {
    const out = new Map<number, StoredSectionReview["findings"]>();
    for (const f of review?.findings ?? []) out.set(f.shot, [...(out.get(f.shot) ?? []), f]);
    return [...out.entries()].sort((a, b) => a[0] - b[0]);
  }, [review]);

  return (
    <Card className="space-y-3 p-4" data-testid="astra-review-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">A second opinion</h2>
          <p className="mt-1 text-xs text-foreground/55">
            Astra looks at {isSection ? "this section" : "the cut"} against the treatment and each shot's scene, and reports shot by shot. It reads frames, not sound.
          </p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0 text-[11px]" onClick={ask} disabled={!!stage || shots.length === 0 || tooMany} data-testid="astra-review-ask">
          {stage ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />}
          Ask Astra{tooMany || shots.length === 0 ? "" : ` · $${estimate.toFixed(2)}`}
        </Button>
      </div>
      {tooMany && (
        <p className="text-[11px] text-foreground/50" data-testid="astra-review-too-many">
          Choose a section of {MAX_REVIEW_SHOTS} shots or fewer above — a review looks closely at one stretch of the song at a time.
        </p>
      )}
      {stage && (
        <p className="text-[11px] text-foreground/60" data-testid="astra-review-stage">
          {stage}
        </p>
      )}
      {error && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-200/90" data-testid="astra-review-error">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
      {review && (
        <div className="space-y-3 border-t border-border/50 pt-3" data-testid="astra-review-result" data-verdict={review.verdict} data-from={review.from} data-to={review.to}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                review.verdict === "pass" ? "bg-emerald-500/20 text-emerald-200" : review.verdict === "fail" ? "bg-red-500/20 text-red-200" : "bg-amber-500/20 text-amber-200",
              )}
              data-testid="astra-review-verdict"
            >
              {review.verdict === "pass" ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />} {VERDICT_WORDS[review.verdict]}
            </span>
            <span className="text-foreground/45">
              shots {review.from}–{review.to} · {review.at.slice(0, 16).replace("T", " ")}
              {review.costUsd != null ? ` · $${review.costUsd.toFixed(2)}` : ""}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-foreground/80" data-testid="astra-review-summary">
            {review.summary}
          </p>
          {review.release && (
            <p className="text-xs leading-relaxed text-foreground/60">
              <span className="text-foreground/40">Release: </span>
              {review.release}
            </p>
          )}
          {review.strengths.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-foreground/55">
              {review.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
          {byShot.length === 0 ? (
            <p className="text-[11px] text-foreground/50">No shot was named as needing a change.</p>
          ) : (
            <ul className="space-y-2" data-testid="astra-review-findings">
              {byShot.map(([number, findings]) => (
                <li key={number} className="rounded-lg border border-border/60 p-2.5" data-testid="astra-review-shot" data-shot={number} data-box-key={findings[0].key ?? ""}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-foreground/60">{String(number).padStart(2, "0")}</span>
                    <Link to="/projects/$id/storyboard" params={{ id: projectId }} className="text-[10px] text-foreground/40 underline hover:text-foreground/70">
                      open the storyboard
                    </Link>
                  </div>
                  <ul className="space-y-1.5">
                    {findings.map((f, i) => (
                      <li key={i} className="text-xs leading-relaxed" data-testid="astra-review-finding" data-severity={f.severity} data-area={f.area}>
                        <span className={cn("mr-1.5 rounded-full px-1.5 py-px text-[10px] font-medium", SEVERITY_STYLE[f.severity])}>{f.severity}</span>
                        <span className="mr-1.5 text-[10px] uppercase tracking-wide text-foreground/40">{f.area.replace("_", " ")}</span>
                        <span className="text-foreground/80">{f.finding}</span>
                        {f.fix && <span className="block text-foreground/55">→ {f.fix}</span>}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ConfirmHost request={confirm} onClose={() => setConfirm(null)} />
    </Card>
  );
}
