import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usd, type BatchShot, type Plan, type ShotState } from "@/lib/worldBatch";

/**
 * The Runs page, presentational. A shot list (the shots.json dialect) → what each shot needs, what a press of Run would
 * spend, and where each job stands. Every effect arrives as a prop; the behaviours worth holding are that nothing is
 * submitted without a second deliberate click that names the amount, and that a shot shows exactly why it is not ready.
 */
export type BatchRowView = {
  shot: BatchShot;
  state: ShotState;
  estimateUsd: number;
  selected: boolean;
  resultUrl: string | null;
  storedPath: string | null;
  /** Signed links to the stills this shot generated or was given: the picked one first, then the other candidates. */
  stillUrls: string[];
  note: string | null;
  busy: string | null;
};

export type BatchRunViewProps = {
  runId: string;
  onRunId: (v: string) => void;
  lookPresetId: string;
  lookPresetIds: string[];
  onLookPreset: (v: string) => void;
  ceilingUsd: number;
  onCeiling: (v: number) => void;
  shotsText: string;
  onShotsText: (v: string) => void;
  onLoad: () => void;
  onLoadFile: (file: File) => void;
  onFromStoryboard?: () => void;
  parseErrors: string[];
  rows: BatchRowView[];
  plan: Plan;
  running: boolean;
  log: string[];
  spentUsd: number;
  onToggle: (shotId: string) => void;
  onAttachSource: (shotId: string, file: File) => void;
  onAttachStill: (shotId: string, file: File) => void;
  onMarkFailed: (shotId: string) => void;
  onRun: () => void;
};

const STATE_LABEL: Record<ShotState["state"], string> = {
  ready: "ready",
  blocked: "not ready",
  unreconciled: "unreconciled",
  running: "running",
  succeeded: "done",
  failed: "failed",
};

