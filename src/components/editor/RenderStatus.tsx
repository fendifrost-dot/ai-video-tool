import { Download } from "lucide-react";
import { renderStatusChip, type EditRenderRow } from "@/lib/editor/renderStatus";
import { cn } from "@/lib/utils";

export function RenderStatus({ row, url }: { row: EditRenderRow | null; url: string | null }) {
  const chip = renderStatusChip(row);
  return (
    <div className="space-y-2" data-testid="edit-render-status" data-status={row?.status ?? "none"}>
      <span
        className={cn(
          "inline-block rounded-full border px-2 py-0.5 text-xs",
          chip.tone === "ok" && "border-emerald-500/50 text-emerald-300",
          chip.tone === "busy" && "border-sky-500/50 text-sky-300",
          chip.tone === "bad" && "border-red-500/50 text-red-300",
          chip.tone === "muted" && "border-border text-muted-foreground",
        )}
      >
        {chip.label}
      </span>
      {row?.status === "complete" && url && (
        <div className="space-y-1">
          <video
            src={url}
            controls
            playsInline
            className="max-h-80 rounded-lg border border-border"
            data-testid="edit-render-video"
          />
          <a
            href={url}
            download
            className="inline-flex items-center gap-1 text-xs underline"
            data-testid="edit-render-download"
          >
            <Download className="h-3 w-3" /> Download MP4
          </a>
        </div>
      )}
    </div>
  );
}
