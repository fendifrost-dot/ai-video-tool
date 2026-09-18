import { useEffect } from "react";
import { Film } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ShotSpec } from "@/lib/treatment/shotSpec";
import { derivePrevisVisual, type PrevisMotion } from "./previsVisual";
import { framingAbbr, formatTimecode } from "./shotLabels";

/**
 * Large animated previs area for a treatment shot card.
 *
 * Priority order for what fills the frame:
 *   1. A real previs still/clip if one exists (Lane E render, or a `uri` on the
 *      Shot Spec's `previs` block) — rendered as <video>/<img>.
 *   2. Otherwise a deterministic CSS storyboard frame derived from the shot's
 *      creative fields (palette, subject blocking, angle, camera motion).
 *
 * No paid generation ever happens here — the placeholder is pure CSS.
 */

const KEYFRAME_STYLE_ID = "avt-previs-keyframes";

// Injected once. Keeping the keyframes out of global CSS keeps this component
// self-contained (Lane B owns only src/components/treatment/**).
const KEYFRAMES = `
@keyframes avt-previs-pan { from { transform: translateX(-4%); } to { transform: translateX(4%); } }
@keyframes avt-previs-tilt { from { transform: translateY(-3.5%); } to { transform: translateY(3.5%); } }
@keyframes avt-previs-push { from { transform: scale(1); } to { transform: scale(1.14); } }
@keyframes avt-previs-drift { from { transform: translateX(-6%) scale(1.06); } to { transform: translateX(6%) scale(1.06); } }
@keyframes avt-previs-orbit { 0% { transform: translateX(-5%) scale(1.08); } 50% { transform: translateX(5%) scale(1.12); } 100% { transform: translateX(-5%) scale(1.08); } }
@keyframes avt-previs-shake { 0%,100% { transform: translate(0,0); } 25% { transform: translate(0.7%,-0.6%); } 50% { transform: translate(-0.6%,0.5%); } 75% { transform: translate(0.5%,0.6%); } }
@keyframes avt-previs-rise { from { transform: translateY(6%) scale(1.04); } to { transform: translateY(-6%) scale(1.04); } }
@keyframes avt-previs-whip { 0%,78% { transform: translateX(-6%); } 90% { transform: translateX(9%); } 100% { transform: translateX(9%); } }
.avt-previs-scene { will-change: transform; }
@media (prefers-reduced-motion: reduce) { .avt-previs-scene { animation: none !important; } }
`;

function ensureKeyframes(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(KEYFRAME_STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = KEYFRAME_STYLE_ID;
  el.textContent = KEYFRAMES;
  document.head.appendChild(el);
}

function motionAnimation(motion: PrevisMotion): string | undefined {
  switch (motion) {
    case "pan":
      return "avt-previs-pan 7s ease-in-out infinite alternate";
    case "tilt":
      return "avt-previs-tilt 6s ease-in-out infinite alternate";
    case "push":
      return "avt-previs-push 9s ease-in-out infinite alternate";
    case "drift":
      return "avt-previs-drift 8s ease-in-out infinite alternate";
    case "orbit":
      return "avt-previs-orbit 12s ease-in-out infinite";
    case "shake":
      return "avt-previs-shake 1.3s ease-in-out infinite";
    case "rise":
      return "avt-previs-rise 8s ease-in-out infinite alternate";
    case "whip":
      return "avt-previs-whip 3.2s ease-in-out infinite";
    default:
      return undefined;
  }
}

/** True when this shot depicts a human subject worth blocking in the frame. */
function showsFigure(spec: ShotSpec): boolean {
  return (
    spec.shotType === "performance" ||
    spec.shotType === "narrative" ||
    spec.shotType === "lyric_visual"
  );
}

export function PrevisFrame({
  spec,
  className,
}: {
  spec: ShotSpec;
  /** Extra classes for the aspect-ratio wrapper. */
  className?: string;
}) {
  useEffect(ensureKeyframes, []);

  const visual = derivePrevisVisual(spec);
  const previsUri = spec.previs.uri;
  const abbr = framingAbbr(spec.framing);

  return (
    <div
      className={cn(
        "group relative aspect-video w-full overflow-hidden rounded-t-xl bg-black",
        className,
      )}
    >
      {previsUri ? (
        // A real previs asset (Lane E render or an attached still/clip).
        previsUri.match(/\.(mp4|webm|mov)$/i) ? (
          <video
            src={previsUri}
            className="absolute inset-0 h-full w-full object-cover"
            muted
            loop
            playsInline
            autoPlay
          />
        ) : (
          <img
            src={previsUri}
            alt={spec.title || spec.purpose}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )
      ) : (
        <>
          {/* Deterministic storyboard placeholder --------------------------- */}
          <div
            className="avt-previs-scene absolute inset-[-8%]"
            style={{
              background: visual.background,
              transform: visual.dutchDeg ? `rotate(${visual.dutchDeg}deg)` : undefined,
              animation: motionAnimation(visual.motion),
            }}
          >
            {/* Blocking: a human silhouette, or a horizon for B-roll/VFX. */}
            {showsFigure(spec) ? (
              <div
                className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center"
                style={{
                  height: `${Math.min(visual.subjectScale, 1.2) * 100}%`,
                  bottom: visual.subjectAlign === "center" ? "18%" : "0%",
                  top: visual.subjectAlign === "top" ? "6%" : undefined,
                }}
              >
                {/* head */}
                <div
                  className="rounded-full bg-black/45"
                  style={{ height: "26%", aspectRatio: "1 / 1" }}
                />
                {/* body */}
                <div
                  className="mt-[3%] w-[62%] flex-1 bg-black/45"
                  style={{ borderRadius: "45% 45% 20% 20% / 30% 30% 8% 8%" }}
                />
              </div>
            ) : (
              <div className="absolute inset-0">
                <div className="absolute inset-x-0 top-0 h-[62%] bg-white/[0.04]" />
                <div className="absolute inset-x-0 bottom-0 h-[38%] bg-black/25" />
              </div>
            )}
          </div>

          {/* Rule-of-thirds guide — reads as a viewfinder, not chrome. */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.12]">
            <div className="absolute left-1/3 top-0 h-full w-px bg-white" />
            <div className="absolute left-2/3 top-0 h-full w-px bg-white" />
            <div className="absolute left-0 top-1/3 h-px w-full bg-white" />
            <div className="absolute left-0 top-2/3 h-px w-full bg-white" />
          </div>

          <span className="pointer-events-none absolute bottom-2 right-2.5 flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/60 backdrop-blur">
            <Film className="h-2.5 w-2.5" /> Previs
          </span>
        </>
      )}

      {/* Cinematic overlays (present for both real + placeholder) ----------- */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
      {abbr && (
        <span className="absolute right-2.5 top-2 rounded bg-black/45 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-white/85 backdrop-blur">
          {abbr}
        </span>
      )}
      <span className="absolute bottom-2 left-2.5 rounded bg-black/45 px-1.5 py-0.5 font-mono text-[10px] text-white/85 backdrop-blur">
        {formatTimecode(spec.timeline.start)}–{formatTimecode(spec.timeline.end)}
      </span>
    </div>
  );
}
