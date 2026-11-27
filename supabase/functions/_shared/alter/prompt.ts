import { ALTER_CLOSE, ALTER_OPENINGS, getPreset } from "./catalog.ts";
import type { AlterPreset } from "./types.ts";

export type AlterPrompt = {
  ok: true;
  text: string;
  warnings: string[];
  performance: boolean;
};

const PERFORMANCE =
  "This is a performance. Keep the mouth's open and close timing identical to @Video1. Do not invent words, a new mouth shape, or generated speech. The original audio is put back afterwards.";

/**
 * Assemble the skill's opening, the preset's change line, and the close.
 * A performance appends the mouth rule. Slots the caller leaves empty stay as {key}.
 */
export function buildAlterPrompt(input: {
  preset: string;
  who: string;
  slots?: Record<string, string>;
  /** Rapping or sung. Default true: the mouth rule is on unless the caller turns it off. */
  performance?: boolean;
  style?: string;
  /** How many face photographs are attached after the target frame. They get their own @Image tags. */
  facePictures?: number;
  /** True when a target frame is attached: it is @Image1 and the face photographs follow it. */
  targetFrame?: boolean;
}): AlterPrompt | { ok: false; error: string } {
  const preset = getPreset(input.preset);
  if (!preset) return { ok: false, error: `No alter preset ${input.preset}.` };
  const who = input.who.trim();
  if (!who)
    return {
      ok: false,
      error: "Say who is in the take. Do not describe the thing you are changing.",
    };
  const performance = input.performance !== false;
  const warnings: string[] = [];
  if (performance && preset.check === "recast") {
    warnings.push(
      "This preset redraws who is on screen. On a rapping take the mouth score has to pass; a draft that fails is re-rolled.",
    );
  }
  if (preset.targetFrame === true && !input.targetFrame) {
    warnings.push(
      "This preset wants a target frame: one frame of the take with the change already in it.",
    );
  }
  const values: Record<string, string> = {
    who,
    style: input.style?.trim() || "the named style",
    ...(preset.opening === "A" ? { keep: "the clothes and the pose" } : {}),
  };
  for (const [key, value] of Object.entries(input.slots ?? {}))
    if (typeof value === "string") values[key] = value;
  const openingKey = preset.mode === "restyle" ? "R" : preset.opening;
  const fill = (text: string) =>
    text.replace(/\{(\w+)\}/g, (_, key: string) =>
      Object.prototype.hasOwnProperty.call(values, key) ? values[key] : `{${key}}`,
    );
  const opening = fill(ALTER_OPENINGS[openingKey] ?? ALTER_OPENINGS[preset.opening]);
  const change = fill(preset.change);
  const close = ALTER_CLOSE[openingKey] ?? ALTER_CLOSE[preset.opening];
  const parts = [opening, change, close];
  if (performance) parts.push(PERFORMANCE);
  const faces = Math.min(8, Math.max(0, Math.floor(input.facePictures ?? 0)));
  if (faces > 0) {
    const first = input.targetFrame ? 2 : 1;
    const tags = Array.from({ length: faces }, (_, index) => `@Image${first + index}`);
    const list =
      tags.length > 1 ? `${tags.slice(0, -1).join(", ")} and ${tags[tags.length - 1]}` : tags[0];
    parts.push(
      `${who.charAt(0).toUpperCase()}${who.slice(1)} is the person in the photograph${faces > 1 ? "s" : ""} ${list}: the same face, unchanged.`,
    );
  }
  const unfilled = [...parts.join(" ").matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
  if (unfilled.length)
    warnings.push(`Fill these before sending: ${[...new Set(unfilled)].join(", ")}.`);
  return { ok: true, text: parts.join("\n\n"), warnings, performance };
}
