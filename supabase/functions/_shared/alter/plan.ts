import { buildAlterPrompt } from "./prompt.ts";
import { getPreset } from "./catalog.ts";
import type { AlterReport } from "./check.ts";
import { muxOriginalAudioArgv } from "./composite.ts";

/**
 * The route that rendered the draft Fendi passed (Meditate, 26 and 27 Nov 2026; docs/alter/TEST_2026-11-26.md):
 * AVT `proxy-provider-call` -> Control Center `video-providers-higgsfield-model`, variant `seedance-2.5-edit`
 * (Higgsfield `bytedance/seedance-2.5/video-edit`). The edit takes its length and frame from the source clip, so the
 * body carries no duration and no aspect ratio. The same edit wording on the reference-to-video endpoint is refused.
 */
export const ALTER_ROUTE = {
  function: "proxy-provider-call",
  endpoint: "video-providers-higgsfield-model",
  modelVariant: "seedance-2.5-edit",
  statusEndpoint: "video-providers-job-status",
  provider: "higgsfield",
} as const;

export type AlterResolution = "480p" | "720p" | "1080p";

export type AlterEditBody = {
  promptText: string;
  mode: "video_to_video";
  modelVariant: typeof ALTER_ROUTE.modelVariant;
  resolution: AlterResolution;
  generate_audio: false;
  referenceVideoUrl: string;
  referenceImageUrls: string[];
  avt_project_id?: string;
};

/** The arguments of one `avt_call`. Built here, sent by a person or an agent, never by this module. */
export type AlterCall = {
  function: typeof ALTER_ROUTE.function;
  body: { endpoint: typeof ALTER_ROUTE.endpoint; method: "POST"; body: AlterEditBody };
  submit: false;
  note: string;
};

export type AlterPlan = {
  submitted: false;
  spendUsd: 0;
  ready: boolean;
  blocked: string[];
  warnings: string[];
  preset: string;
  performance: boolean;
  prompt: string;
  /** Which picture each @Image tag in the prompt is. */
  images: string[];
  draft: AlterCall;
  finalize: null | AlterCall;
  poll: {
    function: typeof ALTER_ROUTE.function;
    body: {
      endpoint: typeof ALTER_ROUTE.statusEndpoint;
      method: "GET";
      query: { provider: typeof ALTER_ROUTE.provider; id: string };
    };
    note: string;
  };
  /** What to do with the file that comes back, in order. All local, all $0. */
  after: string[];
  audio: { argv: string[]; note: string };
  ifItFails: string;
  report: string;
};

export const MAX_FACE_PICTURES = 4;

