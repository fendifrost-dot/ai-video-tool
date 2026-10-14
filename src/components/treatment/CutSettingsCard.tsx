import { useEffect, useMemo, useState } from "react";
import { Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SongAnalysis } from "@/lib/songAnalysis/types";
import { buildClipGrid, gridSummary, type GridLyricLine } from "@/lib/treatment/grid";
import { DEFAULT_CUT, gridPaceOptions, parseCutSettings, type CutSettings } from "@/lib/treatment/cutSettings";

type Props = {
  treatmentJson: unknown;
  analysis: SongAnalysis | null | undefined;
  lyricLines?: readonly GridLyricLine[] | null;
  busy?: boolean;
  onSave: (cut: CutSettings) => Promise<void> | void;
};

const FIELDS = [
  { key: "high", label: "High energy" },
  { key: "mid", label: "Mid" },
  { key: "low", label: "Low energy" },
] as const;

/**
 * Pace and shot lengths for this board: what a first write and "Re-cut fast-paced" cut with. Shown with what the song
 * would be cut into, so the director can tune it before spending anything. Saving moves no shot already on the board.
 */
export function CutSettingsCard({ treatmentJson, analysis, lyricLines, busy, onSave }: Props) {
  const saved = useMemo(() => parseCutSettings(treatmentJson), [treatmentJson]);
  const [cut, setCut] = useState<CutSettings>(saved);
  useEffect(() => setCut(saved), [saved]);
  const dirty = JSON.stringify(cut) !== JSON.stringify(saved);
  const preview = useMemo(() => {
    if (!analysis) return null;
    const g = buildClipGrid({ analysis, lyrics: lyricLines ?? null, ...gridPaceOptions(cut) });
    return g.length ? gridSummary(g) : null;
  }, [analysis, lyricLines, cut]);

  const setTarget = (k: "high" | "mid" | "low", raw: string) => {
    const v = Number(raw);
    setCut((c) => ({ ...c, targets: { ...c.targets, [k]: v, ...(k === "high" ? { drop: v } : {}) } }));
  };

  return (
    <div className="space-y-2 rounded-md border p-3" data-testid="cut-settings">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Scissors className="h-3.5 w-3.5" /> Pace and clip lengths
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={cut.pace === "fast" ? "default" : "outline"} onClick={() => setCut((c) => ({ ...c, pace: "fast" }))} data-testid="cut-pace-fast">
          Fast cut
        </Button>
        <Button size="sm" variant={cut.pace === "cinematic" ? "default" : "outline"} onClick={() => setCut((c) => ({ ...c, pace: "cinematic" }))} data-testid="cut-pace-cinematic">
          Cinematic (3–5 s)
        </Button>
      </div>
      {cut.pace === "fast" && (
        <div className="flex flex-wrap items-end gap-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="text-xs text-muted-foreground">
              {f.label} (s)
              <Input
                type="number"
                min={0.5}
                max={8}
                step={0.25}
                className="mt-1 h-8 w-24"
                value={cut.targets[f.key]}
                onChange={(e) => setTarget(f.key, e.target.value)}
                data-testid={`cut-target-${f.key}`}
              />
            </label>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setCut(DEFAULT_CUT)}>
            Reset
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Every cut lands on the song's beat. {preview ? `This song would be cut into ${preview}.` : "Analyse the song to see how it would be cut."} Saving changes how new boards and re-cuts are cut; shots already on this board stay where they are.
      </p>
      <Button size="sm" onClick={() => onSave(parseCutSettings({ cut }))} disabled={!dirty || busy} data-testid="cut-save">
        Save pace
      </Button>
    </div>
  );
}
