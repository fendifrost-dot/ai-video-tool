/**
 * A second pair of eyes on a section of the cut (Review → "Ask Astra").
 *
 * Astra is shown what Review shows: three frames from every shot of the section, in song order, each labelled with
 * the shot it belongs to — and told what each shot was meant to be (its scene, its words, the treatment). It answers
 * as a creative and production reviewer, and every finding names ONE shot by its number, so a finding leads straight
 * back to the shot record that has to change. Nothing here repairs anything: it reports.
 *
 * The call goes through astra-visual-review-proxy (submit, then poll — a review outlives one request).
 */
import { supabase } from "@/lib/supabase";
import { functionFailureText } from "@/lib/functionsError";
import { frameOf } from "@/lib/media/frames";
import { videoStateAt, type AssignmentRole, type MediaAsset, type TimelineSegment } from "./media";

export const REVIEW_AREAS = ["treatment", "storyboard", "identity", "wardrobe", "environment", "cinematography", "continuity", "transition", "rhythm", "realism", "artifact", "product_truth"] as const;
export type ReviewArea = (typeof REVIEW_AREAS)[number];
export const REVIEW_SEVERITIES = ["blocker", "major", "minor"] as const;

export type SectionFinding = { shot: number; severity: (typeof REVIEW_SEVERITIES)[number]; area: ReviewArea; finding: string; fix: string };
export type SectionReview = {
  verdict: "pass" | "revise" | "fail";
  summary: string;
  strengths: string[];
  findings: SectionFinding[];
  /** Could this section be released as it stands, and what stands between it and that. */
  release: string;
};

/** A review as it is kept on the project: which shots it looked at, and each finding tied to its shot record. */
export type StoredSectionReview = {
  at: string;
  from: number;
  to: number;
  model: string | null;
  costUsd: number | null;
  verdict: SectionReview["verdict"];
  summary: string;
  strengths: string[];
  release: string;
  findings: (SectionFinding & { shotId: string | null; key: string | null })[];
};

export const SECTION_REVIEW_SCHEMA = {
  name: "section_review",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["verdict", "summary", "strengths", "findings", "release"],
    properties: {
      verdict: { type: "string", enum: ["pass", "revise", "fail"], description: "pass = release it; revise = good, with named shots to fix; fail = the section does not work" },
      summary: { type: "string", description: "three or four sentences a director would say after watching it" },
      strengths: { type: "array", items: { type: "string" } },
      findings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["shot", "severity", "area", "finding", "fix"],
          properties: {
            shot: { type: "integer", description: "the number of the ONE shot this finding is about, as labelled on its frames" },
            severity: { type: "string", enum: [...REVIEW_SEVERITIES] },
            area: { type: "string", enum: [...REVIEW_AREAS] },
            finding: { type: "string", description: "what is wrong, as seen in the frames" },
            fix: { type: "string", description: "what to do to that shot: regenerate it (and how the scene should change), swap its footage, recut it" },
          },
        },
      },
      release: { type: "string", description: "could this section be released as it stands; if not, what stands between it and release" },
    },
  },
} as const;

export type ReviewShot = {
  number: number;
  key: string;
  shotId: string;
  start: number;
  end: number;
  /** What the shot is showing. */
  shows: string;
  scene: string;
  lyrics: string;
};

const ROLE_WORDS: Record<AssignmentRole, string> = {
  performance: "the artist's real performance footage",
  b_roll: "the director's own B-roll footage",
  generated_clip: "a generated clip",
  generated_image: "a generated still image (held for the shot)",
  reference: "a reference",
};

/** What a shot of the cut is showing, in words a reviewer needs: real, restaged, generated, nothing. */
export function showsOf(seg: TimelineSegment, asset: Pick<MediaAsset, "derivedFrom"> | null | undefined): string {
  if (seg.media.kind === "none") return "nothing yet (no footage on this shot)";
  if (seg.media.role === "performance" && asset?.derivedFrom) return "the artist's real performance, re-shot by a video model inside a generated place (his mouth should still match the song)";
  return ROLE_WORDS[seg.media.role];
}

