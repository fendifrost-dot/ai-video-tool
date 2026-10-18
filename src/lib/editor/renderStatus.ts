export type EditRenderStatus = "planned" | "queued" | "rendering" | "complete" | "failed";

export type EditRenderRow = {
  id: string;
  status: EditRenderStatus;
  error: string | null;
  output_bucket: string | null;
  output_path: string | null;
  duration_seconds?: number | null;
  created_at: string;
};

/** Label + tone for the Export preview status chip. */
export function renderStatusChip(row: Pick<EditRenderRow, "status" | "error"> | null): {
  label: string;
  tone: "muted" | "busy" | "ok" | "bad";
} {
  if (!row) return { label: "No preview rendered yet", tone: "muted" };
  switch (row.status) {
    case "queued":
      return { label: "Queued — waiting for the render worker", tone: "busy" };
    case "rendering":
      return { label: "Rendering MP4…", tone: "busy" };
    case "complete":
      return { label: "Preview MP4 ready", tone: "ok" };
    case "failed":
      return { label: `Render failed${row.error ? `: ${row.error}` : ""}`, tone: "bad" };
    default:
      return { label: "Planned", tone: "muted" };
  }
}

export function renderIsActive(row: Pick<EditRenderRow, "status"> | null): boolean {
  return !!row && (row.status === "queued" || row.status === "rendering");
}
