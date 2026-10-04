import { AlertTriangle, Camera, Loader2, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Finding, FootageAnalysis } from "@/lib/storyboard/footage";
import type { Compatibility } from "@/lib/storyboard/compatibility";
import type { Staleness, StoredFootageAnalysis } from "@/lib/storyboard/footageRecord";
import type { BoxMediaItem } from "@/lib/storyboard/media";
import { cn } from "@/lib/utils";
import { FrameThumb } from "./FrameThumb";
import { mediaRefKey, playbackRef } from "./signedUrls";
import { useStoryboard } from "./useStoryboardController";

/**
 * What this take IS, and what a background has to be for it — read off the footage itself.
 *
 * The panel shows the finding, how firmly it is held, and what to do about it. It never shows the arithmetic: a
 * director wants "he is framed thigh up, so do not ask for a background that shows his feet", not a reach of 11.47
 * eye-distances. The number is there, under the finding, for whoever wants to argue with it.
 *
 * Advisory. Pressing nothing here regenerates a clip, replaces an asset, edits a treatment or moves a timeline.
 */

const ROUTE_LABEL: Record<Compatibility["route"]["choice"], string> = {
  keep: "Keep this take as filmed",
  composite: "Put this performance over a background",
  restage: "Let a model restage it",
  reshoot: "Film it again",
};
const ROUTE_STYLE: Record<Compatibility["route"]["choice"], string> = {
  keep: "bg-emerald-500/15 text-emerald-300",
  composite: "bg-sky-500/15 text-sky-300",
  restage: "bg-amber-500/15 text-amber-200",
  reshoot: "bg-rose-500/15 text-rose-300",
};
const STATUS_STYLE: Record<Finding<unknown>["status"], string> = {
  measured: "bg-emerald-500/10 text-emerald-300/90",
  estimated: "bg-amber-500/10 text-amber-200/90",
  unknown: "bg-white/5 text-foreground/45",
};

function label(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return String(Math.round(v * 1000) / 1000);
  if (Array.isArray(v)) return v.length ? v.join(", ") : "none";
  if (typeof v === "object")
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => `${k} ${label(x)}`)
      .join(" · ");
  return String(v).replace(/_/g, " ");
}

/** One finding: what it says, how firmly, and — folded under it — what it was read from. */
function Row({ name, f }: { name: string; f: Finding<unknown> }) {
  return (
    <div
      className="flex items-start gap-2 py-0.5 text-[11px]"
      data-testid="footage-finding"
      data-finding={name}
      data-status={f.status}
    >
      <span
        className={cn(
          "mt-px shrink-0 rounded px-1 py-px text-[9px] font-medium uppercase tracking-wide",
          STATUS_STYLE[f.status],
        )}
      >
        {f.status === "estimated" ? `est ${f.confidence ?? ""}` : f.status}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-foreground/50">{name.replace(/([A-Z])/g, " $1").toLowerCase()}</span>{" "}
        <span className="text-foreground/90">{label(f.value)}</span>
        <span className="block text-foreground/35">{f.evidence}</span>
        {f.limit && <span className="block text-amber-200/45">cannot say: {f.limit}</span>}
      </span>
    </div>
  );
}

function Group({ title, findings }: { title: string; findings: Record<string, unknown> }) {
  const rows = Object.entries(findings).filter(
    ([, v]) => v && typeof v === "object" && "status" in (v as object),
  ) as [string, Finding<unknown>][];
  if (!rows.length) return null;
  return (
    <div>
      <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-foreground/40">
        {title}
      </p>
      {rows.map(([k, f]) => (
        <Row key={k} name={k} f={f} />
      ))}
    </div>
  );
}

