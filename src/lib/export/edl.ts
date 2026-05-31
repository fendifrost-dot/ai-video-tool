import type { TimelineManifestJson } from "./timelineManifest";
import { framesToTimecode } from "./timecode";

/**
 * CMX3600 EDL — lossy fallback; drops cut_type taxonomy and color/VFX metadata.
 */
export function buildEdl(
  manifest: TimelineManifestJson,
  clipPathByAssetId: Record<string, string>,
): string {
  const rate = manifest.frame_rate;
  const lines: string[] = ["TITLE: " + manifest.project_title, "FCM: NON-DROP FRAME"];
  let record = 1;

  for (const item of manifest.timeline) {
    if (!item.asset_id) continue;
    const path = clipPathByAssetId[item.asset_id] ?? "approved_clips/unknown";
    const reel = path.split("/").pop()?.slice(0, 8) ?? "AX";
    const srcIn = framesToTimecode(item.trim_in_frame, rate);
    const srcOut = framesToTimecode(
      item.trim_out_frame ?? item.end_frame - item.start_frame,
      rate,
    );
    const recIn = framesToTimecode(item.start_frame, rate);
    const recOut = framesToTimecode(item.end_frame, rate);
    const dissolve =
      item.cut_type === "crossfade" ? "C dissolve" : "C";

    lines.push(
      `${String(record).padStart(3, " ")}  ${reel.padEnd(8)} V     ${dissolve}     ${srcIn} ${srcOut} ${recIn} ${recOut}`,
    );
    lines.push(`* FROM CLIP NAME: ${path}`);
    record++;
  }

  return lines.join("\n") + "\n";
}
