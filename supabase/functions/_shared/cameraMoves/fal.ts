import { buildCameraPrompt } from "./prompt.ts";
import type { CameraMove, Likeness, SubjectMode } from "./types.ts";

/**
 * Fal Seedance endpoints checked against the queue OpenAPI on 2026-11-26.
 * Reference video is `video_urls`. The prompt addresses the first clip as @Video1.
 * Text-to-video and image-to-video do not take a reference video.
 * AVT holds no Fal key. This module builds the body and does not submit it.
 */
export const FAL_REFERENCE_VIDEO_ENDPOINTS = [
  {
    id: "bytedance/seedance-2.5/reference-to-video",
    videoField: "video_urls",
    promptTag: "@Video1",
    schemaUrl:
      "https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=bytedance/seedance-2.5/reference-to-video",
  },
  {
    id: "bytedance/seedance-2.5/flash/reference-to-video",
    videoField: "video_urls",
    promptTag: "@Video1",
    schemaUrl:
      "https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=bytedance/seedance-2.5/flash/reference-to-video",
  },
  {
    id: "bytedance/seedance-2.0/reference-to-video",
    videoField: "video_urls",
    promptTag: "@Video1",
    schemaUrl:
      "https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=bytedance/seedance-2.0/reference-to-video",
  },
] as const;

export const FAL_SEEDANCE_WITHOUT_REFERENCE_VIDEO = [
  { id: "bytedance/seedance-2.5/text-to-video", reason: "prompt only; no video_urls field" },
  {
    id: "bytedance/seedance-2.5/image-to-video",
    reason: "image_url and end_image_url; no video_urls field",
  },
] as const;

export const DEFAULT_FAL_SEEDANCE_ENDPOINT = FAL_REFERENCE_VIDEO_ENDPOINTS[0].id;

const DURATIONS = [
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
] as const;

const RESOLUTIONS = ["480p", "720p", "1080p", "4k"] as const;
const ASPECTS = ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] as const;

export type FalResolution = (typeof RESOLUTIONS)[number];
export type FalAspect = (typeof ASPECTS)[number];

export type FalSeedanceInput = {
  prompt: string;
  task: "reference";
  video_urls: string[];
  image_urls: string[];
  audio_urls: string[];
  resolution: FalResolution;
  duration: string;
  aspect_ratio: FalAspect;
  generate_audio: false;
  draft: boolean;
};

export type CameraMovePlan = {
  submitted: false;
  spendUsd: 0;
  ready: boolean;
  blocked: string[];
  warnings: string[];
  moveId: string;
  endpoint: string;
  acceptsReferenceVideo: true;
  promptTag: "@Video1";
  subjectMode: SubjectMode;
  prompt: string;
  falInput: FalSeedanceInput;
  controlCenter: {
    action: "fal-run";
    model: string;
    input: FalSeedanceInput;
    submit: false;
    note: string;
  };
  existingHiggsfieldRoute: {
    endpoint: "video-providers-higgsfield-model";
    modelVariant: "seedance-2.5-reference";
    mode: "reference_to_video";
    referenceVideoUrls: string[];
    referenceImageUrls: string[];
    submit: false;
    note: string;
  } | null;
  endpointsWithoutReferenceVideo: typeof FAL_SEEDANCE_WITHOUT_REFERENCE_VIDEO;
  report: string;
};

function httpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function durationFor(seconds: number): { duration: string; warning?: string } {
  const rounded = Math.round(seconds);
  const clamped = Math.min(30, Math.max(4, rounded));
  const duration = String(clamped);
  if (!DURATIONS.includes(duration as (typeof DURATIONS)[number])) {
    return { duration: "4", warning: `Could not map ${seconds}s onto the fal duration enum.` };
  }
  if (clamped !== rounded)
    return {
      duration,
      warning: `The move is ${seconds}s. Fal's duration enum is 4–30, so the request uses ${duration}.`,
    };
  return { duration };
}

