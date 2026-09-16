/**
 * Consume D2 Lane H handoff v2 for playable MP4 provenance.
 * Does not edit exportHandoff.ts / sam3Consume.ts.
 */

import {
  RECONSTRUCT_LANE_H_HANDOFF_VERSION,
  buildReconstructLaneHHandoff,
  type ReconstructLaneHHandoff,
} from "../exportHandoff";
import { consumeSam3ForReconstruct } from "../sam3Consume";
import type { PlayableComposeOk } from "./compose";

export { RECONSTRUCT_LANE_H_HANDOFF_VERSION };

export function buildPlayableLaneHHandoff(compose: PlayableComposeOk): ReconstructLaneHHandoff {
  const consumed = consumeSam3ForReconstruct({
    expectedWidth: compose.width,
    expectedHeight: compose.height,
    allowFixtureFallback: false,
    raw: {
      width: compose.sam3Mask.width,
      height: compose.sam3Mask.height,
      source: "caller_supplied",
      liveFetch: false,
      outfitAlpha: compose.sam3Mask.outfitAlpha,
      repairAlpha: compose.sam3Mask.repairAlpha,
    },
  });
  return buildReconstructLaneHHandoff({
    clip: compose.clip,
    fps: compose.fps,
    unauthorizedLeakCount: compose.clip.originalPixelsPreservedWhereUnauthorized ? 0 : 1,
    sam3Provenance: consumed.provenance,
  });
}
