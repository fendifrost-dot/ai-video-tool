import { buildAlterPrompt } from "./prompt.ts";
import { getPreset } from "./catalog.ts";
import { muxOriginalAudioArgv } from "./composite.ts";
import { rejudge } from "./judge.ts";

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
  /** True when the request is well formed. It does not mean the links are AVT's, or that anything was checked. */
  ready: boolean;
  blocked: string[];
  warnings: string[];
  preset: string;
  performance: boolean;
  prompt: string;
  /** Which picture each @Image tag in the prompt is. */
  images: string[];
  /** The request as it stands, for reading. Never send this: send `draft`, which exists only when `ready`. */
  preview: AlterEditBody;
  /** The 480p call. Null while anything is blocked, so a broken request cannot be copied into avt_call. */
  draft: AlterCall | null;
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

function https(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
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
 * The full-resolution call is attached by planFinalize, only for a draft whose report passes.
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
  faceImageUrls?: unknown[];
  projectId?: string;
  sourceVideoPath?: string;
  sourceAudioPath?: string;
  outPath?: string;
}): AlterPlan | { ok: false; error: string } {
  const preset = getPreset(input.preset);
  if (!preset) return { ok: false, error: `No alter preset ${input.preset}.` };
  const blocked: string[] = [];
  const video = https(input.videoUrl);
  if (!video)
    blocked.push("No https URL for the take (no username or password in it). Nothing was sent.");
  const target = https(input.targetFrameUrl);
  if (input.targetFrameUrl && !target) blocked.push("The target frame is not an https URL.");
  if (preset.targetFrame === true && !target)
    blocked.push(
      "This preset needs the target frame as an https image: one frame of the take with the change already in it.",
    );
  else if (/@Image1\b/.test(preset.change) && !target)
    blocked.push(
      `This preset's change names @Image1 (${preset.refs[0] ?? "its reference picture"}). Pass that picture as the target frame, or his face photograph would take its place.`,
    );
  const given = input.faceImageUrls ?? [];
  const faces = given.map((url) => https(url)).filter((url): url is string => url !== null);
  if (faces.length !== given.length)
    blocked.push("A face picture is not an https URL (text, no username or password).");
  if (given.length > MAX_FACE_PICTURES)
    blocked.push(`At most ${MAX_FACE_PICTURES} face pictures. ${given.length} were given.`);
  const attached = faces.slice(0, MAX_FACE_PICTURES);
  const prompt = buildAlterPrompt({
    preset: input.preset,
    who: input.who,
    slots: input.slots,
    style: input.style,
    performance: input.performance,
    facePictures: attached.length,
    targetFrame: target !== null,
  });
  if (!prompt.ok) return prompt;
  const warnings = [...prompt.warnings];
  if (/\{\w+\}/.test(prompt.text))
    blocked.push("The prompt still has an unfilled slot. Fill every slot before this is sent.");
  if (prompt.performance && attached.length === 0)
    warnings.push(
      "No face pictures were given. The draft Fendi passed had three of his face photographs attached.",
    );
  if (target && !/@Image1\b/.test(prompt.text.split("\n\n").slice(0, 2).join(" ")))
    warnings.push(
      "A target frame is attached as @Image1 but this preset's change does not mention it.",
    );
  const body: AlterEditBody = {
    promptText: prompt.text,
    mode: "video_to_video",
    modelVariant: ALTER_ROUTE.modelVariant,
    resolution: "480p",
    generate_audio: false,
    referenceVideoUrl: video ?? "",
    referenceImageUrls: [...(target ? [target] : []), ...attached],
    ...(typeof input.projectId === "string" && input.projectId
      ? { avt_project_id: input.projectId }
      : {}),
  };
  const ready = blocked.length === 0;
  const note =
    "480p draft. generate_audio is false. This is one paid generation when it is sent with avt_call; building it costs $0 and sends nothing.";
  return {
    submitted: false,
    spendUsd: 0,
    ready,
    blocked,
    warnings,
    preset: preset.name,
    performance: prompt.performance,
    prompt: prompt.text,
    images: [
      ...(target ? ["@Image1: the target frame"] : []),
      ...attached.map((_, index) => `@Image${index + 1 + (target ? 1 : 0)}: a face photograph`),
    ],
    preview: body,
    draft: ready ? call(body, note) : null,
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
      `python -I scripts/alter/run_draft.py --take take.mp4 --raw raw.mp4 --out <folder> --mode ${preset.check} --face <his face photographs>: conforms the draft to the take's length and rate, reads both mouths, scores them, runs the checker, and writes report.json, the face sheet and a side-by-side with the take's audio.`,
      "Give report.json to avt_alter_check as `report`. Post the side-by-side and the face sheet. Fendi judges the face.",
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
    report: ready
      ? `${ALTER_ROUTE.function} -> ${ALTER_ROUTE.endpoint}, ${ALTER_ROUTE.modelVariant}, 480p. The take is referenceVideoUrl (@Video1). ${note}`
      : `Not ready, so there is no call to send: ${blocked[0]}`,
  };
}

/**
 * Attach the full-resolution call for a draft whose report passes. Still not sent.
 *
 * This is a checklist for the caller, not a control: the same caller can send any body through avt_call, and this
 * module reads no video. The report is judged again from its numbers (judge.ts `rejudge`); its own flags decide
 * nothing. It must be a report for this preset's check mode and this plan's performance setting. The mouth must
 * have passed. The face needs a passing identity number, or, while no number exists, `faceApproval`: words the
 * CALLER says are Fendi's about this draft's face. The server cannot verify them and says so in the note.
 * Full resolution is a new render of the same request, not an upscale of the draft: conform, score and show it again.
 */
export function planFinalize(
  plan: AlterPlan,
  report: unknown,
  options: { resolution?: "720p" | "1080p"; faceApproval?: string } = {},
): AlterPlan {
  const refuse = (why: string): AlterPlan => ({
    ...plan,
    finalize: null,
    warnings: [...plan.warnings, `Not finalized. ${why}`],
  });
  if (!plan.ready || !plan.draft) return refuse("The draft was never ready to send.");
  const judged = rejudge(report);
  if (!judged.ok) return refuse(judged.error);
  const r = judged.value;
  const expected = getPreset(plan.preset)?.check;
  if (r.mode !== expected)
    return refuse(
      `The report was checked as "${r.mode}" but the ${plan.preset} preset is checked as "${expected}". Run run_draft.py with --mode ${expected}.`,
    );
  if (r.performance !== plan.performance)
    return refuse("The report and the plan disagree on whether he is rapping in this take.");
  const approval = typeof options.faceApproval === "string" ? options.faceApproval.trim() : "";
  if (r.redrawCleared) {
    /* cleared by the numbers */
  } else if (r.faceNeedsHisEye && approval.length >= 12) {
    /* cleared on the caller's statement of Fendi's words */
  } else if (r.faceNeedsHisEye) {
    return refuse(
      "Everything measured passed, but the face has no identity number and no face_approval (Fendi's own words about this draft's face).",
    );
  } else {
    return refuse(r.next);
  }
  const resolution = options.resolution ?? "1080p";
  const how = r.redrawCleared
    ? "the supplied report passes every gate, identity included"
    : `the supplied report passes every measured gate; the face rests on face_approval as supplied by the caller, not verified by this server: ${JSON.stringify(approval.slice(0, 300))}`;
  return {
    ...plan,
    finalize: call(
      { ...plan.draft.body.body, resolution },
      `Unsent ${resolution} edit: ${how}. This server read no video. A new render of the same request, not an upscale: conform, score and show it again.`,
    ),
  };
}
