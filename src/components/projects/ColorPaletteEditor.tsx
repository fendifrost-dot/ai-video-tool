import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ColorPaletteEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const normalized = normalizeHex(raw);
    if (!normalized) return;
    if (value.includes(normalized)) {
      setDraft("");
      return;
    }
    onChange([...value, normalized]);
    setDraft("");
  }

  function remove(hex: string) {
    onChange(value.filter((c) => c !== hex));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {value.length === 0 && (
          <span className="text-xs text-muted-foreground">No colors yet.</span>
        )}
        {value.map((hex) => (
          <div
            key={hex}
            className="group inline-flex items-center gap-2 rounded-full border border-border bg-card pl-1 pr-2 py-1 text-xs"
          >
            <span
              className="h-5 w-5 rounded-full border border-border"
              style={{ backgroundColor: hex }}
            />
            <span className="font-mono uppercase">{hex}</span>
            <button
              type="button"
              onClick={() => remove(hex)}
              className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
              aria-label={`Remove ${hex}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="#ff7755 or 7755aa"
          className="font-mono"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => add(draft)}
          disabled={!normalizeHex(draft)}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>
    </div>
  );
}

function normalizeHex(raw: string): string | null {
  const trimmed = raw.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(trimmed)) return null;
  const expanded =
    trimmed.length === 3
      ? trimmed
          .split("")
          .map((c) => c + c)
          .join("")
      : trimmed;
  return `#${expanded.toLowerCase()}`;
}