const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/** The label a frame carries: the reviewer reads the shot number off it. */
export function frameLabel(shot: Pick<ReviewShot, "number">, songTime: number, position: string): string {
  return `SHOT ${String(shot.number).padStart(2, "0")} — ${position} — song ${clock(songTime)}`;
}

/** The brief: what the section is meant to be, and how to answer. */
export function reviewBrief(input: { songTitle?: string | null; treatment: string; notes?: string | null; takeWears?: string | null; shots: readonly ReviewShot[] }): string {
  const first = input.shots[0];
  const last = input.shots[input.shots.length - 1];
  return [
    `You are reviewing a section of a music video${input.songTitle ? ` for "${input.songTitle}"` : ""} as its creative and production reviewer. You are shown frames from every shot of the section in song order — the opening, middle and close of each — labelled with the shot's number. You cannot hear the song; the words sung in each shot are given below.`,
    `The section runs ${clock(first.start)}–${clock(last.end)} of the song, shots ${first.number}–${last.number}.`,
    `The treatment — the one creative brief:\n${input.treatment.trim() || "(none written)"}`,
    input.notes?.trim() ? `The director's notes (constraints):\n${input.notes.trim()}` : null,
    input.takeWears?.trim() ? `In his real footage the artist wears: ${input.takeWears.trim()}. That is what he must be wearing in every shot he is in.` : null,
    "The shots, as planned:\n" +
      input.shots
        .map((s) => `SHOT ${String(s.number).padStart(2, "0")} (${clock(s.start)}–${clock(s.end)}, ${(s.end - s.start).toFixed(1)} s) — shows ${s.shows}.\n  Scene: ${s.scene.trim() || "(not written)"}\n  Words: ${s.lyrics.trim() ? `"${s.lyrics.trim()}"` : "(none)"}`)
        .join("\n"),
    [
      "Judge it as a piece of a real music video, not as a technology demo:",
      "- treatment: does the section deliver the treatment's idea and world;",
      "- storyboard: does each shot show the scene it was planned as, and answer its words;",
      "- identity and wardrobe: is the artist the same real man, in the same clothes, in every shot he is in;",
      "- environment and cinematography: are the places convincing and consistent, is the framing chosen;",
      "- continuity, transition, rhythm: do neighbouring shots cut together, does the order build;",
      "- realism and artifact: does generated material sit next to the real footage without giving itself away — warped faces or hands, melted detail, a pasted-on look, a soft or plastic picture;",
      "- product_truth: anything that is not what it is said to be (a shot said to show something it does not).",
      "Every finding is about ONE shot, named by its number, and says what to do to that shot. Do not report a finding you cannot see in the frames. If a shot is fine, do not invent a finding for it. Be direct.",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Keep what came back in shape: findings on shots that are in the section, in song order, worst first within a shot. */
export function parseSectionReview(raw: unknown, shots: readonly Pick<ReviewShot, "number" | "key" | "shotId">[]): Omit<StoredSectionReview, "at" | "from" | "to" | "model" | "costUsd"> {
  const r = (raw ?? {}) as Partial<SectionReview>;
  const byNumber = new Map(shots.map((s) => [s.number, s]));
  const rank = (s: string) => REVIEW_SEVERITIES.indexOf(s as SectionFinding["severity"]);
  const findings = (Array.isArray(r.findings) ? r.findings : [])
    .filter((f) => f && typeof f.finding === "string" && f.finding.trim())
    .map((f) => {
      const shot = byNumber.get(Number(f.shot));
      return {
        shot: Number(f.shot),
        severity: (REVIEW_SEVERITIES as readonly string[]).includes(f.severity) ? f.severity : "minor",
        area: (REVIEW_AREAS as readonly string[]).includes(f.area) ? f.area : "storyboard",
        finding: f.finding.trim(),
        fix: String(f.fix ?? "").trim(),
        shotId: shot?.shotId ?? null,
        key: shot?.key ?? null,
      };
    })
    .sort((a, b) => a.shot - b.shot || rank(a.severity) - rank(b.severity));
  const verdict = r.verdict === "pass" || r.verdict === "fail" ? r.verdict : "revise";
  return { verdict, summary: String(r.summary ?? "").trim(), strengths: (Array.isArray(r.strengths) ? r.strengths : []).map(String).filter(Boolean), release: String(r.release ?? "").trim(), findings };
}

/** List price of a review, from the number of pictures sent (the proxy's own figures: 1600 tokens a picture). */
export function reviewEstimateUsd(pictures: number, briefChars: number): number {
  const input = pictures * 1600 + Math.ceil(briefChars / 3.5);
  return Number(((input * 10 + 6000 * 50) / 1_000_000).toFixed(2));
}

/** Where in a shot its three review frames are taken. */
export const REVIEW_FRAMES = [
  { fraction: 0.08, position: "opening" },
  { fraction: 0.5, position: "middle" },
  { fraction: 0.92, position: "close" },
] as const;

export type ReviewPicture = { label: string; dataUrl: string };

function toJpeg(source: CanvasImageSource, width: number, height: number, maxWidth = 512): string {
  const scale = Math.min(1, maxWidth / width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(width * scale));
  canvas.height = Math.max(2, Math.round(height * scale));
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

/**
 * The pictures of a section: three frames of every shot that plays a video, the image of a shot that shows one.
 * A shot whose frames cannot be read is left out and named in `unreadable` (the reviewer is told nothing about it).
 */
export async function sectionPictures(input: {
  shots: readonly TimelineSegment[];
  assets: ReadonlyMap<string, MediaAsset>;
  /** The signed link and the file key for an asset's playable copy. */
  linkOf: (asset: MediaAsset) => Promise<{ key: string; url: string } | null>;
}): Promise<{ pictures: ReviewPicture[]; unreadable: number[] }> {
  const pictures: ReviewPicture[] = [];
  const unreadable: number[] = [];
  for (const seg of input.shots) {
    if (seg.media.kind === "none") continue;
    const asset = input.assets.get(seg.media.assetId);
    const link = asset ? await input.linkOf(asset) : null;
    if (!asset || !link) {
      unreadable.push(seg.index);
      continue;
    }
    if (seg.media.kind === "image") {
      try {
        const bitmap = await createImageBitmap(await (await fetch(link.url)).blob());
        pictures.push({ label: frameLabel({ number: seg.index }, seg.start, "held image"), dataUrl: toJpeg(bitmap, bitmap.width, bitmap.height) });
        bitmap.close();
      } catch {
        unreadable.push(seg.index);
      }
      continue;
    }
    let got = 0;
    for (const f of REVIEW_FRAMES) {
      const songTime = seg.start + (seg.end - seg.start) * f.fraction;
      const state = videoStateAt(seg, songTime, asset.durationSeconds);
      if (!state) continue;
      const r = await frameOf(link.key, link.url, state.at);
      if (!r.ok) continue;
      pictures.push({ label: frameLabel({ number: seg.index }, songTime, f.position), dataUrl: toJpeg(r.frame, r.frame.displayWidth, r.frame.displayHeight) });
      r.frame.close();
      got += 1;
    }
    if (got === 0) unreadable.push(seg.index);
  }
  return { pictures, unreadable };
}

type ProxyReply = Record<string, unknown>;

async function callAstra(body: Record<string, unknown>): Promise<ProxyReply> {
  const { data, error } = await supabase.functions.invoke<ProxyReply>("astra-visual-review-proxy", { body });
  if (error) throw new Error(`The reviewer could not be reached: ${await functionFailureText(error, data)}`);
  return data ?? {};
}

/** Send the section to the reviewer. Returns the id to ask about. Throws with the provider's own reason. */
export async function submitSectionReview(input: { projectId: string; from: number; to: number; brief: string; pictures: readonly ReviewPicture[]; maxCostUsd: number }): Promise<{ responseId: string; draftId: string }> {
  const draftId = `storyboard-${input.from}-${input.to}-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
  const reply = await callAstra({ projectId: input.projectId, draftId, partId: "section", mode: "submit", instructions: input.brief, frames: input.pictures, jsonSchema: SECTION_REVIEW_SCHEMA, reasoningEffort: "medium", maxCostUsd: input.maxCostUsd, maxOutputTokens: 12000 });
  if (typeof reply.responseId !== "string") {
    const payload = reply.payload as { error?: { message?: string } } | undefined;
    const why = payload?.error?.message ?? (typeof reply.detail === "string" ? reply.detail : null) ?? (typeof reply.error === "string" ? reply.error : "no reason given");
    throw new Error(`The reviewer refused the section${reply.httpStatus ? ` (${reply.httpStatus})` : ""}: ${why}`);
  }
  return { responseId: reply.responseId, draftId };
}

/** Ask whether the review is done. `done: false` = still thinking. Throws when it failed. */
export async function pollSectionReview(input: { projectId: string; draftId: string; responseId: string }): Promise<{ done: false } | { done: true; review: unknown; model: string | null; costUsd: number | null }> {
  const reply = await callAstra({ projectId: input.projectId, draftId: input.draftId, partId: "section", mode: "poll", responseId: input.responseId });
  const status = String(reply.status ?? "");
  if (status === "completed") {
    if (!reply.review) throw new Error("The reviewer answered, but not in a form that could be read");
    return { done: true, review: reply.review, model: typeof reply.model === "string" ? reply.model : null, costUsd: typeof reply.actualCostUsd === "number" ? reply.actualCostUsd : null };
  }
  if (status === "queued" || status === "in_progress" || status === "unknown" || status === "") return { done: false };
  const detail = reply.detail as { message?: string; reason?: string } | null | undefined;
  throw new Error(`The review did not finish (${status}): ${detail?.message ?? detail?.reason ?? (typeof reply.error === "string" ? reply.error : "no reason given")}`);
}

// ---------------------------------------------------------------------------------------------------------------------
// The last review, kept on the project (treatment_json.astra_review)

/** The review kept on a project, or null when there is none (or it is not in a shape this reads). */
export function readStoredReview(projectJson: unknown): StoredSectionReview | null {
  const r = (projectJson as { astra_review?: Partial<StoredSectionReview> } | null | undefined)?.astra_review;
  if (!r || typeof r !== "object" || typeof r.at !== "string" || !Array.isArray(r.findings)) return null;
  const verdict = r.verdict === "pass" || r.verdict === "fail" ? r.verdict : "revise";
  return {
    at: r.at,
    from: Number(r.from) || 0,
    to: Number(r.to) || 0,
    model: typeof r.model === "string" ? r.model : null,
    costUsd: typeof r.costUsd === "number" ? r.costUsd : null,
    verdict,
    summary: String(r.summary ?? ""),
    strengths: (Array.isArray(r.strengths) ? r.strengths : []).map(String),
    release: String(r.release ?? ""),
    findings: r.findings as StoredSectionReview["findings"],
  };
}

/** Keep a review on the project. Only this key of the project's JSON is written. */
export async function saveStoredReview(projectId: string, review: StoredSectionReview): Promise<void> {
  const { data, error } = await supabase.from("video_projects").select("treatment_json").eq("id", projectId).single();
  if (error) throw new Error(`the review could not be saved: ${error.message}`);
  const base = data?.treatment_json && typeof data.treatment_json === "object" && !Array.isArray(data.treatment_json) ? (data.treatment_json as Record<string, unknown>) : {};
  const { error: upErr } = await supabase
    .from("video_projects")
    .update({ treatment_json: { ...base, astra_review: review } as never })
    .eq("id", projectId);
  if (upErr) throw new Error(`the review could not be saved: ${upErr.message}`);
}
