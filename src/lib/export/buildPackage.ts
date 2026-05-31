import JSZip from "jszip";
import { saveAs } from "file-saver";
import type {
  Artist,
  ProjectAsset,
  ProjectAssetType,
  Prompt,
  PromptTemplate,
  Shot,
  VideoProject,
} from "@/integrations/supabase/aliases";
import { bucketForAssetType } from "@/lib/queries/projectAssets";
import { signedUrl } from "@/lib/storage";
import {
  buildShotListCsv,
  buildPromptLogCsv,
  approvedFilename,
} from "./csv";
import { approvedClipsByShot, isClipAsset } from "./approvedClips";
import { buildEdl } from "./edl";
import { buildFcpxml } from "./fcpxml";
import {
  buildEditDecisionNotes,
  buildManifest,
} from "./manifest";
import {
  buildRemotionCompositionScaffold,
  buildRemotionManifest,
  buildRemotionMusicVideoComponent,
} from "./remotion/buildRemotionExport";
import type { TimelineManifestJson } from "./timelineManifest";
import type { TimelineRenderTarget } from "@/lib/timeline/types";

export type ExportOptions = {
  includeApprovedClips: boolean;
  includeRejectedClips: boolean;
  includeReferences: boolean;
  includeAudio: boolean;
};

export type TimelineExportBundle = {
  manifest: TimelineManifestJson;
  targets: Record<TimelineRenderTarget, boolean>;
  includeEdl?: boolean;
};

export type ExportProgress = {
  phase:
    | "preparing"
    | "manifest"
    | "csv"
    | "binaries"
    | "zip"
    | "done";
  /** 0-1, advances roughly through phases. */
  ratio: number;
  /** Human-readable label. */
  message: string;
};

