import type { ProjectAsset } from "@/integrations/supabase/aliases";
import type { DerivedMethod } from "@/lib/storyboard/media";

export type VersionKind =
  | "original"
  | "dressed"
  | "montage"
  | "composite"
  | "restaged"
  | "other";

const KIND_LABEL: Record<VersionKind, string> = {
  original: "Original take",
  dressed: "Dressed take",
  montage: "Montage",
  composite: "Composite",
  restaged: "Restaged",
  other: "Other version",
};

function methodOf(asset: ProjectAsset): DerivedMethod | null {
  const meta = (asset.metadata_json ?? {}) as Record<string, unknown>;
  const derived = meta.derivedFrom as { method?: string } | undefined;
  const m = derived?.method ?? (meta.method as string | undefined);
  if (m === "dressed" || m === "montage" || m === "composite" || m === "restaged") return m;
  return null;
}

export function versionKind(asset: ProjectAsset): VersionKind {
  const method = methodOf(asset);
  if (method) return method;
  const role = asset.footage_role ?? (asset.metadata_json as Record<string, unknown> | null)?.footage_role;
  if (role === "performance" || asset.asset_type === "reference_video") return "original";
  if (asset.asset_type === "generated_clip" || asset.asset_type === "edited_clip") return "other";
  return "other";
}

/** Strip provider/uuid noise so Fendi sees a take name, not a storage key. */
function friendlyName(raw: string): string {
  let s = raw.replace(/\.[a-z0-9]+$/i, "");
  s = s.replace(/^(generated_|edited_|clip_|take_|asset_)/i, "");
  s = s.replace(/^(higgsfield|seedance|kling|grok|fal|runway|veo|pika)_+/i, "");
  s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "");
  s = s.replace(/[0-9a-f]{16,}/gi, "");
  s = s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return s || raw.slice(0, 32);
}

export function versionLabel(asset: ProjectAsset): string {
  const kind = versionKind(asset);
  const base = KIND_LABEL[kind];
  const meta = (asset.metadata_json ?? {}) as Record<string, unknown>;
  const fromMeta =
    (typeof meta.original_filename === "string" && meta.original_filename) ||
    (typeof meta.file_name === "string" && meta.file_name) ||
    (typeof meta.label === "string" && meta.label) ||
    null;
  const fromPath = asset.file_url.split("/").pop() || null;
  const raw = (asset.notes?.trim() || fromMeta || fromPath || asset.id.slice(0, 8)).slice(0, 64);
  const name = friendlyName(raw).slice(0, 40);
  return `${base} · ${name}`;
}

export function groupVersions(assets: ProjectAsset[]): Record<VersionKind, ProjectAsset[]> {
  const out: Record<VersionKind, ProjectAsset[]> = {
    original: [],
    dressed: [],
    montage: [],
    composite: [],
    restaged: [],
    other: [],
  };
  for (const a of assets) {
    if (!a.file_url) continue;
    const mime = (a.metadata_json as Record<string, unknown> | null)?.mime_type;
    const isVideo =
      (typeof mime === "string" && mime.startsWith("video/")) ||
      /\.(mp4|mov|webm|m4v|mkv)$/i.test(a.file_url) ||
      a.asset_type === "generated_clip" ||
      a.asset_type === "edited_clip" ||
      a.asset_type === "reference_video" ||
      a.footage_role === "performance";
    if (!isVideo) continue;
    out[versionKind(a)].push(a);
  }
  return out;
}
