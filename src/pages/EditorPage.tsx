import { useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { CutTimeline } from "@/components/editor/CutTimeline";
import { Button } from "@/components/ui/button";
import { useEditSequence, useEditSequences } from "@/lib/queries/editSequences";
import { applyGesture, type Gesture } from "../../supabase/functions/edit-render/model";

/**
 * The cut. Sequences live in edit_sequences (migration 20261018020000). Until that
 * migration is applied in the Lovable SQL editor, the list is empty and says so.
 * Slipping here changes the sequence in the page; it does not write slip_seconds.
 */
export default function EditorPage({ projectId }: { projectId: string }) {
  const list = useEditSequences(projectId);
  const [picked, setPicked] = useState<string | null>(null);
  const id = picked ?? (list.data?.[0] ? String((list.data[0] as { id: string }).id) : null);
  const one = useEditSequence(id);
  const [local, setLocal] = useState<ReturnType<typeof applyGesture> | null>(null);
  const sequence = local && local.id === one.data?.id ? local : (one.data ?? null);

  const onGesture = (g: Gesture) => {
    if (!sequence) return;
    setLocal(applyGesture(sequence, g));
  };

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Cut"
        subtitle="Assemble the song. A render plan costs nothing and does not call a provider."
      />
      {list.error && (
        <p className="text-sm text-amber-300" data-testid="cut-error">
          {(list.error as Error).message}. Apply migration 20261018020000 in the Lovable SQL editor,
          then reload.
        </p>
      )}
      {!list.error && list.data && list.data.length === 0 && (
        <p className="text-sm text-foreground/60" data-testid="cut-empty">
          No sequences on this project yet. Importing the YSL cold open is a write to the new edit
          tables, not to the board.
        </p>
      )}
      {list.data && list.data.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {list.data.map((row) => {
            const r = row as { id: string; name: string };
            return (
              <Button
                key={r.id}
                size="sm"
                variant={r.id === id ? "default" : "outline"}
                onClick={() => {
                  setPicked(r.id);
                  setLocal(null);
                }}
              >
                {r.name}
              </Button>
            );
          })}
        </div>
      )}
      {sequence && <CutTimeline sequence={sequence} onGesture={onGesture} />}
    </div>
  );
}
