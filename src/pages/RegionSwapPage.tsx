import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { signedUrl } from "@/lib/storage";
import { parseBox, parseWindow, type Box } from "@/lib/regionSwap/plan";
import { putRegionBack, regionSwapJobs, swapRegion } from "@/lib/regionSwap/submit";

// =============================================================================
// Swap in a box — swap a piece of his wardrobe inside a box of a clip that is
// already on the board (src/lib/regionSwap/plan.ts says why). Draw the box over
// the piece on the frame, send the swap, and when it is back put it into the
// box over the original clip. Everything outside the box stays the original.
// =============================================================================

type Row = Record<string, unknown>;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function RegionSwapPage(props: {
  projectId: string;
  assetId: string | null;
  box: string | null;
  window: string | null;
  pieces: string | null;
}) {
  const { projectId, assetId } = props;
  const [url, setUrl] = useState<string | null>(null);
  const [name, setName] = useState<string>("");
  const [box, setBox] = useState<Box | null>(parseBox(props.box));
  const [windowText, setWindowText] = useState(props.window ?? "");
  const [status, setStatus] = useState<string>("");
  const [result, setResult] = useState<Row | null>(null);
  const [jobs, setJobs] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const stage = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const pieceIds = (props.pieces ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  useEffect(() => {
    if (!assetId) return;
    (async () => {
      const { data } = await supabase
        .from("project_assets")
        .select("id, file_url, notes, metadata_json")
        .eq("id", assetId)
        .eq("project_id", projectId)
        .maybeSingle();
      if (!data) return setStatus("that clip is not in this project");
      const meta = ((data as Row).metadata_json ?? {}) as Row;
      setName(String((data as Row).notes ?? (data as Row).file_url).slice(0, 80));
      setUrl(await signedUrl((String(meta.bucket ?? "project-clips")) as never, String((data as Row).file_url), 3600));
    })().catch((e) => setStatus(e instanceof Error ? e.message : String(e)));
  }, [assetId, projectId]);

  const refresh = useCallback(async () => {
    if (assetId) setJobs(await regionSwapJobs(projectId, assetId));
  }, [assetId, projectId]);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 10000);
    return () => clearInterval(t);
  }, [refresh]);

  const point = (e: React.PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
  };

  const run = async (dryRun: boolean) => {
    if (!assetId || !box) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await swapRegion({ projectId, assetId, box, window: parseWindow(windowText), pieceIds, dryRun, onStage: setStatus });
      setResult({ box: r.box, rect: r.rect, cropPath: r.cropPath, ...r.answer });
      setStatus(dryRun ? "dry run: nothing was sent or spent (the crop was uploaded)" : `sent — job ${String(r.answer.jobId ?? "")}`);
      await refresh();
    } catch (e) {
      setStatus(`refused: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const putBack = async (jobId: string) => {
    setBusy(true);
    try {
      const r = await putRegionBack({ projectId, jobId, onStage: setStatus });
      setResult(r as unknown as Row);
      setStatus(`filed — on the shot unselected (${r.assetId})`);
    } catch (e) {
      setStatus(`refused: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-6">
      <PageHeader title="Swap in a box" subtitle="Draw a box over the piece to change; only the inside of the box is touched." />
      {!assetId && <p className="text-sm text-muted-foreground">Open this page from a clip (…/swap?asset=&lt;clip id&gt;).</p>}
      {assetId && (
        <div className="flex flex-wrap gap-6">
          <div
            ref={stage}
            className="relative w-[320px] select-none overflow-hidden rounded border"
            data-testid="region-swap-stage"
            onPointerDown={(e) => {
              drag.current = point(e);
              setBox(null);
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const p = point(e);
              const a = drag.current;
              setBox({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) });
            }}
            onPointerUp={() => (drag.current = null)}
          >
            {url && <video src={url} className="block w-full" controls={false} muted playsInline loop autoPlay />}
            {box && (
              <div
                className="pointer-events-none absolute border-2 border-yellow-400"
                style={{ left: pct(box.x), top: pct(box.y), width: pct(box.w), height: pct(box.h) }}
              />
            )}
          </div>
          <div className="max-w-md space-y-3 text-sm">
            <div className="text-muted-foreground">{name}</div>
            <div data-testid="region-swap-box">Box: {box ? `${box.x.toFixed(3)}, ${box.y.toFixed(3)}, ${box.w.toFixed(3)}, ${box.h.toFixed(3)}` : "drag on the clip"}</div>
            <label className="block">
              Only between (seconds, optional):{" "}
              <input className="w-28 rounded border px-1" value={windowText} placeholder="3.3,4.0" onChange={(e) => setWindowText(e.target.value)} data-testid="region-swap-window" />
            </label>
            <div>Pieces: {pieceIds.length ? pieceIds.join(", ") : "his shoes in this shot"}</div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={busy || !box} onClick={() => run(true)} data-testid="region-swap-dryrun">
                Dry run (sends nothing)
              </Button>
              <Button disabled={busy || !box} onClick={() => run(false)} data-testid="region-swap-submit">
                Swap inside the box · about $3.41
              </Button>
            </div>
            <div data-testid="region-swap-status">{status}</div>
            {result && (
              <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs" data-testid="region-swap-result">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
            <div className="space-y-1">
              <div className="font-medium">Swaps of this clip</div>
              {jobs.length === 0 && <div className="text-muted-foreground">none yet</div>}
              {jobs.map((j) => (
                <div key={String(j.id)} className="flex items-center gap-2" data-testid={`region-swap-job-${String(j.id)}`}>
                  <span>
                    {String(j.created_at).slice(0, 16).replace("T", " ")} · {String(j.status)}
                    {j.error_text ? ` · ${String(j.error_text).slice(0, 80)}` : ""}
                  </span>
                  {j.status === "succeeded" && !!j.result_asset_id && (
                    <Button size="sm" disabled={busy} onClick={() => putBack(String(j.id))} data-testid={`region-swap-putback-${String(j.id)}`}>
                      Put it back
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
