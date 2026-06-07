import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, Lock, LockOpen, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { signedUrl } from "@/lib/storage";
import { toast } from "sonner";
import type { ProviderName } from "@/integrations/supabase/aliases";
import type { CompiledPrompt, FormattedPrompt } from "@/lib/prompts/types";
import {
  getProvider,
  PROVIDER_ORDER,
} from "@/lib/providers/registry";
import {
  applyCapability,
  recommendProviderForShotType,
  useProviderCapabilities,
  type ProviderCapability,
} from "@/lib/providers/capabilities";
import { ResearchDocsButton } from "./ResearchDocsButton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { GenerateButton } from "./GenerateButton";

export function PromptOutputView({
  compiled,
  initialProvider,
}: {
  compiled: CompiledPrompt | null;
  initialProvider?: ProviderName;
}) {
  const [active, setActive] = useState<ProviderName>(initialProvider ?? "runway");
  const capsQuery = useProviderCapabilities();
  const caps = capsQuery.data ?? {};

  const formattedByProvider = useMemo(() => {
    if (!compiled) return {} as Record<ProviderName, { formatted: FormattedPrompt; warnings: string[]; cap?: ProviderCapability }>;
    const map: Partial<Record<ProviderName, { formatted: FormattedPrompt; warnings: string[]; cap?: ProviderCapability }>> = {};
    for (const id of PROVIDER_ORDER) {
      const baseFormatted = getProvider(id).formatPrompt(compiled);
      const cap = caps[id];
      const { formatted, warnings } = applyCapability(baseFormatted, cap);
      map[id] = { formatted, warnings, cap };
    }
    return map as Record<ProviderName, { formatted: FormattedPrompt; warnings: string[]; cap?: ProviderCapability }>;
  }, [compiled, caps]);

  // Best provider for this shot's type — used to badge a tab as recommended.
  const recommended = useMemo(() => {
    if (!compiled) return null;
    const shotType = (compiled.settings?.shot_type as string | undefined) ?? null;
    return recommendProviderForShotType(shotType, caps, PROVIDER_ORDER);
  }, [compiled, caps]);

  if (!compiled) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Pick a template to see the compiled prompt.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <LockedReferenceBadge path={compiled.referenceImagePath} />
      <Tabs value={active} onValueChange={(v) => setActive(v as ProviderName)}>
        {/*
          Horizontal scroll instead of a fixed grid so the 7 provider tabs
          stay legible when the PromptOutputView is embedded in a narrow
          column (e.g. shot detail page). On wide screens they fit without
          scrolling.
        */}
        <div className="-mx-1 px-1 pb-1">
          <TabsList className="flex h-auto min-h-9 w-full flex-wrap justify-start gap-1">
            {PROVIDER_ORDER.map((id) => {
              const isRecommended = recommended === id;
              return (
                <TabsTrigger
                  key={id}
                  value={id}
                  className={`shrink-0 px-3 text-xs ${isRecommended ? "ring-1 ring-emerald-500/60" : ""}`}
                >
                  {isRecommended && <Sparkles className="mr-1 inline h-3 w-3 text-emerald-400" />}
                  {getProvider(id).displayName}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {PROVIDER_ORDER.map((id) => {
          const entry = formattedByProvider[id];
          if (!entry) return null;
          const { formatted, warnings, cap } = entry;
          return (
            <TabsContent key={id} value={id} className="space-y-3">
              <PromptBlock
                label="Prompt"
                value={formatted.promptText}
                providerDisplay={getProvider(id).displayName}
              />
              <div className="flex items-center justify-end gap-2">
                <ResearchDocsButton provider={id} />
                <GenerateButton
                  compiled={compiled}
                  formatted={formatted}
                  provider={id}
                  providerDisplay={getProvider(id).displayName}
                  apiReady={getProvider(id).apiReady}
                />
              </div>
              {warnings.length > 0 && <CapabilityWarnings warnings={warnings} />}
              {cap && <CapabilityHelper cap={cap} />}
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

function LockedReferenceBadge({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return;
    }
    signedUrl("artist-assets", path, 3600)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed border-border bg-card/30 p-2 text-xs text-muted-foreground">
        <LockOpen className="h-3.5 w-3.5" />
        <span>
          No locked reference — providers that support image-to-video will
          use text-only prompting. Lock an image on the artist page to attach
          a canonical reference to every prompt.
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-200">
      {url ? (
        <img
          src={url}
          alt="Locked reference"
          loading="lazy"
          className="h-8 w-8 rounded object-cover"
        />
      ) : (
        <div className="h-8 w-8 rounded bg-emerald-500/10" />
      )}
      <Lock className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        Locked reference attached: <code className="font-mono">{path.split("/").pop()}</code>
      </span>
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
      <pre className="max-h-72 min-w-0 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-card/40 p-3 font-mono text-xs leading-relaxed">
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


function CapabilityWarnings({ warnings }: { warnings: string[] }) {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
      <div className="mb-1 flex items-center gap-1 font-semibold">
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>Capability mismatch</span>
      </div>
      <ul className="ml-4 list-disc space-y-0.5">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

function CapabilityHelper({ cap }: { cap: ProviderCapability }) {
  return (
    <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
      <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2">
        <div className="mb-1 flex items-center gap-1 font-semibold text-emerald-300">
          <TrendingUp className="h-3.5 w-3.5" />
          <span>Strengths</span>
        </div>
        <ul className="ml-4 list-disc space-y-0.5 text-emerald-100/80">
          {cap.strengths.length === 0 ? (
            <li className="italic text-muted-foreground">No data</li>
          ) : (
            cap.strengths.map((s) => <li key={s}>{s.replaceAll("_", " ")}</li>)
          )}
        </ul>
      </div>
      <div className="rounded-md border border-rose-500/20 bg-rose-500/5 p-2">
        <div className="mb-1 flex items-center gap-1 font-semibold text-rose-300">
          <TrendingDown className="h-3.5 w-3.5" />
          <span>Weaknesses</span>
        </div>
        <ul className="ml-4 list-disc space-y-0.5 text-rose-100/80">
          {cap.weaknesses.length === 0 ? (
            <li className="italic text-muted-foreground">No data</li>
          ) : (
            cap.weaknesses.map((w) => <li key={w}>{w.replaceAll("_", " ")}</li>)
          )}
        </ul>
      </div>
    </div>
  );
}