export function BatchRunView(p: BatchRunViewProps) {
  const [confirming, setConfirming] = useState(false);
  const over = p.plan.estimateUsd > p.ceilingUsd;
  const nothing = p.plan.submit.length === 0;

  return (
    <div className="space-y-6" data-testid="batch-run">
      <section className="glass rounded-2xl px-6 py-5">
        <h2 className="font-display text-lg font-semibold tracking-tight">Shot list</h2>
        <p className="mt-1 text-sm text-foreground/60">
          The same list the batch scripts run (<code>shots.json</code>). Paste one, load a file, or compile the storyboard's
          world shots. Nothing is submitted until you press Run and confirm the amount.
        </p>
        <textarea
          aria-label="Shot list JSON"
          data-testid="shots-text"
          className="mt-3 h-36 w-full rounded-md border border-border bg-background/60 p-3 font-mono text-xs"
          value={p.shotsText}
          placeholder='[{"id": "H1_tailor", "kind": "world", "route": "still_kling", "prompt": "…", "motion": "…"}]'
          onChange={(e) => p.onShotsText(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={p.onLoad} data-testid="load-shots">
            Load
          </Button>
          <label className="inline-flex cursor-pointer items-center rounded-md border border-border px-3 py-1.5 text-sm">
            Load a file
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              data-testid="shots-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) p.onLoadFile(f);
                e.target.value = "";
              }}
            />
          </label>
          {p.onFromStoryboard && (
            <Button size="sm" variant="outline" onClick={p.onFromStoryboard} data-testid="from-storyboard">
              Compile from the storyboard
            </Button>
          )}
        </div>
        {p.parseErrors.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-destructive" role="alert" data-testid="parse-errors">
            {p.parseErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass rounded-2xl px-6 py-5">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="run-id" className="text-xs uppercase tracking-wider text-muted-foreground">
              Run
            </label>
            <Input id="run-id" value={p.runId} onChange={(e) => p.onRunId(e.target.value)} className="w-52" />
          </div>
          <div>
            <label htmlFor="look-preset" className="text-xs uppercase tracking-wider text-muted-foreground">
              Look
            </label>
            <select
              id="look-preset"
              value={p.lookPresetId}
              onChange={(e) => p.onLookPreset(e.target.value)}
              className="block h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              {p.lookPresetIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ceiling" className="text-xs uppercase tracking-wider text-muted-foreground">
              Ceiling for one press of Run (USD)
            </label>
            <Input
              id="ceiling"
              type="number"
              min={0}
              step={1}
              value={p.ceilingUsd}
              onChange={(e) => p.onCeiling(Math.max(0, Number(e.target.value) || 0))}
              className="w-32"
            />
          </div>
          <p className="ml-auto text-sm text-foreground/60" data-testid="spent">
            This run so far: {usd(p.spentUsd)} at list rates
          </p>
        </div>

        {p.rows.length === 0 ? (
          <p className="mt-5 text-sm text-foreground/60">No shots loaded.</p>
        ) : (
          <ul className="mt-5 divide-y divide-border" data-testid="shot-rows">
            {p.rows.map((r) => {
              const s = r.state;
              const needsSource = r.shot.route === "seedance_ref";
              const takesStill = r.shot.route.startsWith("still") || needsSource;
              return (
                <li key={r.shot.id} className="py-3" data-testid="shot-row" data-shot-id={r.shot.id} data-state={s.state}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <input
                      type="checkbox"
                      aria-label={`Include ${r.shot.id}`}
                      checked={r.selected}
                      onChange={() => p.onToggle(r.shot.id)}
                      data-testid="shot-include"
                    />
                    <span className="font-mono text-sm">{r.shot.id}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {r.shot.route}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                        s.state === "succeeded"
                          ? "bg-primary/15 text-primary"
                          : s.state === "failed" || s.state === "unreconciled"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-muted text-muted-foreground"
                      }`}
                      data-testid="shot-state"
                    >
                      {STATE_LABEL[s.state]}
                    </span>
                    <span className="text-sm text-foreground/60">{usd(r.estimateUsd)}</span>
                    {r.busy && <span className="text-xs text-foreground/60">{r.busy}</span>}
                    <span className="ml-auto flex flex-wrap items-center gap-2">
                      {needsSource && (
                        <label className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs">
                          {r.shot.source_path ? "Replace source clip" : "Attach source clip"}
                          <input
                            type="file"
                            accept="video/*"
                            className="sr-only"
                            data-testid="attach-source"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) p.onAttachSource(r.shot.id, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                      {takesStill && (
                        <label className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs">
                          {r.shot.still_path ? "Replace still" : "Attach still"}
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            data-testid="attach-still"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) p.onAttachStill(r.shot.id, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                      {s.state === "unreconciled" && (
                        <Button size="sm" variant="outline" onClick={() => p.onMarkFailed(r.shot.id)} data-testid="mark-failed">
                          I checked the provider — mark failed
                        </Button>
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-foreground/60">
                    {r.shot.route === "seedance_ref" ? r.shot.angle : r.shot.prompt || r.shot.motion}
                  </p>
                  {s.state === "blocked" && (
                    <p className="mt-1 text-xs text-destructive" data-testid="shot-blocked">
                      {s.reason}
                    </p>
                  )}
                  {s.state === "failed" && s.job.error_text && (
                    <p className="mt-1 text-xs text-destructive" data-testid="shot-error">
                      {s.job.error_text}
                    </p>
                  )}
                  {s.state === "unreconciled" && (
                    <p className="mt-1 text-xs text-destructive">
                      A submit was recorded but never reported back. The provider may have accepted and billed it. Check
                      the provider before submitting this shot again.
                    </p>
                  )}
                  {(r.resultUrl || r.storedPath || r.note || r.stillUrls.length > 0) && (
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs">
                      {r.stillUrls.map((u, i) => (
                        <a key={u} href={u} target="_blank" rel="noreferrer" className="text-primary underline" data-testid="still-url">
                          {i === 0 ? "Still" : `Candidate ${i + 1}`}
                        </a>
                      ))}
                      {r.resultUrl && (
                        <a href={r.resultUrl} target="_blank" rel="noreferrer" className="text-primary underline" data-testid="result-url">
                          Result clip
                        </a>
                      )}
                      {r.storedPath && (
                        <span className="text-foreground/60" data-testid="stored-path">
                          saved: {r.storedPath}
                        </span>
                      )}
                      {r.note && <span className="text-foreground/60">{r.note}</span>}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <p className="text-sm" data-testid="plan-summary">
            {nothing
              ? "Nothing to submit."
              : `${p.plan.submit.length} to submit · estimate ${usd(p.plan.estimateUsd)} · ceiling ${usd(p.ceilingUsd)}`}
          </p>
          {over && !nothing && (
            <p className="text-sm text-destructive" role="alert">
              The estimate is above the ceiling. Raise the ceiling or untick shots.
            </p>
          )}
          <span className="ml-auto flex items-center gap-2">
            {confirming ? (
              <>
                <Button
                  variant="destructive"
                  disabled={p.running || nothing || over}
                  onClick={() => {
                    setConfirming(false);
                    p.onRun();
                  }}
                  data-testid="confirm-run"
                >
                  Spend up to {usd(p.plan.estimateUsd)} — submit {p.plan.submit.length}
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button disabled={p.running || nothing || over} onClick={() => setConfirming(true)} data-testid="run">
                {p.running ? "Submitting…" : "Run"}
              </Button>
            )}
          </span>
        </div>
      </section>

      {p.log.length > 0 && (
        <section className="glass rounded-2xl px-6 py-5">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">Log</h2>
          <ul className="mt-2 space-y-1 font-mono text-xs" data-testid="run-log">
            {p.log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
