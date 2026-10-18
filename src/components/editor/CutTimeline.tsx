import {
  durationSeconds,
  videoClips,
  type EditSequence,
  type Gesture,
} from "../../../supabase/functions/edit-render/model";

const MOUTH: Record<string, string> = {
  camera: "camera mouth — a slip lines it up",
  model: "model mouth — a slip will not line it up",
};

/** The sequence as a strip: each clip, its mouth, and a one-frame slip. */
export function CutTimeline({
  sequence,
  onGesture,
}: {
  sequence: EditSequence;
  onGesture?: (g: Gesture) => void;
}) {
  const clips = videoClips(sequence);
  return (
    <div className="space-y-2" data-testid="cut-timeline">
      <p className="font-mono text-xs text-foreground/70" data-testid="cut-duration">
        {sequence.name} · {durationSeconds(sequence).toFixed(3)} s · {clips.length} clips · song
        offset {sequence.songOffset.toFixed(3)} s
      </p>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {clips.map((c) => (
          <button
            key={c.id}
            type="button"
            className="shrink-0 rounded border border-border px-2 py-1 text-left text-[10px]"
            data-testid="cut-clip"
            data-shot={c.shotKey ?? ""}
            data-mouth={c.mouth ?? ""}
            data-placeholder={c.placeholder ? "true" : "false"}
            title={c.mouth ? MOUTH[c.mouth] : c.name}
            onClick={() => onGesture?.({ kind: "slip", clipId: c.id, deltaFrames: 1 })}
          >
            <span className="block font-medium">
              {c.placeholder ? `${c.shotKey} LIP` : c.shotKey}
            </span>
            <span className="text-foreground/50">
              {c.mouth === "model" ? "model mouth" : c.mouth === "camera" ? "camera" : "b-roll"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