export async function buildAndDownloadPackage(input: {
  project: VideoProject;
  artist: Artist | null;
  shots: Shot[];
  prompts: Prompt[];
  templates: PromptTemplate[];
  assets: ProjectAsset[];
  audioAsset: ProjectAsset | null;
  options: ExportOptions;
  timeline?: TimelineExportBundle;
  onProgress?: (p: ExportProgress) => void;
}): Promise<void> {
  const {
    project,
    artist,
    shots,
    prompts,
    templates,
    assets,
    audioAsset,
    options,
    timeline,
    onProgress,
  } = input;

  const progress = (phase: ExportProgress["phase"], ratio: number, message: string) =>
    onProgress?.({ phase, ratio, message });

  progress("preparing", 0.02, "Preparing package");

  // Lookup helpers
  const shotsById: Record<string, Shot> = {};
  for (const s of shots) shotsById[s.id] = s;
  const templatesById: Record<string, PromptTemplate> = {};
  for (const t of templates) templatesById[t.id] = t;
  const assetsById: Record<string, ProjectAsset> = {};
  for (const a of assets) assetsById[a.id] = a;

  const clipsByShot = approvedClipsByShot(assets);
  const clipPathByAssetId = buildClipPathByAssetId(clipsByShot, shotsById);

  // ---- Build text artifacts ----
  progress("manifest", 0.1, "Writing project manifest");
  const manifest = buildManifest({ project, artist, shots, prompts, assets });

  progress("csv", 0.18, "Generating shot list + prompt log CSVs");
  const shotListCsv = buildShotListCsv(shots, clipsByShot);
  const promptLogCsv = buildPromptLogCsv(prompts, shotsById, templatesById, assetsById);
  const editNotes = buildEditDecisionNotes({
    project,
    artist,
    shots,
    approvedClipsByShot: clipsByShot,
  });

  // ---- Initialise zip ----
  const zip = new JSZip();
  const root = zip.folder(slug(project.title))!;
  root.file("project_manifest.json", JSON.stringify(manifest, null, 2));
  root.file("shot_list.csv", shotListCsv);
  root.file("prompt_log.csv", promptLogCsv);
  root.file("edit_decision_notes.md", editNotes);
  root.file("README.md", buildReadme(project, options, timeline));

  if (timeline) {
    progress("manifest", 0.14, "Writing timeline manifest + NLE targets");
    const tm = timeline.manifest;
    root.file("timeline_manifest.json", JSON.stringify(tm, null, 2));
    const fcpxml = buildFcpxml(tm, clipPathByAssetId);
    const edl = timeline.includeEdl ? buildEdl(tm, clipPathByAssetId) : null;

    if (timeline.targets.premiere) {
      const premiere = root.folder("premiere_ready")!;
      premiere.file("timeline_manifest.json", JSON.stringify(tm, null, 2));
      premiere.file("shot_list.csv", shotListCsv);
      premiere.file("edit_decision_notes.md", editNotes);
      premiere.file("timeline.fcpxml", fcpxml);
      if (edl) premiere.file("timeline.edl", edl);
      premiere.file("README.md", premiereReadme());
    }

    if (timeline.targets.resolve) {
      const resolve = root.folder("resolve_ready")!;
      resolve.file("timeline_manifest.json", JSON.stringify(tm, null, 2));
      resolve.file("timeline.fcpxml", fcpxml);
      resolve.file("color_notes.md", buildResolveColorNotes(tm));
      resolve.folder("luts")!.file(
        "README.md",
        "Place project LUT .cube files here before import.\n",
      );
      if (edl) resolve.file("timeline.edl", edl);
    }

    if (timeline.targets.remotion) {
      const remotion = root.folder("remotion")!;
      const remotionManifest = buildRemotionManifest(tm, clipPathByAssetId);
      remotion.file("remotion_manifest.json", JSON.stringify(remotionManifest, null, 2));
      remotion.file("index.ts", buildRemotionCompositionScaffold(project.title));
      remotion.file("MusicVideo.tsx", buildRemotionMusicVideoComponent());
      remotion.file("README.md", remotionReadme());
    }
  }

  // ---- Collect binaries to fetch ----
  const binaries: { folder: string; filename: string; asset: ProjectAsset }[] = [];

  if (options.includeAudio && audioAsset) {
    const meta = audioAsset.metadata_json as { original_filename?: string } | null;
    binaries.push({
      folder: "audio",
      filename: meta?.original_filename ?? "audio",
      asset: audioAsset,
    });
  }

  if (options.includeApprovedClips) {
    for (const [shotId, asset] of Object.entries(clipsByShot)) {
      binaries.push({
        folder: "approved_clips",
        filename: approvedFilename(asset, shotsById[shotId]?.shot_number),
        asset,
      });
    }
  }

  if (options.includeRejectedClips) {
    for (const a of assets) {
      if (a.approval_status === "rejected" && isClipAsset(a)) {
        binaries.push({
          folder: "rejected_clips",
          filename: approvedFilename(a, a.shot_id ? shotsById[a.shot_id]?.shot_number : null),
          asset: a,
        });
      }
    }
  }

  if (options.includeReferences) {
    for (const a of assets) {
      const isRef: ProjectAssetType[] = ["reference_image", "reference_video", "lyrics_doc"];
      if (isRef.includes(a.asset_type)) {
        binaries.push({
          folder: "references",
          filename: approvedFilename(a),
          asset: a,
        });
      }
    }
  }

  // Always include a lyrics file if the project has lyrics text
  if (project.lyrics) {
    root.folder("lyrics")!.file("lyrics.md", buildLyricsDoc(project));
  }

  // ---- Fetch binaries ----
  if (binaries.length > 0) {
    const totalBytes = binaries.reduce((acc, b) => {
      const meta = b.asset.metadata_json as { size_bytes?: number } | null;
      return acc + (meta?.size_bytes ?? 0);
    }, 0);

    progress(
      "binaries",
      0.22,
      `Fetching ${binaries.length} ${binaries.length === 1 ? "file" : "files"} (~${formatSize(totalBytes)})`,
    );

    for (let i = 0; i < binaries.length; i++) {
      const b = binaries[i];
      const ratio = 0.22 + (0.68 * (i + 1)) / binaries.length;
      progress(
        "binaries",
        ratio,
        `Fetching ${i + 1}/${binaries.length}: ${b.filename}`,
      );
      try {
        const bucket = bucketForAssetType(b.asset.asset_type);
        const url = await signedUrl(bucket, b.asset.file_url, 3600);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        root.folder(b.folder)!.file(b.filename, blob);
      } catch (err) {
        console.error(`Failed to fetch ${b.filename}:`, err);
        // Continue — record a placeholder in the zip
        root.folder(b.folder)!.file(
          `${b.filename}.ERROR.txt`,
          `Failed to fetch this file: ${err instanceof Error ? err.message : String(err)}\n` +
            `Asset id: ${b.asset.id}\n` +
            `Storage path: ${b.asset.file_url}\n`,
        );
      }
    }
  }

  // ---- Generate the zip ----
  progress("zip", 0.92, "Compressing zip");
  const blob = await zip.generateAsync(
    { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
    (m) => {
      const r = 0.92 + 0.07 * (m.percent / 100);
      progress("zip", r, `Compressing zip (${Math.round(m.percent)}%)`);
    },
  );

  progress("done", 1, "Downloading…");
  const filename = `${slug(project.title)}_${new Date().toISOString().slice(0, 10)}.zip`;
  saveAs(blob, filename);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildClipPathByAssetId(
  clipsByShot: Record<string, ProjectAsset>,
  shotsById: Record<string, Shot>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [shotId, asset] of Object.entries(clipsByShot)) {
    const shot = shotsById[shotId];
    map[asset.id] = `approved_clips/${approvedFilename(asset, shot?.shot_number)}`;
  }
  return map;
}

function buildResolveColorNotes(manifest: TimelineManifestJson): string {
  const lines = [
    `# ${manifest.project_title} — Resolve color notes`,
    "",
    `**Global:** ${manifest.global_style.color_direction || "—"}`,
    `**Grain:** ${manifest.global_style.grain || "—"}`,
    `**Lens:** ${manifest.global_style.lens_language || "—"}`,
    "",
    "## Per-clip profiles",
    "",
  ];
  for (const item of manifest.timeline) {
    if (!item.color_profile_id && !item.vfx_profile_id) continue;
    lines.push(
      `- ${item.clip_filename ?? item.id}: color=${item.color_profile_id ?? "—"} vfx=${item.vfx_profile_id ?? "—"}`,
    );
  }
  if (lines.length === 8) lines.push("_No per-clip color/VFX profiles assigned._");
  return lines.join("\n");
}

function premiereReadme(): string {
  return [
    "# Premiere-ready",
    "",
    "Import `timeline.fcpxml` (File → Import). Clips reference `../approved_clips/`.",
    "Optional `timeline.edl` is a lossy fallback — prefer FCPXML when possible.",
  ].join("\n");
}

function remotionReadme(): string {
  return [
    "# Remotion draft preview",
    "",
    "Copy this folder into a Remotion project. Install `@remotion/cli`, then run studio.",
    "This path supersedes the legacy in-app ffmpeg assembly on `shots.*` seconds fields.",
    "Edit decisions live in `timeline_manifest.json` (regenerate from the app timeline).",
  ].join("\n");
}

function slug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "project";
}

