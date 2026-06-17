import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIT_FIELDS = [
  { key: "fit", label: "Fit", placeholder: "oversized, slim, regular…" },
  { key: "silhouette", label: "Silhouette", placeholder: "varsity, bomber, wide-leg…" },
  { key: "hem_length", label: "Hem length", placeholder: "below waist, mid-thigh…" },
  { key: "sleeve_length", label: "Sleeve length", placeholder: "full, short, 3/4…" },
  { key: "closure", label: "Closure", placeholder: "snap, zip, button…" },
  { key: "fabric_weight", label: "Fabric weight", placeholder: "heavy, mid, lightweight…" },
  { key: "layering_type", label: "Layering", placeholder: "outerwear, base layer…" },
] as const;

export function FitProfileEditor({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      {FIT_FIELDS.map((field) => (
        <div key={field.key} className="space-y-1">
          <Label className="text-xs">{field.label}</Label>
          <Input
            value={typeof value[field.key] === "string" ? (value[field.key] as string) : ""}
            onChange={(e) =>
              onChange({
                ...value,
                [field.key]: e.target.value.trim() || undefined,
              })
            }
            placeholder={field.placeholder}
            disabled={disabled}
            className="h-8 text-xs"
          />
        </div>
      ))}
    </div>
  );
}

export function FitProfileSummary({ value }: { value: Record<string, unknown> }) {
  const entries = FIT_FIELDS.filter(
    (f) => typeof value[f.key] === "string" && (value[f.key] as string).trim(),
  );
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">No fit profile set.</p>;
  }
  return (
    <dl className="space-y-1 text-xs">
      {entries.map((f) => (
        <div key={f.key} className="flex gap-2">
          <dt className="text-muted-foreground">{f.label}:</dt>
          <dd>{String(value[f.key])}</dd>
        </div>
      ))}
    </dl>
  );
}
