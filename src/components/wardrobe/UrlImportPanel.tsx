import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * URL-paste panel for importing a reference image. Generic — used by the
 * Wardrobe tab and the Library pages. The parent passes an `onSubmit` that
 * runs the actual fetch+insert mutation and resolves when done.
 */
export function UrlImportPanel({
  label = "Paste image URL",
  placeholder = "https://example.com/image.jpg",
  onSubmit,
  showName = false,
  showTags = false,
  initialName = "",
  submitLabel = "Import",
  helpText,
}: {
  label?: string;
  placeholder?: string;
  onSubmit: (input: { url: string; name?: string; tagsCsv?: string }) => Promise<void>;
  showName?: boolean;
  showTags?: boolean;
  initialName?: string;
  submitLabel?: string;
  helpText?: string;
}) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState(initialName);
  const [tagsCsv, setTagsCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!url.trim()) {
      setError("URL required");
      return;
    }
    if (showName && !name.trim()) {
      setError("Name required");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        url: url.trim(),
        name: showName ? name.trim() : undefined,
        tagsCsv: showTags ? tagsCsv.trim() : undefined,
      });
      setUrl("");
      setName("");
      setTagsCsv("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/10 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Link2 className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      {helpText && <p className="text-[11px] text-muted-foreground">{helpText}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={placeholder}
          className="min-w-[260px] flex-1"
          disabled={busy}
        />
        {showName && (
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. YSL leather jacket)"
            className="min-w-[200px] flex-1"
            disabled={busy}
          />
        )}
        {showTags && (
          <Input
            type="text"
            value={tagsCsv}
            onChange={(e) => setTagsCsv(e.target.value)}
            placeholder="Tags (comma-separated)"
            className="min-w-[180px] flex-1"
            disabled={busy}
          />
        )}
        <Button type="button" onClick={handleSubmit} disabled={busy}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function parseTagsCsv(input?: string): string[] {
  if (!input) return [];
  return input
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
