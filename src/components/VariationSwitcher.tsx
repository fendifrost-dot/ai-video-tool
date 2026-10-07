/**
 * The video variation the project is working in, and the way to change it, start another, or copy one.
 *
 * Shown in the project sidebar under the project's name on every page, so what Treatment, Storyboard, Review and
 * Export show is never a surprise: it is this video's. "New variation" starts a new creative direction over the
 * project's shared assets (song, footage, syncs, every asset made so far) with an empty board. "Duplicate" copies
 * the current direction and its work — shots, edits, entities, the footage on each shot — to be edited on its own.
 */
import { useState } from "react";
import { ChevronDown, Copy, Pencil, Plus, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Overlay } from "@/components/storyboard/Overlay";
import { useProject } from "@/lib/queries/projects";
import { useCreateVariation, useDuplicateVariation, useSetActiveVariation, useUpdateVariation, useVariations, variationLabel, type VideoVariation } from "@/lib/queries/variations";
import { parseTreatmentDoc } from "@/lib/treatment/treatmentDoc";
import { cn } from "@/lib/utils";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Prompt =
  | { kind: "new" }
  | { kind: "duplicate"; source: VideoVariation }
  | { kind: "rename"; target: VideoVariation };

export function VariationSwitcher({ projectId, compact = false }: { projectId: string; compact?: boolean }) {
  const project = useProject(projectId);
  const variations = useVariations(projectId);
  const setActive = useSetActiveVariation(projectId);
  const create = useCreateVariation(projectId);
  const duplicate = useDuplicateVariation(projectId);
  const update = useUpdateVariation(projectId);
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  const list = (variations.data ?? []).filter((v) => !v.archived);
  const activeId = project.data?.active_variation_id ?? null;
  const active = list.find((v) => v.id === activeId) ?? (variations.data ?? []).find((v) => v.id === activeId) ?? null;
  const busy = setActive.isPending || create.isPending || duplicate.isPending || update.isPending;

  const choose = async (v: VideoVariation) => {
    if (v.id === activeId) return;
    try {
      await setActive.mutateAsync(v.id);
      toast.success(`Now working in “${v.name}”`);
    } catch (e) {
      toast.error(`Could not switch: ${message(e)}`);
    }
  };

  return (
    <div data-testid="variation-switcher" data-active-variation={activeId ?? ""}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-1.5 rounded-lg border border-border/60 bg-white/[0.03] text-left transition-colors hover:bg-white/[0.06]",
              compact ? "px-2 py-1" : "mt-2 px-2.5 py-1.5",
            )}
            disabled={busy || !project.data}
            title="Which video of this song you are working in"
            data-testid="variation-switcher-trigger"
          >
            <Video className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              {!compact && <span className="block text-[9px] uppercase tracking-[0.2em] text-foreground/45">Video variation</span>}
              <span className="block truncate text-xs font-medium text-foreground" data-testid="variation-active-name">
                {active ? variationLabel(active) : variations.isLoading || project.isLoading ? "Loading…" : "No variation"}
              </span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-foreground/50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-foreground/50">Videos of this song</DropdownMenuLabel>
          {list.map((v) => (
            <DropdownMenuItem key={v.id} onSelect={() => void choose(v)} className={cn("flex items-center gap-2", v.id === activeId && "font-semibold")} data-testid="variation-option" data-variation-id={v.id} data-active={v.id === activeId}>
              <span className="min-w-0 flex-1 truncate">{v.name}</span>
              {v.id === activeId && <span className="text-[10px] text-primary">working in</span>}
            </DropdownMenuItem>
          ))}
          {list.length === 0 && <DropdownMenuItem disabled>No variations yet</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setPrompt({ kind: "new" })} data-testid="variation-new">
            <Plus className="mr-2 h-3.5 w-3.5" /> New variation…
          </DropdownMenuItem>
          {active && (
            <DropdownMenuItem onSelect={() => setPrompt({ kind: "duplicate", source: active })} data-testid="variation-duplicate">
              <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate “{active.name}”…
            </DropdownMenuItem>
          )}
          {active && (
            <DropdownMenuItem onSelect={() => setPrompt({ kind: "rename", target: active })} data-testid="variation-rename">
              <Pencil className="mr-2 h-3.5 w-3.5" /> Rename…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {prompt && (
        <VariationPrompt
          prompt={prompt}
          busy={busy}
          onClose={() => setPrompt(null)}
          onSubmit={async (name, treatmentText) => {
            try {
              if (prompt.kind === "new") {
                const doc = parseTreatmentDoc(project.data?.treatment_json);
                await create.mutateAsync({ name, treatmentText, footageConfirmedAt: doc.footageConfirmedAt, makeActive: true });
                toast.success(`“${name}” started — its storyboard is empty; the song, your footage and every asset are here already`);
              } else if (prompt.kind === "duplicate") {
                await duplicate.mutateAsync({ sourceId: prompt.source.id, name, makeActive: true });
                toast.success(`“${name}” is a copy of “${prompt.source.name}” — edit it on its own`);
              } else {
                await update.mutateAsync({ id: prompt.target.id, patch: { name } });
              }
              setPrompt(null);
            } catch (e) {
              toast.error(message(e));
            }
          }}
        />
      )}
    </div>
  );
}

function VariationPrompt({ prompt, busy, onClose, onSubmit }: { prompt: Prompt; busy: boolean; onClose: () => void; onSubmit: (name: string, treatmentText: string) => Promise<void> }) {
  const [name, setName] = useState(prompt.kind === "rename" ? prompt.target.name : prompt.kind === "duplicate" ? `${prompt.source.name} copy` : "");
  const [text, setText] = useState("");
  const title = prompt.kind === "new" ? "Start a new video variation" : prompt.kind === "duplicate" ? `Duplicate “${prompt.source.name}”` : "Rename this variation";
  const body =
    prompt.kind === "new"
      ? "A new creative direction for the same song. It shares the song, your footage, the takes' syncs and every asset in the project, and starts with an empty storyboard and no continuity entities. Nothing in the other variations changes."
      : prompt.kind === "duplicate"
        ? "Copies this variation's treatment, direction, storyboard (every shot with its edits and locks), continuity entities and the footage on each shot, as a new variation to edit on its own. Files are not copied; revision history starts fresh."
        : "The name is all that changes.";
  return (
    <Overlay>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" data-testid="variation-dialog" onClick={onClose}>
        <div className="w-full max-w-md space-y-3 rounded-2xl border border-border bg-background p-5" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs leading-relaxed text-foreground/70">{body}</p>
          <label className="block text-xs text-foreground/60">
            Name
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Interrupted Broadcast" autoFocus data-testid="variation-name" />
          </label>
          {prompt.kind === "new" && (
            <label className="block text-xs text-foreground/60">
              Treatment (optional — paste it now, or write it on the Treatment page)
              <Textarea className="mt-1 text-sm" rows={6} value={text} onChange={(e) => setText(e.target.value)} data-testid="variation-treatment" />
            </label>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void onSubmit(name.trim(), text)} disabled={busy || !name.trim()} data-testid="variation-submit">
              {prompt.kind === "new" ? "Start variation" : prompt.kind === "duplicate" ? "Duplicate" : "Rename"}
            </Button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
