import { useState } from "react";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/lib/supabase";
import type { ProviderName } from "@/integrations/supabase/aliases";
import { useQueryClient } from "@tanstack/react-query";

type ResearchResult = {
  provider: string;
  summary: string;
  latest_models: string[];
  best_practice_prompt_format: string;
  recent_changes: string[];
  suggested_prompt_adjustments: string[];
  sources: { title: string; url: string }[];
  last_verified_at: string;
};

/**
 * Research-current-docs button. Calls Control Center's research-provider-docs
 * endpoint (Anthropic + WebSearch tool) and renders the result in a side
 * panel. The user can apply suggestions back to the compiled prompt — wiring
 * for "Apply suggestions" lives in PromptOutputView and is review-then-accept.
 */
export function ResearchDocsButton({ provider }: { provider: ProviderName }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const qc = useQueryClient();

  async function research() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean;
        result?: ResearchResult;
        errorMessage?: string;
      }>("proxy-provider-call", {
        body: {
          endpoint: "research-provider-docs",
          method: "POST",
          body: { provider },
        },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok || !data.result) throw new Error(data?.errorMessage ?? "Empty result");
      setResult(data.result);
      // Capability cache may have been updated by the function — refetch.
      qc.invalidateQueries({ queryKey: ["provider_capabilities"] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Research failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  function handleClick() {
    setOpen(true);
    if (!result && !loading) {
      void research();
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        className="h-7 text-xs"
      >
        <RefreshCw className="mr-1 h-3 w-3" />
        Research current docs
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[480px] overflow-y-auto sm:max-w-[480px]">
          <SheetHeader>
            <SheetTitle>Current docs — {provider}</SheetTitle>
            <SheetDescription>
              Fresh look at {provider}'s API and prompt guidance using
              Anthropic + WebSearch.
            </SheetDescription>
          </SheetHeader>

          {loading && (
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching the web…
            </div>
          )}

          {!loading && result && (
            <div className="mt-6 space-y-4 text-sm">
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Summary
                </h3>
                <p className="mt-1 whitespace-pre-wrap">{result.summary}</p>
              </section>

              {result.latest_models.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Latest models
                  </h3>
                  <ul className="ml-4 mt-1 list-disc">
                    {result.latest_models.map((m) => (
                      <li key={m} className="font-mono text-xs">
                        {m}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Best-practice prompt format
                </h3>
                <p className="mt-1 whitespace-pre-wrap">
                  {result.best_practice_prompt_format}
                </p>
              </section>

              {result.recent_changes.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Recent changes
                  </h3>
                  <ul className="ml-4 mt-1 list-disc">
                    {result.recent_changes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </section>
              )}

              {result.suggested_prompt_adjustments.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Suggested adjustments
                  </h3>
                  <ul className="ml-4 mt-1 list-disc">
                    {result.suggested_prompt_adjustments.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Suggestions are review-only — copy them into your shot
                    description or settings if you want to apply them.
                  </p>
                </section>
              )}

              {result.sources.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Sources
                  </h3>
                  <ul className="ml-4 mt-1 list-disc">
                    {result.sources.map((src) => (
                      <li key={src.url}>
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 underline"
                        >
                          {src.title}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <p className="text-xs text-muted-foreground">
                Verified {new Date(result.last_verified_at).toLocaleString()}.
              </p>

              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void research()}
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Refresh
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
