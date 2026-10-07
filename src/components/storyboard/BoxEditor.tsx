import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, Save, Scissors, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cameraMotionLabel, formatTimecode, framingLabel, shotTypeLabel } from "@/components/treatment/shotLabels";
import { MIN_BOX_SECONDS, type BoxOverride, type StoryboardBox } from "@/lib/storyboard/boxes";
import { CAMERA_MOTIONS, FRAMINGS, SHOT_TYPES } from "@/lib/treatment/shotSpec";
import { DEFAULT_TRANSITION_PRESET_NAMES, DEFAULT_TRANSITION_PRESETS } from "@/lib/treatment/transitions";
import { BeatsEditor } from "./TimedBeats";
import { ShotCastEditor } from "./Cast";
import { ShotContinuityEditor } from "./Continuity";
import { ShotProductionEditor } from "./ShotProduction";
import { useStoryboard } from "./useStoryboardController";

type Draft = {
  direction: string;
  frame: string;
  shotType: string;
  cameraMotionType: string;
  cameraMotionDescription: string;
  framing: string;
  transitionInPreset: string;
  requiredElements: string[];
  notes: string;
};

function draftOf(o: BoxOverride | null): Draft {
  return {
    direction: o?.direction ?? "",
    frame: o?.frame ?? "",
    shotType: o?.shotType ?? "",
    cameraMotionType: o?.cameraMotion?.type ?? "",
    cameraMotionDescription: o?.cameraMotion?.description ?? "",
    framing: o?.framing ?? "",
    transitionInPreset: o?.transitionIn?.preset ?? "",
    requiredElements: o?.requiredElements ?? [],
    notes: o?.notes ?? "",
  };
}

function overrideOf(d: Draft, prev: BoxOverride | null): BoxOverride {
  return {
    // An empty field is "not changed", never "set this to nothing": the generated value shows through.
    direction: d.direction.trim() || null,
    frame: d.frame.trim() || null,
    shotType: d.shotType || null,
    cameraMotion: d.cameraMotionType || d.cameraMotionDescription.trim() ? { type: d.cameraMotionType || null, description: d.cameraMotionDescription.trim() || null } : null,
    framing: d.framing || null,
    transitionIn: d.transitionInPreset ? { preset: d.transitionInPreset } : null,
    requiredElements: d.requiredElements.length ? d.requiredElements : null,
    notes: d.notes.trim() || null,
    // edited in their own blocks (Timed beats, Continuity): this form carries them through untouched
    events: prev?.events ?? null,
    continuity: prev?.continuity ?? null,
    manual: prev?.manual ?? null,
  };
}

const selectClass = "h-9 w-full rounded-md border border-border bg-background/60 px-2 text-xs text-foreground";

/**
 * The details of one shot: its scene, the frame it opens on, its type and its camera. What the director changes
 * here is saved onto the shot's own record; a field left empty keeps the generated value.
 */
