import { DEFAULT_FAL_SEEDANCE_ENDPOINT } from "../cameraMoves/fal.ts";
import { buildAlterPrompt } from "./prompt.ts";
import { getPreset } from "./catalog.ts";
import type { AlterReport } from "./check.ts";
import { muxOriginalAudioArgv } from "./composite.ts";

export type AlterFalInput = {
  prompt: string;
  task: "reference";
  video_urls: string[];
  image_urls: string[];
  audio_urls: string[];
  resolution: "480p" | "1080p";
  duration: string;
  aspect_ratio: "9:16" | "16:9" | "1:1" | "auto";
  generate_audio: false;
  draft: boolean;
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
  draft: {
    endpoint: string;
    input: AlterFalInput;
    submit: false;
    note: string;
  };
  finalize: null | {
    endpoint: string;
    input: AlterFalInput;
    submit: false;
    note: string;
  };
  audio: { argv: string[]; note: string };
  fallback: { enabled: boolean; when: string };
  report: string;
};

function https(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function durationOf(seconds: number): string {
  const clamped = Math.min(15, Math.max(4, Math.round(seconds)));
  return String(clamped);
}

/**
 * Build the 480p draft body. Nothing is submitted.
 * fal's verified Seedance reference input has `draft: true`, which forces 480p.
 * A separate "Draft Complete" model was not in the fal schema checked on 26 Nov 2026.
 * The finalize body is a second unsent 1080p reference call, attached only after a PASS.
 */
export function planAlter(input: {
  preset: string;
  who: string;
  slots?: Record<string, string>;
  style?: string;
  performance?: boolean;
  putFaceBack?: boolean;
  videoUrl?: string;
  targetFrameUrl?: string;
  sourceSeconds?: number;
  aspectRatio?: AlterFalInput["aspect_ratio"];
  sourceVideoPath?: string;
  sourceAudioPath?: string;
  outPath?: string;
}): AlterPlan | { ok: false; error: string } {
  const preset = getPreset(input.preset);
  if (!preset) return { ok: false, error: `No alter preset ${input.preset}.` };
  const prompt = buildAlterPrompt({
    preset: input.preset,
    who: input.who,
    slots: input.slots,
    style: input.style,
    performance: input.performance,
  });
  if (!prompt.ok) return prompt;
  const blocked: string[] = [];
  const warnings = [...prompt.warnings];
  const video = https(input.videoUrl);
  if (!video) blocked.push("No https URL for the take. Nothing was sent.");
  const target = https(input.targetFrameUrl);
  if (preset.targetFrame === true && !target) {
    blocked.push(
      "This preset needs the target frame as an https image: one frame of the take with the change already in it.",
    );
  }
  const falInput: AlterFalInput = {
    prompt: prompt.text,
    task: "reference",
    video_urls: video ? [video] : [],
    image_urls: target ? [target] : [],
    audio_urls: [],
    resolution: "480p",
    duration: durationOf(input.sourceSeconds ?? 8),
    aspect_ratio: input.aspectRatio ?? "9:16",
    generate_audio: false,
    draft: true,
  };
  const note =
    "Draft only. generate_audio is false. AVT holds no Fal key and this call is not submitted. Cost of building the body is $0.";
  const putBack = input.putFaceBack !== false && prompt.performance;
  return {
    submitted: false,
    spendUsd: 0,
    ready: blocked.length === 0,
    blocked,
    warnings,
    preset: preset.name,
    performance: prompt.performance,
    prompt: prompt.text,
    draft: { endpoint: DEFAULT_FAL_SEEDANCE_ENDPOINT, input: falInput, submit: false, note },
    finalize: null,
    audio: {
      argv: muxOriginalAudioArgv(
        input.sourceVideoPath ?? "render.mp4",
        input.sourceAudioPath ?? "take-audio.wav",
        input.outPath ?? "alter-with-original-audio.mp4",
      ),
      note: "Every output gets the original audio back. This argv is not run here.",
    },
    fallback: {
      enabled: putBack,
      when: putBack
        ? "If the mouth timing or the identity distance fails, composite his original face and mouth pixels over the redraw with the tracked mask. The redraw is not the deliverable."
        : "Face put-back is off.",
    },
    report: [
      `${DEFAULT_FAL_SEEDANCE_ENDPOINT} draft:true (480p). Reference video is video_urls (@Video1).`,
      "Scenario's Draft Complete model was not a separate id in the fal schema checked on 26 Nov 2026. A full-resolution body is attached only after the checker returns PASS, and it is still not sent.",
      note,
    ].join(" "),
  };
}

export function planFinalize(plan: AlterPlan, report: AlterReport): AlterPlan {
  if (report.verdict !== "PASS" || report.fallback) {
    return {
      ...plan,
      finalize: null,
      warnings: [...plan.warnings, "Draft did not pass. It is not finalized."],
    };
  }
  return {
    ...plan,
    finalize: {
      endpoint: plan.draft.endpoint,
      submit: false,
      note: "Unsent 1080p body for a draft that passed. Still not a provider call.",
      input: { ...plan.draft.input, draft: false, resolution: "1080p" },
    },
  };
}
