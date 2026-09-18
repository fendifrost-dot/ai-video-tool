import type { ReactNode } from "react";
import {
  Aperture,
  Camera,
  Clapperboard,
  Lightbulb,
  MapPin,
  Megaphone,
  Move,
  Scissors,
  Shirt,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ShotSpec } from "@/lib/treatment/shotSpec";
import { PrevisFrame } from "./PrevisFrame";
import {
  cameraAngleLabel,
  cameraMotionLabel,
  formatDuration,
  formatTimecode,
  framingLabel,
  shotTypeLabel,
  transitionLabel,
} from "./shotLabels";

/**
 * One cinematic treatment shot card — a director's storyboard panel, not an
 * engineering row. Large previs on top; filmmaker-readable Shot Spec fields
 * below. Engineering vocabulary (mask/SAM/keyframe/temporal/reconstruction) is
 * deliberately never rendered here.
 */

/** Optional beat energy accent, carried from the clip grid (not in Shot Spec). */
export type ShotEnergy = "low" | "mid" | "high" | "drop";

const ENERGY_STYLES: Record<ShotEnergy, string> = {
  low: "bg-sky-500/15 text-sky-300",
  mid: "bg-emerald-500/15 text-emerald-300",
  high: "bg-amber-500/15 text-amber-300",
  drop: "bg-rose-500/15 text-rose-300",
};

function lensSummary(spec: ShotSpec): string {
  const parts: string[] = [];
  if (spec.lens.focalLengthMm) parts.push(`${spec.lens.focalLengthMm}mm`);
  if (spec.lens.aperture) parts.push(spec.lens.aperture);
  const tech = parts.join(" · ");
  if (tech && spec.lens.description) return `${tech} — ${spec.lens.description}`;
  return tech || spec.lens.description;
}

function movementSummary(spec: ShotSpec): string {
  const label =
    spec.cameraMotion.type === "static" ? "" : cameraMotionLabel(spec.cameraMotion.type);
  const desc = spec.cameraMotion.description;
  if (label && desc) return `${label} — ${desc}`;
  return label || desc;
}

function environmentSummary(spec: ShotSpec): string {
  return [spec.environment.description, spec.environment.location, spec.environment.timeOfDay]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");
}

function lightingSummary(spec: ShotSpec): string {
  return [spec.lighting.style, spec.lighting.description]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" — ");
}

function wardrobeSummary(spec: ShotSpec): string {
  return [spec.wardrobe.name, spec.wardrobe.description]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" — ");
}

/** A labelled line: icon + heading + value, hidden entirely when value empty. */
function Field({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-xs">
      <span className="mt-0.5 shrink-0 text-foreground/40">{icon}</span>
      <span className="min-w-0">
        <span className="text-foreground/45">{label}</span>{" "}
        <span className="text-foreground/85">{value}</span>
      </span>
    </div>
  );
}

/** A small pill for a discrete camera attribute (framing / angle). */
function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-foreground/70">
      {children}
    </span>
  );
}

export function ShotCard({
  spec,
  index,
  energy,
  className,
}: {
  spec: ShotSpec;
  /** 1-based position on the timeline, shown as the slate number. */
  index?: number;
  energy?: ShotEnergy | null;
  className?: string;
}) {
  const duration = Math.max(0, spec.timeline.end - spec.timeline.start);
  const framing = framingLabel(spec.framing);
  const angle = cameraAngleLabel(spec.cameraAngle);
  const lens = lensSummary(spec);
  const movement = movementSummary(spec);
  const environment = environmentSummary(spec);
  const lighting = lightingSummary(spec);
  const wardrobe = wardrobeSummary(spec);
  const fx = spec.fx.filter((f) => f.type || f.description);

  const transitionOut =
    spec.transitionOut.type !== "cut" ? transitionLabel(spec.transitionOut.type) : "";
  const transitionIn =
    spec.transitionIn.type !== "cut" ? transitionLabel(spec.transitionIn.type) : "";

  return (
    <Card className={cn("overflow-hidden", className)}>
      <PrevisFrame spec={spec} />

      <div className="space-y-3 p-4">
        {/* Slate line: number · timecode · type ------------------------------ */}
        <div className="flex items-start gap-3">
          {index != null && (
            <span className="mt-0.5 shrink-0 font-mono text-lg font-semibold tabular-nums text-foreground/30">
              {String(index).padStart(2, "0")}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-foreground/60">
                {formatTimecode(spec.timeline.start)}–{formatTimecode(spec.timeline.end)}
                <span className="ml-1 text-foreground/35">({formatDuration(duration)})</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                <Clapperboard className="h-3 w-3" />
                {shotTypeLabel(spec.shotType)}
              </span>
              {energy && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    ENERGY_STYLES[energy],
                  )}
                >
                  {energy}
                </span>
              )}
            </div>
            {spec.title && (
              <h3 className="mt-1 truncate text-sm font-semibold text-foreground">{spec.title}</h3>
            )}
            <p className="mt-0.5 text-sm leading-snug text-foreground/80">{spec.purpose}</p>
          </div>
        </div>

        {/* Camera chips: framing · angle ------------------------------------ */}
        {(framing || angle) && (
          <div className="flex flex-wrap gap-1.5">
            {framing && <Chip>{framing}</Chip>}
            {angle && <Chip>{angle}</Chip>}
          </div>
        )}

        {/* Filmmaker fields -------------------------------------------------- */}
        <div className="space-y-1.5">
          <Field icon={<Move className="h-3.5 w-3.5" />} label="Movement" value={movement} />
          <Field icon={<Aperture className="h-3.5 w-3.5" />} label="Lens" value={lens} />
          <Field
            icon={<MapPin className="h-3.5 w-3.5" />}
            label="Environment"
            value={environment}
          />
          <Field icon={<Lightbulb className="h-3.5 w-3.5" />} label="Lighting" value={lighting} />
          <Field icon={<Shirt className="h-3.5 w-3.5" />} label="Wardrobe" value={wardrobe} />
          <Field
            icon={<Megaphone className="h-3.5 w-3.5" />}
            label="Direction"
            value={spec.performanceDirection}
          />
        </div>

        {/* FX ---------------------------------------------------------------- */}
        {fx.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-foreground/40" />
            {fx.map((f, i) => (
              <span
                key={i}
                className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300"
                title={f.description || undefined}
              >
                {f.type || f.description}
              </span>
            ))}
          </div>
        )}

        {/* Transitions ------------------------------------------------------- */}
        {(transitionIn || transitionOut) && (
          <div className="flex items-center gap-1.5 border-t border-border/50 pt-2 text-[10px] text-foreground/50">
            <Scissors className="h-3 w-3" />
            {transitionIn && <span>In: {transitionIn}</span>}
            {transitionIn && transitionOut && <span className="text-foreground/25">·</span>}
            {transitionOut && <span>Out: {transitionOut}</span>}
          </div>
        )}
      </div>
    </Card>
  );
}