export function planCameraMove(input: {
  move: CameraMove;
  mode?: SubjectMode;
  place: string;
  likeness?: Likeness | null;
  /** Signed https URL of the stored pill clip. Omitted until the clip is uploaded. */
  videoUrl?: string;
  faceImageUrl?: string;
  resolution?: FalResolution;
  aspectRatio?: FalAspect;
  draft?: boolean;
  endpoint?: string;
}): CameraMovePlan | { ok: false; error: string } {
  const endpoint = input.endpoint ?? DEFAULT_FAL_SEEDANCE_ENDPOINT;
  const known = FAL_REFERENCE_VIDEO_ENDPOINTS.find((item) => item.id === endpoint);
  if (!known) {
    const refused = FAL_SEEDANCE_WITHOUT_REFERENCE_VIDEO.find((item) => item.id === endpoint);
    return {
      ok: false,
      error: refused
        ? `${endpoint} does not accept a reference video (${refused.reason}). Use ${DEFAULT_FAL_SEEDANCE_ENDPOINT}.`
        : `${endpoint} is not a checked Seedance reference-to-video endpoint.`,
    };
  }
  const prompt = buildCameraPrompt({
    move: input.move,
    mode: input.mode,
    place: input.place,
    likeness: input.likeness,
    faceImage: Boolean(input.faceImageUrl),
  });
  if (!prompt.ok) return prompt;

  const mode = prompt.mode;
  const blocked: string[] = [];
  const warnings = [...prompt.warnings];
  const video = httpsUrl(input.videoUrl);
  if (!video) {
    blocked.push(
      "No https URL for the pill clip. Render or copy it with scripts/camera-moves/render-references.mjs, store it under project-references, and pass the signed URL. Nothing was sent.",
    );
  }
  const aspect = input.move.width / input.move.height;
  if (input.move.durationSec < 1.8 || input.move.durationSec > 30.2) {
    warnings.push(
      `The pill is ${input.move.durationSec}s. Fal reference videos must be 1.8–30.2 seconds.`,
    );
  }
  if (aspect < 0.4 || aspect > 2.5 || input.move.fps < 24 || input.move.fps > 60) {
    warnings.push(
      `The pill is ${input.move.width}x${input.move.height} at ${input.move.fps} fps. Fal wants 24–60 fps and an aspect from 0.4 to 2.5.`,
    );
  }
  const duration = durationFor(input.move.durationSec);
  if (duration.warning) warnings.push(duration.warning);

  const face = mode === "non_performance" ? httpsUrl(input.faceImageUrl) : null;
  if (mode === "non_performance" && !face) {
    blocked.push("A non-performance shot needs an https face photo as @Image1. It was not sent.");
  }

  const falInput: FalSeedanceInput = {
    prompt: prompt.text,
    task: "reference",
    video_urls: video ? [video] : [],
    image_urls: face ? [face] : [],
    audio_urls: [],
    resolution: input.resolution ?? "720p",
    duration: duration.duration,
    aspect_ratio: input.aspectRatio ?? "9:16",
    generate_audio: false,
    draft: input.draft === true,
  };

  const note =
    "AVT does not hold a Fal key. Live Fal calls go through Control Center fal-run, and this model id is not on an allowlist in the AVT repo. This body is the request. It was not submitted. Cost of building it is $0.";

  const plan: CameraMovePlan = {
    submitted: false,
    spendUsd: 0,
    ready: blocked.length === 0,
    blocked,
    warnings,
    moveId: input.move.id,
    endpoint: known.id,
    acceptsReferenceVideo: true,
    promptTag: known.promptTag,
    subjectMode: mode,
    prompt: prompt.text,
    falInput,
    controlCenter: { action: "fal-run", model: known.id, input: falInput, submit: false, note },
    existingHiggsfieldRoute: video
      ? {
          endpoint: "video-providers-higgsfield-model",
          modelVariant: "seedance-2.5-reference",
          mode: "reference_to_video",
          referenceVideoUrls: [video],
          referenceImageUrls: face ? [face] : [],
          submit: false,
          note: "This is the Seedance reference route AVT already runs through Higgsfield, not a fal model id. It is shown so the same clip and prompt can be compared. It was not submitted.",
        }
      : null,
    endpointsWithoutReferenceVideo: FAL_SEEDANCE_WITHOUT_REFERENCE_VIDEO,
    report: [
      `${known.id} accepts a reference video as video_urls. The prompt calls it ${known.promptTag}.`,
      "Checked on the fal queue OpenAPI, 2026-11-26. Text-to-video and image-to-video do not have video_urls.",
      note,
      blocked.length
        ? `Not ready: ${blocked.join(" ")}`
        : "The body is ready to send once a person approves the spend. This function will not send it.",
    ].join(" "),
  };
  return plan;
}
