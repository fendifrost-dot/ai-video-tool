import { useState } from "react";
import { ChevronDown, ChevronRight, History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { versionAuthor, versionDiffers, versionExcerpt, versionReason, type TreatmentSnapshot, type TreatmentVersion } from "@/lib/treatment/versions";

const when = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "");
const DIFF_WORDS: Record<string, string> = { text: "the treatment text", notes: "the notes", mood: "the mood", visual: "the visual direction" };

/**
 * The treatment's earlier versions, newest first. Every treatment that was ever replaced — by a generation, an edit,
 * a delete or a restore — is here with the notes, mood and visual direction that stood beside it. A version can be
 * read in full and made current again; what is current at that moment becomes a version itself, so nothing is lost
 * by restoring.
 */
export function TreatmentVersions({
  versions,
  current,
  busy,
  onRestore,
}: {
  versions: readonly TreatmentVersion[];
  current: TreatmentSnapshot;
  busy?: boolean;
  onRestore: (version: TreatmentVersion) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (versions.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-foreground/55" data-testid="treatment-versions-empty">
        No earlier versions yet. From now on, whenever the treatment, its notes, the mood or the visual direction is replaced, what was there is kept here.
      </p>
    );
  }
  return (
    <ol className="space-y-2" data-testid="treatment-versions">
      {versions.map((v) => {
        const isOpen = open === v.id;
        const differs = versionDiffers(v, current);
        return (
          <li key={v.id} className="rounded-lg border border-border" data-testid="treatment-version" data-version-id={v.id} data-replaced-by={v.replacedBy}>
            <button type="button" className="flex w-full items-start gap-2 p-2.5 text-left" onClick={() => setOpen(isOpen ? null : v.id)} aria-expanded={isOpen} data-testid="treatment-version-open">
              {isOpen ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/45" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/45" />}
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] text-foreground/45">
                  <History className="mr-1 inline h-3 w-3" />
                  {when(v.replacedAt)} · {versionReason(v)} · {versionAuthor(v)}
                </span>
                {!isOpen && <span className="mt-0.5 block text-xs leading-snug text-foreground/75">{versionExcerpt(v) || "(empty)"}</span>}
              </span>
            </button>
            {isOpen && (
              <div className="space-y-3 border-t border-border/60 p-3" data-testid="treatment-version-body">
                {v.text.trim() ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90" data-testid="treatment-version-text">
                    {v.text}
                  </p>
                ) : (
                  <p className="text-xs text-foreground/50">This version had no treatment text.</p>
                )}
                <dl className="space-y-1.5 text-xs text-foreground/70">
                  {v.mood.trim() && (
                    <div>
                      <dt className="text-[10px] uppercase tracking-wider text-foreground/40">Mood / style</dt>
                      <dd>{v.mood}</dd>
                    </div>
                  )}
                  {v.visualStyle.trim() && (
                    <div>
                      <dt className="text-[10px] uppercase tracking-wider text-foreground/40">Visual direction</dt>
                      <dd className="whitespace-pre-wrap">{v.visualStyle}</dd>
                    </div>
                  )}
                  {v.notes.trim() && (
                    <div>
                      <dt className="text-[10px] uppercase tracking-wider text-foreground/40">Notes</dt>
                      <dd className="whitespace-pre-wrap" data-testid="treatment-version-notes">
                        {v.notes}
                      </dd>
                    </div>
                  )}
                </dl>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" disabled={busy || differs.length === 0} onClick={() => onRestore(v)} data-testid="treatment-version-restore">
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore this version
                  </Button>
                  <span className="text-[11px] text-foreground/45" data-testid="treatment-version-differs">
                    {differs.length === 0 ? "the same as what is current now" : `restoring changes ${differs.map((d) => DIFF_WORDS[d]).join(", ")}`}
                  </span>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
