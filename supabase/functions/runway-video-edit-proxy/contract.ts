// Runway POST /v1/video_to_video body for an edit of an existing clip.
//
// Pure on purpose: the proxy's dry run and the billed path both call this, and the
// contract test asserts the body with no network and no spend.
//
// The source-clip field is NOT one name across models. Read 2026-11-13 from
// runwayml/sdk-python `video_to_video_create_params.py` (main) and the Seedance 2.5
// guide on docs.dev.runwayml.com:
//
//   seedance2_5            promptVideo   — videoUri is rejected (HTTP 400, $0)
//   aleph2                 videoUri
//   gemini_omni_flash      videoUri
//   gemini_omni_flash_1.1  videoUri      — the id this proxy actually submits
//
// The AVT → Control Center body keeps the normalized name `videoUri` for every model.
// Control Center re-derives the wire body. This function is the wire body.

export const RUNWAY_EDIT_VIDEO_FIELD = {
  seedance2_5: "promptVideo",
  aleph2: "videoUri",
  gemini_omni_flash: "videoUri",
  "gemini_omni_flash_1.1": "videoUri",
} as const;

export type RunwayEditModelId = keyof typeof RUNWAY_EDIT_VIDEO_FIELD;
export type RunwayEditVideoField = (typeof RUNWAY_EDIT_VIDEO_FIELD)[RunwayEditModelId];
export type RunwayEditContractKind = "aleph2" | "mode_edit";

export type RunwayEditWireArgs = {
  model: string;
  contract: RunwayEditContractKind;
  videoUrl: string;
  promptText: string;
  keyframes?: ReadonlyArray<{ uri: string; seconds: number }>;
  references?: ReadonlyArray<{ uri: string }>;
};

export function runwayEditVideoField(model: string): RunwayEditVideoField {
  if (!Object.prototype.hasOwnProperty.call(RUNWAY_EDIT_VIDEO_FIELD, model)) {
    throw new Error(`runway_edit_video_field_unrecorded:${model}`);
  }
  return RUNWAY_EDIT_VIDEO_FIELD[model as RunwayEditModelId];
}

/**
 * The JSON body a Runway `POST /v1/video_to_video` edit would carry.
 * Edit mode never sends `ratio` or `contentModeration` (both 400, observed 2026-09-23).
 * Aleph 2.0 does send `contentModeration`. Empty keyframe and reference lists are omitted.
 */
export function buildRunwayVideoEditRequest(args: RunwayEditWireArgs): Record<string, unknown> {
  const videoField = runwayEditVideoField(args.model);
  if (args.contract === "aleph2") {
    const keyframes = args.keyframes ?? [];
    return {
      model: args.model,
      [videoField]: args.videoUrl,
      promptText: args.promptText,
      ...(keyframes.length ? { keyframes: [...keyframes] } : {}),
      contentModeration: { publicFigureThreshold: "low" },
    };
  }
  const references = args.references ?? [];
  return {
    model: args.model,
    [videoField]: args.videoUrl,
    mode: "edit",
    promptText: args.promptText,
    duration: "auto",
    ...(references.length ? { references: [...references] } : {}),
  };
}