function https(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function call(body: AlterEditBody, note: string): AlterCall {
  return {
    function: ALTER_ROUTE.function,
    body: { endpoint: ALTER_ROUTE.endpoint, method: "POST", body },
    submit: false,
    note,
  };
}

/**
 * Build the 480p draft call. Nothing is submitted: the result is the exact `avt_call` arguments.
 * The full-resolution call is attached by planFinalize, only for a draft that passed.
 */
export function planAlter(input: {
  preset: string;
  who: string;
  slots?: Record<string, string>;
  style?: string;
  performance?: boolean;
  videoUrl?: string;
  targetFrameUrl?: string;
  /** His face photographs (the tool's character_features face set), signed https links. */
  faceImageUrls?: string[];
  projectId?: string;
  sourceVideoPath?: string;
  sourceAudioPath?: string;
  outPath?: string;
}): AlterPlan | { ok: false; error: string } {
  const preset = getPreset(input.preset);
  if (!preset) return { ok: false, error: `No alter preset ${input.preset}.` };
  const blocked: string[] = [];
  const video = https(input.videoUrl);
  if (!video) blocked.push("No https URL for the take. Nothing was sent.");
  const target = https(input.targetFrameUrl);
  if (preset.targetFrame === true && !target) {
    blocked.push(
      "This preset needs the target frame as an https image: one frame of the take with the change already in it.",
    );
  }
  const given = input.faceImageUrls ?? [];
  const faces = given.map((url) => https(url)).filter((url): url is string => url !== null);
  if (faces.length !== given.length) blocked.push("A face picture is not an https URL.");
  if (faces.length > MAX_FACE_PICTURES)
    blocked.push(`At most ${MAX_FACE_PICTURES} face pictures. ${faces.length} were given.`);
  const prompt = buildAlterPrompt({
    preset: input.preset,
    who: input.who,
    slots: input.slots,
    style: input.style,
    performance: input.performance,
    facePictures: faces.length,
    targetFrame: target !== null,
  });
  if (!prompt.ok) return prompt;
  const warnings = [...prompt.warnings];
  if (/\{\w+\}/.test(prompt.text))
    blocked.push("The prompt still has an unfilled slot. Fill every slot before this is sent.");
  if (prompt.performance && faces.length === 0)
    warnings.push(
      "No face pictures were given. The draft Fendi passed had three of his face photographs attached.",
    );
  const body: AlterEditBody = {
    promptText: prompt.text,
    mode: "video_to_video",
    modelVariant: ALTER_ROUTE.modelVariant,
    resolution: "480p",
    generate_audio: false,
    referenceVideoUrl: video ?? "",
    referenceImageUrls: [...(target ? [target] : []), ...faces],
    ...(input.projectId ? { avt_project_id: input.projectId } : {}),
  };
  const note =
    "480p draft. generate_audio is false. This is one paid generation when it is sent with avt_call; building it costs $0 and sends nothing.";
  return {
    submitted: false,
    spendUsd: 0,
    ready: blocked.length === 0,
    blocked,
    warnings,
    preset: preset.name,
    performance: prompt.performance,
    prompt: prompt.text,
    images: [
      ...(target ? ["@Image1: the target frame"] : []),
      ...faces.map((_, index) => `@Image${index + 1 + (target ? 1 : 0)}: a face photograph`),
    ],
    draft: call(body, note),
    finalize: null,
    poll: {
      function: ALTER_ROUTE.function,
      body: {
        endpoint: ALTER_ROUTE.statusEndpoint,
        method: "GET",
        query: { provider: ALTER_ROUTE.provider, id: "<providerJobId from the submit response>" },
      },
      note: "The finished clip's link is resultUrl. Never print it.",
    },
    after: [
      "Download the clip. It comes back about 7% fast (89 frames for a 96-frame source).",
      "python -I scripts/alter/run_draft.py --take take.mp4 --raw raw.mp4 --out <folder> --mode " +
        preset.check +
        " --face <his face photographs>: conforms the draft to the take's length and rate, reads both mouths, scores them, runs the checker, and writes the face sheet and a side-by-side with the take's audio.",
      "Give the score to avt_alter_check as track_score. Post the side-by-side and the face sheet. Fendi judges the face.",
    ],
    audio: {
      argv: muxOriginalAudioArgv(
        input.sourceVideoPath ?? "draft.mp4",
        input.sourceAudioPath ?? "take.mp4",
        input.outPath ?? "draft-with-take-audio.mp4",
      ),
      note: "Every output gets the take's audio back, after the draft is conformed. This argv is not run here.",
    },
    ifItFails:
      "If the mouth or the face fails: re-roll, change the staging, or use his real take. Do not lay his original face back onto the redraw: Fendi failed that on 27 Nov 2026 (the face warps in motion).",
    report: [
      `${ALTER_ROUTE.function} -> ${ALTER_ROUTE.endpoint}, ${ALTER_ROUTE.modelVariant}, 480p. The take is referenceVideoUrl (@Video1).`,
      note,
    ].join(" "),
  };
}

function identityOnly(issue: string): boolean {
  return issue.startsWith("identity was not measured");
}

function warnsOnly(issue: string): boolean {
  return issue.includes("provisional") || issue.includes("Warns");
}

/**
 * Attach the full-resolution call to a draft that passed. Still not sent.
 * The mouth must have passed. The face is cleared by a passing identity number, or, when no number exists, by Fendi's
 * own words about this draft's face (`faceApproval`, quoted). A full-resolution edit is a new render of the same
 * request, not an upscale of the draft: it is conformed, scored and shown again.
 */
export function planFinalize(
  plan: AlterPlan,
  report: AlterReport,
  options: { resolution?: "720p" | "1080p"; faceApproval?: string } = {},
): AlterPlan {
  const open = report.issues.filter((issue) => !warnsOnly(issue) && !identityOnly(issue));
  const approval = options.faceApproval?.trim() ?? "";
  const faceOk = report.identity.measured ? !report.identity.fails : approval.length >= 8;
  const mouthOk =
    !plan.performance ||
    (report.mouth?.measured === true && !report.mouth.timingFails && !report.mouth.shapeFails);
  if (!plan.ready || open.length || !mouthOk || !faceOk) {
    const why = !plan.ready
      ? "The draft was never ready to send."
      : open.length
        ? `Open: ${open[0]}`
        : !mouthOk
          ? "The mouth did not pass."
          : "The face has no passing number and no word from Fendi.";
    return {
      ...plan,
      finalize: null,
      warnings: [...plan.warnings, `Draft did not pass. It is not finalized. ${why}`],
    };
  }
  const resolution = options.resolution ?? "1080p";
  return {
    ...plan,
    finalize: call(
      { ...plan.draft.body.body, resolution },
      `Unsent ${resolution} edit for a draft that passed${report.identity.measured ? "" : `; the face on Fendi's word: "${approval}"`}. A new render of the same request: conform, score and show it again.`,
    ),
  };
}