export function FootageAnalysisPanel({ item }: { item: BoxMediaItem }) {
  const sb = useStoryboard();
  const asset = item.asset;
  if (item.kind !== "video") return null;
  const picked = sb.footageAnalysisOf(asset) ?? null;
  const busy = sb.analyzingOf(asset.id);
  const stored: StoredFootageAnalysis | null = picked?.analysis ?? null;
  const staleness: Staleness | null = picked?.staleness ?? null;
  const a: FootageAnalysis | null = stored?.analysis ?? null;
  const spec: Compatibility | null = stored?.compatibility ?? null;
  const key = mediaRefKey(playbackRef(asset));
  const url = sb.urlFor(asset);

  return (
    <div
      className="space-y-2 rounded-lg border border-border/70 bg-white/[0.02] p-2.5"
      data-testid="footage-analysis"
      data-asset-id={asset.id}
      data-state={busy ? "reading" : a ? "read" : "unread"}
      data-route={spec?.route.choice ?? ""}
      data-staleness={staleness?.state ?? ""}
    >
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/55">
          What this take is
        </p>
        {busy ? (
          <span
            className="inline-flex items-center gap-1 text-[10px] text-foreground/50"
            data-testid="footage-stage"
          >
            <Loader2 className="h-3 w-3 animate-spin" /> {busy}
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 px-1.5 text-[10px] text-foreground/50"
            onClick={() => void sb.analyzeFootage(asset)}
            data-testid="footage-run"
          >
            <Scan className="mr-1 h-3 w-3" /> {a ? "Read again" : "Read the footage"}
          </Button>
        )}
      </div>

      {!a && !busy && (
        <p className="text-[11px] leading-snug text-foreground/45">
          Reads this take frame by frame — where he is, how much of him was filmed, whether the
          camera moved, how it is lit — and turns it into what a background would have to be.
          Nothing is generated and nothing is changed.
        </p>
      )}

      {staleness && staleness.state === "stale" && (
        <p
          className="flex items-start gap-1.5 rounded bg-amber-500/10 px-1.5 py-1 text-[10px] text-amber-200/90"
          data-testid="footage-stale"
        >
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" /> This reading is out of date:{" "}
          {staleness.why}. Read it again before relying on it.
        </p>
      )}

      {a && spec && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                ROUTE_STYLE[spec.route.choice],
              )}
              data-testid="footage-route"
            >
              {ROUTE_LABEL[spec.route.choice]}
            </span>
            <span className="text-[10px] text-foreground/40">
              confidence {spec.route.confidence}
            </span>
          </div>
          <ul className="space-y-0.5 text-[11px] leading-snug text-foreground/70">
            {spec.route.because.map((b, i) => (
              <li key={i}>· {b}</li>
            ))}
          </ul>
          {spec.route.risks.length > 0 && (
            <ul className="space-y-0.5 text-[11px] leading-snug text-amber-200/70">
              {spec.route.risks.map((b, i) => (
                <li key={i}>! {b}</li>
              ))}
            </ul>
          )}

          {stored?.evidence.length ? (
            <div className="flex flex-wrap gap-1.5" data-testid="footage-evidence">
              {stored.evidence.map((e) => (
                <figure key={`${e.t}-${e.why}`} className="w-16">
                  <FrameThumb fileKey={key} url={url} seconds={e.t} className="w-16 rounded" />
                  <figcaption className="mt-0.5 text-[9px] leading-tight text-foreground/40">
                    {e.why}
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : null}

          <details className="group">
            <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-foreground/40 hover:text-foreground/60">
              What the background must be ({spec.hard.length} required, {spec.preferences.length}{" "}
              preferred)
            </summary>
            <div className="mt-1 space-y-1.5">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-foreground/40">
                  Required — measured off this take
                </p>
                <ul className="space-y-0.5 text-[11px] leading-snug text-foreground/75">
                  {spec.hard.map((c, i) => (
                    <li key={i} data-testid="footage-hard">
                      <span className="text-foreground/40">[{c.kind}]</span> {c.text}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-foreground/40">
                  Preferred — estimated, so a miss is a note, not a reject
                </p>
                <ul className="space-y-0.5 text-[11px] leading-snug text-foreground/60">
                  {spec.preferences.map((c, i) => (
                    <li key={i} data-testid="footage-preference">
                      <span className="text-foreground/40">[{c.kind}]</span> {c.text}
                    </li>
                  ))}
                </ul>
              </div>
              {spec.conflicts.length > 0 && (
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-amber-200/60">
                    Where the treatment and the take disagree
                  </p>
                  <ul className="space-y-0.5 text-[11px] leading-snug text-amber-200/70">
                    {spec.conflicts.map((c, i) => (
                      <li key={i} data-testid="footage-conflict">
                        {c.wants}, but {c.footage}.{" "}
                        {c.resolvableBy
                          ? `Resolved by ${c.resolvableBy}.`
                          : "Nothing short of filming it again resolves this."}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {spec.gaps.length > 0 && (
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-rose-300/60">
                    AVT cannot do this today
                  </p>
                  <ul className="space-y-0.5 text-[11px] leading-snug text-rose-200/60">
                    {spec.gaps.map((g, i) => (
                      <li key={i} data-testid="footage-gap">
                        · {g}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>

          {spec.capture.length > 0 && (
            <details>
              <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-foreground/40 hover:text-foreground/60">
                <Camera className="mr-1 inline h-3 w-3" /> Next time the camera is out (
                {spec.capture.length})
              </summary>
              <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-foreground/70">
                {spec.capture.map((c, i) => (
                  <li key={i} data-testid="footage-capture">
                    · {c}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <details>
            <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-foreground/40 hover:text-foreground/60">
              Every finding, and how firmly it is held
            </summary>
            <div className="mt-1 space-y-1.5">
              <Group title="file" findings={a.file} />
              <Group title="him" findings={a.subject} />
              <Group title="camera" findings={a.camera} />
              <Group title="light" findings={a.light} />
              <Group title="focus" findings={a.focus} />
              <Group title="cutting him out" findings={a.separation} />
              <Group title="floor" findings={a.floor} />
              <Group title="sound" findings={a.audio} />
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-foreground/40">
                  Not established
                </p>
                <ul className="space-y-0.5 text-[11px] leading-snug text-foreground/45">
                  {a.notEstablished.map((n, i) => (
                    <li key={i}>· {n}</li>
                  ))}
                </ul>
              </div>
              <p className="text-[9px] text-foreground/30">
                analyzer v{a.version} · read {a.sampled.detailFrames} frames over {a.range[0]}–
                {a.range[1]} s · face dropped on {a.sampled.dropped.noFace} not found,{" "}
                {a.sampled.dropped.tooDark} too dark, {a.sampled.dropped.tooSmall} too small
              </p>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
