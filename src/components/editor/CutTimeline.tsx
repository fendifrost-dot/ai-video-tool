import { type EditSequence, type Gesture } from "../../../supabase/functions/edit-render/model";
import { TimelineCanvas } from "./TimelineCanvas";

/**
 * Compatibility strip used by older tests. Prefer TimelineCanvas / EditorWorkspace.
 * Selecting a clip still emits a one-frame slip for the legacy strip test; the full
 * workspace uses explicit Timing controls instead of silent click-to-slip.
 */
export function CutTimeline({
  sequence,
  onGesture,
}: {
  sequence: EditSequence;
  onGesture?: (g: Gesture) => void;
}) {
  return (
    <div className="space-y-2" data-testid="cut-timeline">
      <TimelineCanvas
        sequence={sequence}
        playhead={0}
        selectedId={null}
        pxPerSecond={48}
        onSelect={(id) => {
          if (id) onGesture?.({ kind: "slip", clipId: id, deltaFrames: 1 });
        }}
        onSeek={() => undefined}
        onGesture={(g) => onGesture?.(g)}
      />
    </div>
  );
}
