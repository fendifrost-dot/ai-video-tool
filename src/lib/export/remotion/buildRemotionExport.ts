import type { TimelineManifestJson } from "../timelineManifest";

export type RemotionManifest = {
  compositionId: string;
  frameRate: number;
  durationInFrames: number;
  width: number;
  height: number;
  sequences: RemotionSequence[];
};

export type RemotionSequence = {
  id: string;
  from: number;
  durationInFrames: number;
  assetPath: string | null;
  trimInFrames: number;
  speed: number;
  textOverlays: unknown;
};

export function buildRemotionManifest(
  timelineManifest: TimelineManifestJson,
  clipPathByAssetId: Record<string, string>,
): RemotionManifest {
  const [w, h] = timelineManifest.resolution.split("x").map((n) => parseInt(n, 10));
  return {
    compositionId: "MusicVideo",
    frameRate: timelineManifest.frame_rate,
    durationInFrames: timelineManifest.duration_frames,
    width: w || 1920,
    height: h || 1080,
    sequences: timelineManifest.timeline.map((item) => ({
      id: item.id,
      from: item.start_frame,
      durationInFrames: item.end_frame - item.start_frame,
      assetPath: item.asset_id ? clipPathByAssetId[item.asset_id] ?? null : null,
      trimInFrames: item.trim_in_frame,
      speed: item.speed,
      textOverlays: item.text_overlays,
    })),
  };
}

export function buildRemotionCompositionScaffold(projectTitle: string): string {
  return `/**
 * Generated Remotion scaffold — install @remotion/cli and dependencies, then:
 *   npx remotion studio src/index.ts
 *
 * Draft preview supersedes the legacy shots.* ffmpeg assembly path.
 * Timeline source of truth: timeline_manifest.json in this folder.
 */
import { Composition } from "remotion";
import { MusicVideo } from "./MusicVideo";
import manifest from "./remotion_manifest.json";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id={manifest.compositionId}
        component={MusicVideo}
        durationInFrames={manifest.durationInFrames}
        fps={manifest.frameRate}
        width={manifest.width}
        height={manifest.height}
      />
    </>
  );
};

// Project: ${projectTitle.replace(/"/g, '\\"')}
`;
}

export function buildRemotionMusicVideoComponent(): string {
  return `import { AbsoluteFill, Sequence, Video, staticFile } from "remotion";
import manifest from "./remotion_manifest.json";

export const MusicVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {manifest.sequences.map((seq) =>
        seq.assetPath ? (
          <Sequence key={seq.id} from={seq.from} durationInFrames={seq.durationInFrames}>
            <Video src={staticFile(seq.assetPath)} startFrom={seq.trimInFrames} playbackRate={seq.speed} />
          </Sequence>
        ) : null,
      )}
    </AbsoluteFill>
  );
};
`;
}