function buildReadme(
  project: VideoProject,
  options: ExportOptions,
  timeline?: TimelineExportBundle,
): string {
  return [
    `# ${project.title}`,
    "",
    "Generated by AI Music Video OS.",
    "",
    "## Folder structure",
    "",
    "- `project_manifest.json` — canonical project metadata + counts",
    timeline ? "- `timeline_manifest.json` — universal edit timeline (frame-based)" : "",
    "- `shot_list.csv` — editor-friendly shot list",
    "- `prompt_log.csv` — every prompt sent to a provider, with versions",
    "- `edit_decision_notes.md` — ordered list of approved clips for the cut",
    timeline?.targets.premiere ? "- `premiere_ready/` — FCPXML + notes for Premiere" : "",
    timeline?.targets.resolve ? "- `resolve_ready/` — FCPXML + color notes + LUT folder" : "",
    timeline?.targets.remotion ? "- `remotion/` — JSON manifest + composition scaffold" : "",
    options.includeApprovedClips ? "- `approved_clips/` — clips marked Approved" : "",
    options.includeRejectedClips ? "- `rejected_clips/` — for reference, not for edit" : "",
    options.includeReferences ? "- `references/` — input references uploaded to the project" : "",
    options.includeAudio ? "- `audio/` — the song audio file" : "",
    project.lyrics ? "- `lyrics/lyrics.md` — pasted song lyrics" : "",
    "",
    "Open `project_manifest.json` for full programmatic detail.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildLyricsDoc(project: VideoProject): string {
  return [
    `# ${project.title} — Lyrics`,
    "",
    project.song_title ? `Song: ${project.song_title}` : "",
    "",
    "---",
    "",
    project.lyrics ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return "?";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