export function BoxEditor({ box }: { box: StoryboardBox }) {
  const sb = useStoryboard();
  const [draft, setDraft] = useState<Draft>(() => draftOf(box.override));
  const [dirty, setDirty] = useState(false);
  const [chip, setChip] = useState("");
  const busy = sb.busyOf(box.id);

  // the record is the starting point; re-seed when it changes underneath, never over unsaved typing
  const stamp = `${box.id}:${box.updatedAt}`;
  useEffect(() => {
    if (dirty) return;
    setDraft(draftOf(box.override));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, dirty]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };
  const addChip = () => {
    const v = chip.trim();
    if (!v || draft.requiredElements.includes(v)) return;
    set("requiredElements", [...draft.requiredElements, v]);
    setChip("");
  };
  const g = box.generated;
  const placeholders = useMemo(
    () => ({
      direction: g.performanceDirection || g.purpose,
      frame: g.environment.description || "The frame it opens on: the place, who and what is in the picture, the light",
      motion: g.cameraMotion.description || "how the move is played",
    }),
    [g],
  );

  return (
    <div className="space-y-3" data-testid="box-editor">
      <label className="block text-[11px] text-foreground/55">
        Scene — what happens
        <Textarea value={draft.direction} onChange={(e) => set("direction", e.target.value)} placeholder={placeholders.direction} rows={4} className="mt-1 text-sm" data-testid="box-editor-direction" />
      </label>
      <label className="block text-[11px] text-foreground/55">
        {box.spec.shotType === "performance" ? "The place he performs in (drawn with nobody in it — your take is restaged there)" : "The frame it opens on (an image is drawn from this)"}
        <Textarea value={draft.frame} onChange={(e) => set("frame", e.target.value)} placeholder={placeholders.frame} rows={2} className="mt-1 text-sm" data-testid="box-editor-frame" />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11px] text-foreground/55">
          Type
          <select className={`${selectClass} mt-1`} value={draft.shotType} onChange={(e) => set("shotType", e.target.value)} data-testid="box-editor-type">
            <option value="">Generated — {shotTypeLabel(g.shotType)}</option>
            {SHOT_TYPES.map((t) => (
              <option key={t} value={t}>
                {shotTypeLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[11px] text-foreground/55">
          Framing
          <select className={`${selectClass} mt-1`} value={draft.framing} onChange={(e) => set("framing", e.target.value)} data-testid="box-editor-framing">
            <option value="">Generated{g.framing ? ` — ${framingLabel(g.framing)}` : ""}</option>
            {FRAMINGS.map((f) => (
              <option key={f} value={f}>
                {framingLabel(f)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[11px] text-foreground/55">
          Camera move
          <select className={`${selectClass} mt-1`} value={draft.cameraMotionType} onChange={(e) => set("cameraMotionType", e.target.value)} data-testid="box-editor-camera">
            <option value="">Generated</option>
            {CAMERA_MOTIONS.map((m) => (
              <option key={m} value={m}>
                {cameraMotionLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[11px] text-foreground/55">
          Transition in
          <select className={`${selectClass} mt-1`} value={draft.transitionInPreset} onChange={(e) => set("transitionInPreset", e.target.value)}>
            <option value="">Generated</option>
            {DEFAULT_TRANSITION_PRESET_NAMES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")} — {DEFAULT_TRANSITION_PRESETS[t].suits}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Input value={draft.cameraMotionDescription} onChange={(e) => set("cameraMotionDescription", e.target.value)} placeholder={placeholders.motion} className="h-9 text-xs" aria-label="How the camera move is played" />

      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1">
          {draft.requiredElements.map((el) => (
            <span key={el} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-200">
              {el}
              <button type="button" aria-label={`Remove ${el}`} onClick={() => set("requiredElements", draft.requiredElements.filter((x) => x !== el))}>
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
        <Input
          value={chip}
          onChange={(e) => setChip(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addChip();
            }
          }}
          onBlur={addChip}
          placeholder="Must be in frame — type and press Enter"
          className="h-9 text-xs"
        />
      </div>

      <Input value={draft.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Note to yourself (not sent to the generators)" className="h-9 text-xs" />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!!busy || !dirty}
          onClick={() => void sb.saveEdit(box, overrideOf(draft, box.override)).then(() => setDirty(false))}
          data-testid="box-editor-save"
        >
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save
        </Button>
        {box.override && (
          <Button
            size="sm"
            variant="ghost"
            disabled={!!busy}
            onClick={() => {
              setDirty(false);
              void sb.resetBox(box);
            }}
            data-testid="box-editor-reset"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset to generated
          </Button>
        )}
        {dirty && <span className="text-[11px] text-amber-300/80">unsaved</span>}
      </div>

      <BeatsEditor box={box} />
      <ShotContinuityEditor box={box} />
      <ShotProductionEditor box={box} />

      <ShotCastEditor box={box} />

      <SplitMerge box={box} />
    </div>
  );
}

/** Split this shot in two, or merge it with the one after it. The song's time stays fully covered either way. */
function SplitMerge({ box }: { box: StoryboardBox }) {
  const sb = useStoryboard();
  const lo = box.start + MIN_BOX_SECONDS;
  const hi = box.end - MIN_BOX_SECONDS;
  const canSplit = hi > lo;
  const [at, setAt] = useState(() => Math.round(((box.start + box.end) / 2) * 100) / 100);
  useEffect(() => setAt(Math.round(((box.start + box.end) / 2) * 100) / 100), [box.id, box.start, box.end]);
  const isLast = sb.boxes[sb.boxes.length - 1]?.id === box.id;
  // a cut belongs on the beat: the song's own beats inside this shot are where the slider can be stepped to
  const beats = (sb.clock.beats ?? []).filter((t) => t >= lo && t <= hi);
  const current = Math.min(hi, Math.max(lo, at));
  const onBeat = beats.some((t) => Math.abs(t - current) < 0.011);
  const step = (dir: 1 | -1) => {
    const next = dir > 0 ? beats.find((t) => t > current + 0.011) : [...beats].reverse().find((t) => t < current - 0.011);
    if (next != null) setAt(Math.round(next * 100) / 100);
  };
  return (
    <div className="space-y-2 border-t border-border/50 pt-3" data-testid="box-split-merge">
      <p className="text-[11px] text-foreground/55">Timing — this shot covers {formatTimecode(box.start)}–{formatTimecode(box.end)} of the song.</p>
      {canSplit && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="range" min={lo} max={hi} step={0.01} value={Math.min(hi, Math.max(lo, at))} onChange={(e) => setAt(Number(e.target.value))} className="h-1 min-w-[8rem] flex-1 accent-primary" aria-label="Split point" data-testid="box-split-at" />
          <span className="font-mono text-[11px] tabular-nums text-foreground/70" data-testid="box-split-time" data-on-beat={onBeat ? "true" : "false"}>
            {at.toFixed(2)} s{onBeat ? " · on the beat" : ""}
          </span>
          {beats.length > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Button size="sm" variant="ghost" className="h-8 px-1.5 text-[11px]" onClick={() => step(-1)} aria-label="Move the split to the beat before" data-testid="box-split-prev-beat">
                ‹ beat
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-1.5 text-[11px]" onClick={() => step(1)} aria-label="Move the split to the next beat" data-testid="box-split-next-beat">
                beat ›
              </Button>
            </span>
          )}
          <Button size="sm" variant="outline" className="h-8 text-[11px]" disabled={!!sb.busyOf(box.id)} onClick={() => void sb.split(box, at)} data-testid="box-split">
            <Scissors className="mr-1.5 h-3.5 w-3.5" /> Split shot here
          </Button>
        </div>
      )}
      {!isLast && (
        <Button size="sm" variant="outline" className="h-8 text-[11px]" disabled={!!sb.busyOf(box.id)} onClick={() => sb.mergeWithNext(box)} data-testid="box-merge">
          Merge with next
        </Button>
      )}
    </div>
  );
}
