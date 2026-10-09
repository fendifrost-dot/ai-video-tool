import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Eye, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { takeRangeForBox, isUsableSync, type AssignmentRole, type MediaAsset } from "@/lib/storyboard/media";
import { useTakeSyncs } from "@/lib/queries/storyboard";
import { ROLE_LABEL, ROLE_STYLE, mediaLabel } from "./BoxMediaView";
import { RangeVideo } from "./RangeVideo";
import { mediaRefKey, playbackRef, signRefs } from "./signedUrls";
import { Overlay } from "./Overlay";
import { useStoryboard } from "./useStoryboardController";

const TABS: { id: AssignmentRole | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "performance", label: "Your takes" },
  { id: "b_roll", label: "Your B-roll" },
  { id: "generated_clip", label: "AI clips" },
  { id: "generated_image", label: "AI images" },
  { id: "reference", label: "References" },
];

const PAGE = 40;

/**
 * Everything in the project that can go on a shot. Putting a file on a shot adds a row that points at the file;
 * the file itself is not copied, and the same file can sit on as many shots as the director likes.
 */
export function MediaPicker() {
  const sb = useStoryboard();
  const box = sb.boxes.find((b) => b.id === sb.pickerFor) ?? null;
  const syncs = useTakeSyncs(sb.projectId).data ?? [];
  const [tab, setTab] = useState<AssignmentRole | "all">("all");
  const [shown, setShown] = useState(PAGE);
  const [preview, setPreview] = useState<{ asset: MediaAsset; url: string } | null>(null);

  useEffect(() => {
    setPreview(null);
    setShown(PAGE);
  }, [sb.pickerFor, tab]);

  const onBox = useMemo(() => new Set(box ? sb.mediaOf(box.id).items.filter((i) => !i.base).map((i) => `${i.asset.id}:${i.role}`) : []), [box, sb]);
  const rows = useMemo(() => sb.library.filter((x) => tab === "all" || x.role === tab), [sb.library, tab]);

  if (!box) return null;
  const number = sb.numberOf(box.id);

  const open = async (asset: MediaAsset) => {
    const ref = playbackRef(asset);
    const signed = await signRefs([ref]);
    const url = signed[mediaRefKey(ref)];
    if (url) setPreview({ asset, url });
  };

  /** A take is previewed at the range this shot would play. */
  const rangeOf = (asset: MediaAsset): { start: number; end: number | null } => {
    const sync = syncs.find((s) => s.performanceAssetId === asset.id && isUsableSync(s));
    const r = sync ? takeRangeForBox(box, sync, asset.durationSeconds) : null;
    return r ? { start: r.start, end: r.end } : { start: 0, end: asset.durationSeconds ? Math.min(asset.durationSeconds, box.end - box.start) : null };
  };

  return (
    <Overlay>
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 md:items-center md:p-6" data-testid="media-picker" onClick={() => sb.openPicker(null)}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-background md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Footage for shot {number}</h2>
          <button type="button" onClick={() => sb.openPicker(null)} aria-label="Close" className="rounded p-1 text-foreground/60 hover:bg-white/5" data-testid="media-picker-close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2">
          {TABS.map((t) => {
            const n = t.id === "all" ? sb.library.length : sb.library.filter((x) => x.role === t.id).length;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn("shrink-0 rounded-lg px-2.5 py-1 text-xs", tab === t.id ? "glass-raised text-foreground" : "text-foreground/55 hover:text-foreground")}
                data-testid={`media-tab-${t.id}`}
              >
                {t.label} <span className="text-foreground/35">{n}</span>
              </button>
            );
          })}
        </div>

        {preview && (
          <div className="relative aspect-video w-full shrink-0 bg-black">
            {preview.asset.isVideo ? (
              <RangeVideo src={preview.url} {...rangeOf(preview.asset)} autoPlay showControls posterKey={mediaRefKey(playbackRef(preview.asset))} />
            ) : (
              <img src={preview.url} alt="" className="absolute inset-0 h-full w-full object-contain" />
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-foreground/50">
              Nothing of this kind in the project yet.{" "}
              <Link to="/projects/$id/setup" params={{ id: sb.projectId }} className="underline">
                Upload footage in Setup
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-border/50">
              {rows.slice(0, shown).map(({ asset, role }) => {
                const already = onBox.has(`${asset.id}:${role}`);
                return (
                  <li key={asset.id} className="flex items-center gap-2 px-4 py-2" data-testid="media-row" data-asset-id={asset.id} data-role={role}>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", ROLE_STYLE[role])}>{mediaLabel({ role, base: false, asset })}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-foreground/85">{asset.name}</span>
                      <span className="block text-[10px] text-foreground/40">
                        {asset.isVideo ? "video" : "image"}
                        {asset.durationSeconds ? ` · ${asset.durationSeconds.toFixed(1)} s` : ""} · {asset.createdAt.slice(0, 10)}
                      </span>
                    </span>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => void open(asset)} data-testid="media-row-preview">
                      <Eye className="mr-1 h-3 w-3" /> View
                    </Button>
                    <Button
                      size="sm"
                      variant={already ? "ghost" : "outline"}
                      className="h-7 px-2 text-[11px]"
                      disabled={already}
                      onClick={() => void sb.assign(box, asset, role)}
                      data-testid="media-row-assign"
                    >
                      {already ? <Check className="mr-1 h-3 w-3" /> : <Plus className="mr-1 h-3 w-3" />}
                      {already ? "On this shot" : "Put on this shot"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {rows.length > shown && (
            <div className="p-3 text-center">
              <Button size="sm" variant="ghost" className="text-[11px]" onClick={() => setShown((n) => n + PAGE)}>
                Show more ({rows.length - shown} left)
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
    </Overlay>
  );
}
