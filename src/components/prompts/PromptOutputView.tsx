import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import type { ProviderName } from "@/integrations/supabase/types";
import type { CompiledPrompt, FormattedPrompt } from "@/lib/prompts/types";
import {
  getProvider,
  PROVIDER_ORDER,
} from "@/lib/providers/registry";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export function PromptOutputView({
  compiled,
  initialProvider,
}: {
  compiled: CompiledPrompt | null;
  initialProvider?: ProviderName;
}) {
  const [active, setActive] = useState<ProviderName>(initialProvider ?? "runway");

  const formattedByProvider = useMemo(() => {
    if (!compiled) return {} as Record<ProviderName, FormattedPrompt>;
    const map: Partial<Record<ProviderName, FormattedPrompt>> = {};
    for (const id of PROVIDER_ORDER) {
      map[id] = getProvider(id).formatPrompt(compiled);
    }
    return map as Record<ProviderName, FormattedPrompt>;
  }, [compiled]);

  if (!compiled) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Pick a template to see the compiled prompt.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Tabs value={active} onValueChange={(v) => setActive(v as ProviderName)}>
        <TabsList className="grid grid-cols-7">
          {PROVIDER_ORDER.map((id) => (
            <TabsTrigger key={id} value={id} className="text-xs">
              {getProvider(id).displayName}
            </TabsTrigger>
          ))}
        </TabsList>

        {PROVIDER_ORDER.map((id) => {
          const formatted = formattedByProvider[id];
          if (!formatted) return null;
          return (
            <TabsContent key={id} value={id} className="space-y-3">
              <PromptBlock
                label="Prompt"
                value={formatted.promptText}
                providerDisplay={getProvider(id).displayName}
              />
              {formatted.negativePrompt && (
                <PromptBlock
                  label="Negative prompt"
                  value={formatted.negativePrompt}
                  providerDisplay={getProvider(id).displayName}
                />
              )}
              <SettingsBlock settings={formatted.settings} />
            </TabsContent>
          );
        })}
      </Tabs>

      {compiled.unfilledPlaceholders.length > 0 && (
        <UnfilledWarning placeholders={compiled.unfilledPlaceholders} />
      )}
    </div>
  );
}

function PromptBlock({
  label,
  value,
  providerDisplay,
}: {
  label: string;
  value: string;
  providerDisplay: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`Copied ${label.toLowerCase()} for ${providerDisplay}`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't access clipboard");
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="h-7 text-xs"
        >
          {copied ? (
            <>
              <Check className="mr-1 h-3 w-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="mr-1 h-3 w-3" />
              Copy
            </>
          )}
        </Button>
      </div>
      <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-card/40 p-3 font-mono text-xs leading-relaxed">
        {value || <span className="italic text-muted-foreground">(empty)</span>}
      </pre>
    </div>
  );
}

function SettingsBlock({ settings }: { settings: Record<string, unknown> }) {
  const entries = Object.entries(settings);
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Settings
      </span>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([k, v]) => (
          <span
            key={k}
            className="rounded-md border border-border bg-card/40 px-2 py-1 font-mono text-[10px]"
          >
            <span className="text-muted-foreground">{k}:</span>{" "}
            <span>{formatSettingValue(v)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function formatSettingValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  return JSON.stringify(v);
}

function UnfilledWarning({ placeholders }: { placeholders: string[] }) {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
      <p className="font-semibold">Missing values:</p>
      <p className="mt-0.5 font-mono">{placeholders.join(", ")}</p>
      <p className="mt-1 text-amber-300/80">
        Fill these on the artist/shot, override below, or accept the blanks and edit after copying.
      </p>
    </div>
  );
}
