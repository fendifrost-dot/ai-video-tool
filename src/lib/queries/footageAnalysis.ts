/**
 * Reading a take in the browser, and keeping what was read.
 *
 * The arithmetic is storyboard/footage.ts and storyboard/compatibility.ts; this is the part that touches a file and
 * the database. It mirrors queries/takeCheck.ts: open the file by byte range, make the three series the analyzer
 * wants, and keep the result on the asset's own record (`metadata_json.footage_analysis`).
 *
 * It is slow on purpose rather than by accident — three passes of a file, frame by frame, with a face reader on one
 * of them — so it is PRESSED, never automatic, it reports each stage, and it reads a bounded stretch. Nothing here
 * regenerates a clip, replaces an asset, edits a treatment or moves a timeline.
 */
import { supabase } from "@/lib/supabase";
import { openVideo } from "@/lib/media/frames";
import { faceSeries } from "@/lib/media/faceSeries";
import { frameSeries, SERIES_GRID, SERIES_MAX_SECONDS } from "@/lib/media/frameSeries";
import { detailSeries, DETAIL_TILES } from "@/lib/media/detailSeries";
import { analyzeFootage, type FileFacts } from "@/lib/storyboard/footage";
import { compatibilityOf, type TreatmentIntent } from "@/lib/storyboard/compatibility";
import {
  evidenceFor,
  withAnalysis,
  type FootageFingerprint,
  type StoredFootageAnalysis,
} from "@/lib/storyboard/footageRecord";
import type { MediaAsset } from "@/lib/storyboard/media";

type FileOf = Pick<MediaAsset, "bucket" | "path">;

/** The longest stretch read in one go. The same bound frameSeries puts on a frame-by-frame read. */
export const ANALYSIS_MAX_SECONDS = SERIES_MAX_SECONDS;

export type AnalyzeInput = {
  asset: FileOf & { id: string };
  url: string;
  /** The stretch of the take this shot uses. Defaults to the whole file, bounded. */
  range?: readonly [number, number];
  intent?: TreatmentIntent;
  onStage?: (stage: string) => void;
};

/**
 * Read a take and build its analysis and background spec. Throws when the file cannot be read, the browser has no
 * decoder for it, or the face reader cannot be fetched — the panel shows the message as it is.
 */
export async function analyzeTake(input: AnalyzeInput): Promise<StoredFootageAnalysis> {
  const opened = await openVideo(`${input.asset.bucket}:${input.asset.path}`, input.url);
  const track = opened.probe.video;
  if (!track) throw new Error(opened.probe.note ?? "the take could not be read");
  const whole: [number, number] = [0, track.duration];
  const asked = input.range
    ? ([Math.max(0, input.range[0]), Math.min(track.duration, input.range[1])] as [number, number])
    : whole;
  const range: [number, number] = asked[1] > asked[0] ? asked : whole;
  if (range[1] - range[0] > ANALYSIS_MAX_SECONDS) {
    throw new Error(
      `${Math.round(range[1] - range[0])} s is longer than this reading can take at once — analyze the stretch this shot uses`,
    );
  }

  input.onStage?.("reading the picture…");
  const detail = await detailSeries(opened.read, track, range[0], range[1]);
  input.onStage?.("reading its light…");
  const light = await frameSeries(opened.read, track, range[0], range[1]);
  input.onStage?.("finding him on every frame…");
  const faces = await faceSeries(opened.read, track, range[0], range[1]);

  const file: FileFacts = {
    width: track.width,
    height: track.height,
    // the track's own timing: samples over duration is the rate a player uses
    fps:
      track.duration > 0 && track.sampleCount > 1
        ? Math.round((track.sampleCount / track.duration) * 1000) / 1000
        : null,
    durationSeconds: track.duration || null,
    rotation: track.rotation ?? null,
    hasAudio: opened.probe.hasAudio,
    codec: track.codec ?? track.format ?? null,
    transfer: track.transfer ?? null,
  };

  const analysis = analyzeFootage({ file, faces, light, detail, range }, new Date().toISOString());
  const compatibility = compatibilityOf(analysis, input.intent ?? {});
  const fingerprint: FootageFingerprint = {
    bucket: input.asset.bucket,
    path: input.asset.path,
    bytes: opened.probe.totalBytes,
    seconds: track.duration || null,
    width: track.width,
    height: track.height,
  };

  return {
    id: `${range[0]}-${range[1]}-${analysis.version}`,
    fingerprint,
    settings: {
      detailTiles: DETAIL_TILES,
      lightGrid: SERIES_GRID,
      sampledBy: "browser",
      scaler: "canvas drawImage",
    },
    analysis,
    compatibility,
    evidence: evidenceFor(analysis, faces),
  };
}

/** Keep the reading on the take. The file is not touched; everything else on the asset's record stays as it is. */
export async function saveFootageAnalysis(
  assetId: string,
  next: StoredFootageAnalysis,
): Promise<StoredFootageAnalysis[]> {
  const { data, error } = await supabase
    .from("project_assets")
    .select("metadata_json")
    .eq("id", assetId)
    .single();
  if (error) throw new Error(`could not read the take's record: ${error.message}`);
  const meta = (data?.metadata_json ?? {}) as Record<string, unknown>;
  const kept = Array.isArray(meta.footage_analysis)
    ? (meta.footage_analysis as StoredFootageAnalysis[])
    : [];
  const all = withAnalysis(kept, next);
  const { error: upErr } = await supabase
    .from("project_assets")
    .update({ metadata_json: { ...meta, footage_analysis: all } as never })
    .eq("id", assetId);
  if (upErr) throw new Error(`could not keep the reading: ${upErr.message}`);
  return all;
}

/** What is kept on an asset's record, read back. Anything that does not parse is dropped rather than thrown over. */
export function parseFootageAnalyses(raw: unknown): StoredFootageAnalysis[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is StoredFootageAnalysis => {
    const o = x as Partial<StoredFootageAnalysis>;
    return (
      !!o &&
      typeof o === "object" &&
      !!o.analysis &&
      !!o.fingerprint &&
      Array.isArray(o.analysis.range)
    );
  });
}
