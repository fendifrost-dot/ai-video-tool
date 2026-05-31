import type { TimelineManifestJson } from "./timelineManifest";
import { framesToTimecode } from "./timecode";

/**
 * FCPXML 1.8 — imports into Premiere Pro and DaVinci Resolve.
 * Clip paths are relative to the export folder (e.g. approved_clips/…).
 */
export function buildFcpxml(
  manifest: TimelineManifestJson,
  clipPathByAssetId: Record<string, string>,
): string {
  const rate = manifest.frame_rate;
  const formatName = `FFVideoFormat${manifest.resolution.replace("x", "x")}p${rate}`;
  const durationTc = framesToTimecode(manifest.duration_frames, rate);

  const spineClips = manifest.timeline
    .filter((item) => item.asset_id)
    .map((item) => {
      const path = clipPathByAssetId[item.asset_id!] ?? `approved_clips/unknown`;
      const name = path.split("/").pop() ?? "clip";
      const duration = item.end_frame - item.start_frame;
      const offsetTc = framesToTimecode(item.start_frame, rate);
      const durationTcClip = framesToTimecode(duration, rate);
      const trimInTc = framesToTimecode(item.trim_in_frame, rate);

      let transition = "";
      if (item.cut_type === "crossfade") {
        transition = `
          <transition name="Cross Dissolve">
            <filter-video ref="crossDissolve"/>
          </transition>`;
      }

      return `
        <asset-clip name="${escapeXml(name)}" offset="${offsetTc}" duration="${durationTcClip}" start="${trimInTc}" ref="asset-${escapeXml(item.asset_id!)}">
          <file id="file-${escapeXml(item.asset_id!)}" name="${escapeXml(name)}" src="${escapeXml(path)}"/>
        </asset-clip>${transition}`;
    })
    .join("\n");

  const assetDefs = [...new Set(manifest.timeline.map((i) => i.asset_id).filter(Boolean))]
    .map((id) => {
      const path = clipPathByAssetId[id!] ?? `approved_clips/unknown`;
      const name = path.split("/").pop() ?? "clip";
      return `
    <asset id="asset-${escapeXml(id!)}" name="${escapeXml(name)}" uid="${escapeXml(id!)}" start="0s" duration="0s" hasVideo="1" hasAudio="1">
      <media-rep kind="original-media" src="${escapeXml(path)}"/>
    </asset>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.8">
  <resources>
    <format id="r1" name="${escapeXml(formatName)}" frameDuration="1/${rate}s" width="${manifest.resolution.split("x")[0]}" height="${manifest.resolution.split("x")[1]}"/>
    ${assetDefs}
  </resources>
  <library>
    <event name="${escapeXml(manifest.project_title)}">
      <project name="${escapeXml(manifest.project_title)} Timeline">
        <sequence format="r1" duration="${durationTc}">
          <spine>
            ${spineClips}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
