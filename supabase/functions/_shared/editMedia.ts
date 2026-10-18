// Resolve an edit sequence onto files already in this project's storage.
// Pure aside from the signer the caller passes in. No provider calls, no ffmpeg.
//
// Lovable bundles each function with this folder only, so the cut model and this resolver both live here.
// The app imports them through the edit-render barrel. A picture clip with a stored file is a real input
// even when it is still marked lip-sync pending. A pending clip with no file stays a labelled slate.

import {
  durationSeconds,
  planRender,
  videoClips,
  type EditSequence,
  type RenderAspect,
  type RenderKind,
  type RenderMediaGap,
  type RenderMediaItem,
  type RenderMediaReport,
  type RenderPlan,
} from "./editModel.ts";

export const EDIT_MEDIA_BUCKETS = [
  "project-clips",
  "project-audio",
  "project-exports",
  "project-references",
] as const;

export const STORAGE_HOST = "qoyxgnkvjukovkrvdaiq.supabase.co";
export const SIGN_TTL_SECONDS = 2 * 60 * 60;
const MAX_SIGN_BATCH = 50;

export type StoredAsset = {
  id: string;
  project_id: string;
  asset_type: string | null;
  file_url: string | null;
  metadata_json: unknown;
};

export type MediaResolution = {
  pictures: RenderMediaItem[];
  song: RenderMediaItem | null;
  missing: RenderMediaGap[];
  slate: RenderMediaGap[];
};

/** Seedance files are filed as 4 seconds or as 97/24. Neither number was measured with ffprobe. */
export function isFiledDefaultDuration(seconds: number | null | undefined): boolean {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return false;
  return Math.abs(seconds - 4) < 1e-3 || Math.abs(seconds - 97 / 24) < 1e-3;
}

/** A stored length the planner may clamp to. The 4.04 s filing default is not one. */
export function trustedDuration(seconds: number | null | undefined): number | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (isFiledDefaultDuration(seconds)) return null;
  return seconds;
}

export function mediaToken(assetId: string, role: "picture" | "song"): string {
  return role === "song" ? `avt-song/${assetId}.bin` : `avt-media/${assetId}.bin`;
}

/**
 * A download URL the local encoder is allowed to fetch: https on this project's storage host,
 * a sign URL, and one of the project media buckets. Query tokens are not inspected.
 */
export function storageSignUrlOk(input: string): boolean {
  if (
    /(^|\/)\.\.(\/|$)/.test(input) ||
    input.toLowerCase().includes("%2e%2e") ||
    input.includes("\\")
  )
    return false;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.hostname !== STORAGE_HOST) return false;
  const parts = url.pathname.split("/");
  if (parts.length < 7) return false;
  if (parts[1] !== "storage" || parts[2] !== "v1" || parts[3] !== "object" || parts[4] !== "sign")
    return false;
  if (!(EDIT_MEDIA_BUCKETS as readonly string[]).includes(parts[5] ?? "")) return false;
  return parts.slice(6).every((part) => part !== "" && part !== "." && part !== "..");
}

export function bucketOfStoredAsset(
  asset: Pick<StoredAsset, "asset_type" | "metadata_json">,
): string {
  const meta = (asset.metadata_json ?? {}) as { bucket?: unknown };
  if (typeof meta.bucket === "string" && meta.bucket.trim()) return meta.bucket.trim();
  if (asset.asset_type === "audio") return "project-audio";
  switch (asset.asset_type) {
    case "reference_image":
    case "reference_video":
    case "lyrics_doc":
      return "project-references";
    case "ae_asset":
    case "premiere_export":
      return "project-exports";
    default:
      return "project-clips";
  }
}

export function assetsFromRows(rows: readonly Record<string, unknown>[]): StoredAsset[] {
  const out: StoredAsset[] = [];
  for (const row of rows) {
    if (typeof row.id !== "string" || typeof row.project_id !== "string") continue;
    out.push({
      id: row.id,
      project_id: row.project_id,
      asset_type: typeof row.asset_type === "string" ? row.asset_type : null,
      file_url: typeof row.file_url === "string" ? row.file_url : null,
      metadata_json: row.metadata_json ?? null,
    });
  }
  return out;
}

