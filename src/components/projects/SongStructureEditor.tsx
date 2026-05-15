import { Plus, Trash2 } from "lucide-react";
import {
  SONG_SECTION_PRESETS,
  type SongSection,
} from "@/lib/queries/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SongStructureEditor({
  value,
  onChange,
}: {
  value: SongSection[];
  onChange: (next: SongSection[]) => void;
}) {
  function update(index: number, patch: Partial<SongSection>) {
    const next = value.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange(next);
  }

  function add() {
    const lastEnd = value.length > 0 ? value[value.length - 1].end_seconds ?? 0 : 0;
    onChange([
      ...value,
      {
        name: nextPreset(value),
        start_seconds: lastEnd,
        end_seconds: lastEnd ? lastEnd + 16 : null,
        bars: null,
      },
    ]);
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No sections yet. Add intro / verse / hook / bridge / outro etc.
        </p>
      )}

      {value.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <div className="col-span-4">Name</div>
            <div className="col-span-3">Start (s)</div>
            <div className="col-span-3">End (s)</div>
            <div className="col-span-1">Bars</div>
            <div className="col-span-1" />
          </div>
          {value.map((section, i) => (
            <div
              key={i}
              className="grid grid-cols-12 items-center gap-2 rounded-md border border-border bg-card/30 p-2"
            >
              <Input
                className="col-span-4 font-mono text-sm"
                list="section-presets"
                value={section.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="verse_1"
              />
              <Input
                className="col-span-3 font-mono text-sm"
                type="number"
                inputMode="decimal"
                step="0.1"
                value={section.start_seconds ?? ""}
                onChange={(e) =>
                  update(i, {
                    start_seconds:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
              <Input
                className="col-span-3 font-mono text-sm"
                type="number"
                inputMode="decimal"
                step="0.1"
                value={section.end_seconds ?? ""}
                onChange={(e) =>
                  update(i, {
                    end_seconds:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
              <Input
                className="col-span-1 font-mono text-sm"
                type="number"
                inputMode="numeric"
                value={section.bars ?? ""}
                onChange={(e) =>
                  update(i, {
                    bars: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="col-span-1 inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                aria-label="Remove section"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <datalist id="section-presets">
        {SONG_SECTION_PRESETS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-muted-foreground">
          Section names become the <code className="font-mono">song_section</code> values on shots.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add section
        </Button>
      </div>
    </div>
  );
}

function nextPreset(existing: SongSection[]): string {
  const taken = new Set(existing.map((s) => s.name));
  for (const p of SONG_SECTION_PRESETS) {
    if (!taken.has(p)) return p;
  }
  return "section";
}
