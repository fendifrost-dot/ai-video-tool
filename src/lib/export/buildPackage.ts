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
import {
  buildEditDecisionNotes,
  buildManifest,
} from "./manifest";

export type ExportOptions = {
  includeApprovedClips: boolean;
  includeRejectedClips: boolean;
  includeReferences: boolean;
  includeAudio: boolean;
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

  // Approved clips per shot (most-recent per shot)
  const approvedClipsByShot: Record<string, ProjectAsset> = {};
  for (const a of assets) {
    if (a.approval_status === "approved" && a.shot_id && isClipAsset(a)) {
      const prior = approvedClipsByShot[a.shot_id];
      if (!prior || a.created_at > prior.created_at) {
        approvedClipsByShot[a.shot_id] = a;
      }
    }
  }

  // ---- Build text artifacts ----
  progress("manifest", 0.1, "Writing project manifest");
  const manifest = buildManifest({ project, artist, shots, prompts, assets });

  progress("csv", 0.18, "Generating shot list + prompt log CSVs");
  const shotListCsv = buildShotListCsv(shots, approvedClipsByShot);
  const promptLogCsv = buildPromptLogCsv(prompts, shotsById, templatesById, assetsById);
  const editNotes = buildEditDecisionNotes({
    project,
    artist,
    shots,
    approvedClipsByShot,
  });

  // ---- Initialise zip ----
  const zip = new JSZip();
  const root = zip.folder(slug(project.title))!;
  root.file("project_manifest.json", JSON.stringify(manifest, null, 2));
  root.file("shot_list.csv", shotListCsv);
  root.file("prompt_log.csv", promptLogCsv);
  root.file("edit_decision_notes.md", editNotes);
  root.file("README.md", buildReadme(project, options));

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
    for (const [shotId, asset] of Object.entries(approvedClipsByShot)) {
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
function isClipAsset(a: ProjectAsset): boolean {
  return (
    a.asset_type === "generated_clip" ||
    a.asset_type === "edited_clip" ||
    a.asset_type === "social_cutdown"
  );
}

function slug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "project";
}

function buildReadme(project: VideoProject, options: ExportOptions): string {
  return [
    `# ${project.title}`,
    "",
    "Generated by AI Music Video OS.",
    "",
    "## Folder structure",
    "",
    "- `project_manifest.json` — canonical project metadata + counts",
    "- `shot_list.csv` — editor-friendly shot list",
    "- `prompt_log.csv` — every prompt sent to a provider, with versions",
    "- `edit_decision_notes.md` — ordered list of approved clips for the cut",
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