export function assetIdsOf(seq: EditSequence): string[] {
  const ids = new Set<string>();
  for (const clip of videoClips(seq)) if (clip.assetId) ids.add(clip.assetId);
  if (seq.songAssetId) ids.add(seq.songAssetId);
  return [...ids];
}

function metaDuration(asset: StoredAsset): number | null {
  const meta = (asset.metadata_json ?? {}) as { duration_seconds?: unknown };
  const raw = meta.duration_seconds;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return trustedDuration(n);
}

/**
 * The file named by a project_assets row has to sit in this project's folder
 * (`<uid>/<projectId>/…`), the same check as `inFolderOf` in stillReferences.
 */
function locate(
  asset: StoredAsset,
  projectId: string,
): { bucket: string; path: string } | { reason: RenderMediaGap["reason"] } {
  if (asset.project_id !== projectId) return { reason: "wrong_project" };
  const bucket = bucketOfStoredAsset(asset);
  if (!(EDIT_MEDIA_BUCKETS as readonly string[]).includes(bucket))
    return { reason: "unknown_bucket" };
  const path = (asset.file_url ?? "").trim();
  if (!path || /^https?:/i.test(path) || /[;&|`$\\]/.test(path)) return { reason: "unsafe_path" };
  const parts = path.split("/");
  if (
    parts.length < 3 ||
    parts[1] !== projectId ||
    parts.some((part) => part === "" || part === "." || part === "..")
  )
    return { reason: "unsafe_path" };
  return { bucket, path };
}

function gap(
  clipId: string | null,
  name: string,
  assetId: string | null,
  reason: string,
): RenderMediaGap {
  return { clipId, name, assetId, reason };
}

export function resolveSequenceMedia(
  seq: EditSequence,
  assets: readonly StoredAsset[],
): MediaResolution {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const pictures: RenderMediaItem[] = [];
  const missing: RenderMediaGap[] = [];
  const slate: RenderMediaGap[] = [];
  for (const clip of videoClips(seq)) {
    const name = clip.name;
    if (!clip.assetId) {
      const row = gap(clip.id, name, null, clip.placeholder ? "placeholder" : "missing_asset");
      if (clip.placeholder) slate.push(row);
      else missing.push(row);
      continue;
    }
    const asset = byId.get(clip.assetId);
    if (!asset) {
      const row = gap(
        clip.id,
        name,
        clip.assetId,
        clip.placeholder ? "placeholder" : "missing_asset",
      );
      if (clip.placeholder) slate.push(row);
      else missing.push(row);
      continue;
    }
    const found = locate(asset, seq.projectId);
    if ("reason" in found) {
      missing.push(gap(clip.id, name, clip.assetId, found.reason));
      continue;
    }
    pictures.push({
      role: "picture",
      clipId: clip.id,
      name,
      assetId: clip.assetId,
      bucket: found.bucket,
      path: found.path,
      url: null,
      sourceIn: clip.sourceIn,
      sourceOut: clip.sourceOut,
      timelineIn: clip.timelineIn,
      timelineOut: clip.timelineOut,
      durationSeconds: metaDuration(asset),
      placeholder: clip.placeholder,
    });
  }

  let song: RenderMediaItem | null = null;
  if (seq.songAssetId) {
    const name = seq.songName || seq.songFile || "song";
    const asset = byId.get(seq.songAssetId);
    if (!asset) missing.push(gap(null, name, seq.songAssetId, "missing_asset"));
    else {
      const found = locate(asset, seq.projectId);
      if ("reason" in found) missing.push(gap(null, name, seq.songAssetId, found.reason));
      else {
        const timeline = durationSeconds(seq);
        const stored = metaDuration(asset) ?? trustedDuration(seq.songDuration);
        song = {
          role: "song",
          clipId: null,
          name,
          assetId: seq.songAssetId,
          bucket: found.bucket,
          path: found.path,
          url: null,
          sourceIn: seq.songOffset,
          sourceOut: seq.songOffset + timeline,
          timelineIn: 0,
          timelineOut: timeline,
          durationSeconds: stored,
          placeholder: false,
        };
      }
    }
  }
  return { pictures, song, missing, slate };
}

export function applyProbes(
  resolution: MediaResolution,
  probes: Readonly<Record<string, number>>,
): MediaResolution {
  const dur = (assetId: string, fallback: number | null) => {
    const probed = probes[assetId];
    if (probed != null && Number.isFinite(probed) && probed > 0) return probed;
    return fallback;
  };
  return {
    ...resolution,
    pictures: resolution.pictures.map((item) => ({
      ...item,
      durationSeconds: dur(item.assetId, item.durationSeconds),
    })),
    song: resolution.song
      ? {
          ...resolution.song,
          durationSeconds: dur(resolution.song.assetId, resolution.song.durationSeconds),
        }
      : null,
  };
}

export type SignedPath = { path: string; signedUrl: string | null };

export async function signAssets(
  items: readonly { assetId: string; bucket: string; path: string }[],
  signBucket: (bucket: string, paths: string[]) => Promise<SignedPath[]>,
): Promise<Record<string, string | null>> {
  const urls: Record<string, string | null> = {};
  const groups = new Map<string, { assetId: string; path: string }[]>();
  for (const item of items) {
    const list = groups.get(item.bucket) ?? [];
    list.push({ assetId: item.assetId, path: item.path });
    groups.set(item.bucket, list);
  }
  for (const [bucket, list] of groups) {
    const paths = [...new Set(list.map((item) => item.path))];
    const signed: SignedPath[] = [];
    for (let i = 0; i < paths.length; i += MAX_SIGN_BATCH) {
      const chunk = paths.slice(i, i + MAX_SIGN_BATCH);
      try {
        signed.push(...(await signBucket(bucket, chunk)));
      } catch {
        signed.push(...chunk.map((path) => ({ path, signedUrl: null })));
      }
    }
    const byPath = new Map(signed.map((row) => [row.path, row.signedUrl]));
    for (const item of list) urls[item.assetId] = byPath.get(item.path) ?? null;
  }
  return urls;
}

/** Line up a createSignedUrls answer with the paths we asked for, and drop anything that is not our storage. */
export function alignSigned(
  paths: readonly string[],
  data: { path: string | null; signedUrl: string | null; error?: string | null }[] | null,
): SignedPath[] {
  if (!data) return paths.map((path) => ({ path, signedUrl: null }));
  return paths.map((path, index) => {
    const row = data.find((item) => item.path === path) ?? data[index];
    const raw = row && !row.error ? row.signedUrl : null;
    return { path, signedUrl: raw && storageSignUrlOk(raw) ? raw : null };
  });
}

export type AssetSource = {
  from(table: string): {
    select(columns: string): {
      in(
        column: string,
        values: readonly string[],
      ): PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
    };
  };
};

export async function loadStoredAssets(db: AssetSource, seq: EditSequence): Promise<StoredAsset[]> {
  const ids = assetIdsOf(seq);
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from("project_assets")
    .select("id, project_id, asset_type, file_url, metadata_json")
    .in("id", ids);
  if (error) throw new Error(error.message);
  return assetsFromRows(data ?? []);
}

function withUrls(
  resolution: MediaResolution,
  urls: Readonly<Record<string, string | null>>,
): MediaResolution {
  const apply = (item: RenderMediaItem): RenderMediaItem => ({
    ...item,
    url: urls[item.assetId] && storageSignUrlOk(urls[item.assetId]!) ? urls[item.assetId]! : null,
  });
  return {
    ...resolution,
    pictures: resolution.pictures.map(apply),
    song: resolution.song ? apply(resolution.song) : null,
  };
}

/**
 * Build the ffmpeg plan from resolved files. Unsigned pictures are reported missing and rendered as slates.
 * `locals` are downloaded paths (the script). `probes` are ffprobe seconds and replace the filing default.
 */
export function renderPlanFor(
  seq: EditSequence,
  resolution: MediaResolution,
  urls: Readonly<Record<string, string | null>>,
  options: {
    kind?: RenderKind;
    aspect?: RenderAspect;
    locals?: Readonly<Record<string, string>>;
    probes?: Readonly<Record<string, number>>;
    grain?: boolean;
    captions?: boolean;
    upscale?: boolean;
    fontFile?: string | null;
  } = {},
): RenderPlan {
  const resolved = applyProbes(withUrls(resolution, urls), options.probes ?? {});
  const media: Record<string, string> = {};
  const durations: Record<string, number> = {};
  const items: RenderMediaItem[] = [];
  const missing = [...resolved.missing];
  for (const picture of resolved.pictures) {
    const local = options.locals?.[picture.assetId];
    if (!local && !picture.url) {
      missing.push(gap(picture.clipId, picture.name, picture.assetId, "unsigned"));
      continue;
    }
    media[picture.assetId] = local || mediaToken(picture.assetId, "picture");
    if (picture.durationSeconds != null) durations[picture.assetId] = picture.durationSeconds;
    items.push(picture);
  }
  let songPath: string | null = null;
  let songItem: RenderMediaItem | null = null;
  if (resolved.song) {
    const local = options.locals?.[resolved.song.assetId];
    if (!local && !resolved.song.url)
      missing.push(gap(null, resolved.song.name, resolved.song.assetId, "unsigned"));
    else {
      songPath = local || mediaToken(resolved.song.assetId, "song");
      songItem = resolved.song;
      items.push(resolved.song);
    }
  }
  const plan = planRender(seq, {
    kind: options.kind,
    aspect: options.aspect,
    media,
    durations,
    songPath,
    songDurationSeconds: songItem?.durationSeconds ?? null,
    grain: options.grain,
    captions: options.captions,
    upscale: options.upscale,
    fontFile: options.fontFile,
  });
  const report: RenderMediaReport = {
    realCount: items.filter((item) => item.role === "picture").length,
    song: songItem != null,
    missing,
    slate: resolved.slate,
    items,
  };
  for (const row of report.missing)
    plan.warnings.push(`${row.name}: missing media (${row.reason})`);
  for (const row of report.slate)
    plan.warnings.push(`${row.name}: lip-sync placeholder with no file, labelled slate`);
  return { ...plan, inputs: report };
}

export function assertMediaUrls(plan: RenderPlan): void {
  for (const item of plan.inputs.items) {
    if (item.url != null && !storageSignUrlOk(item.url)) {
      throw new Error("render plan media url is not this project's storage");
    }
  }
}

export function resolutionFromReport(report: RenderMediaReport): MediaResolution {
  const pictures = report.items.filter((item) => item.role === "picture");
  const song = report.items.find((item) => item.role === "song") ?? null;
  return { pictures, song, missing: report.missing, slate: report.slate };
}

export async function planForSequence(
  seq: EditSequence,
  rows: readonly Record<string, unknown>[],
  signBucket: (bucket: string, paths: string[]) => Promise<SignedPath[]>,
  options: {
    kind?: RenderKind;
    aspect?: RenderAspect;
    grain?: boolean;
    captions?: boolean;
    upscale?: boolean;
  } = {},
): Promise<RenderPlan> {
  const resolution = resolveSequenceMedia(seq, assetsFromRows(rows));
  const wanted = [
    ...resolution.pictures.map((item) => ({
      assetId: item.assetId,
      bucket: item.bucket,
      path: item.path,
    })),
    ...(resolution.song
      ? [
          {
            assetId: resolution.song.assetId,
            bucket: resolution.song.bucket,
            path: resolution.song.path,
          },
        ]
      : []),
  ];
  const urls = await signAssets(wanted, signBucket);
  return renderPlanFor(seq, resolution, urls, options);
}

export function mediaSummary(plan: RenderPlan): {
  realCount: number;
  song: boolean;
  missing: RenderMediaGap[];
  slate: RenderMediaGap[];
} {
  return {
    realCount: plan.inputs.realCount,
    song: plan.inputs.song,
    missing: plan.inputs.missing,
    slate: plan.inputs.slate,
  };
}
