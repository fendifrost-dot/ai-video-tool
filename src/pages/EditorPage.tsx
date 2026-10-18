import { useCallback, useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { EditorWorkspace } from "@/components/editor/EditorWorkspace";
import { Button } from "@/components/ui/button";
import { useEditSequence, useEditSequences } from "@/lib/queries/editSequences";

/**
 * Timeline workspace — CapCut-style cut over edit_sequences.
 * Does not write shots, assignments, or slip_seconds.
 */
export default function EditorPage({ projectId }: { projectId: string }) {
  const list = useEditSequences(projectId);
  const [picked, setPicked] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const id = picked ?? list.data?.[0]?.id ?? null;
  const one = useEditSequence(id);

  const confirmLeave = useCallback(() => {
    if (!dirty) return true;
    return window.confirm("You have unsaved edits on this cut. Leave without saving?");
  }, [dirty]);

  useBlocker({
    shouldBlockFn: () => !confirmLeave(),
    enableBeforeUnload: dirty,
    disabled: !dirty,
  });

  const pickSequence = (nextId: string) => {
    if (nextId === id) return;
    if (!confirmLeave()) return;
    setPicked(nextId);
  };

  return (
    <div className="flex min-h-0 flex-col gap-4 p-3 sm:p-4" data-testid="editor-page">
      <PageHeader
        title="Timeline"
        subtitle="Watch the cut with the song, arrange takes, trim and align mouth timing."
        variant="compact"
      />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/80 px-3 py-2">
        <Button asChild size="sm" variant="outline">
          <Link
            to="/projects/$id/storyboard"
            params={{ id: projectId }}
            onClick={(e) => {
              if (!confirmLeave()) e.preventDefault();
            }}
          >
            Shots
          </Link>
        </Button>
        <Button size="sm" variant="default">
          Timeline
        </Button>
        <span className="text-xs text-muted-foreground">Song stays locked while you move picture</span>
      </div>

      {list.error && (
        <p className="text-sm text-amber-200" data-testid="cut-error">
          Could not load sequences. Sign in again if your session expired, then reload.
        </p>
      )}
      {!list.error && list.data && list.data.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="cut-empty">
          No sequences on this project yet. Import a cut or add clips from Versions once a sequence
          exists.
        </p>
      )}
      {list.data && list.data.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {list.data.map((row) => (
            <Button
              key={row.id}
              size="sm"
              variant={row.id === id ? "default" : "outline"}
              onClick={() => pickSequence(row.id)}
            >
              {row.name}
            </Button>
          ))}
        </div>
      )}

      {one.isLoading && id && (
        <p className="text-sm text-muted-foreground">Loading sequence…</p>
      )}
      {one.data && (
        <EditorWorkspace
          projectId={projectId}
          sequence={one.data}
          onSequenceId={(next) => setPicked(next)}
          onDirtyChange={setDirty}
        />
      )}
    </div>
  );
}
