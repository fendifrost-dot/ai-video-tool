/**
 * From a writer's timed beats to the shot's events.
 *
 * Both writers (the treatment writer for the whole board, the scene writer for one shot) return change inside a shot
 * in one form (supabase/functions/_shared/timedBeats.ts). This is the one place that form becomes the shot record's
 * events — so a beat means the same thing whichever writer wrote it, and there is no second timing document.
 *
 * Pure module.
 */
import { acceptTimedBeats, type WrittenBeat } from "../../../supabase/functions/_shared/timedBeats";
import type { ShotEvent } from "@/lib/treatment/shotSpec";
import { sanitizeEvents } from "./events";

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * The events a writer's beats amount to, for a shot `shotSeconds` long in which `sung` is sung.
 * A beat that names words hangs on those words ONLY when they really are sung in the shot — otherwise it is a typed
 * time (a trigger that points at nothing would be shown to the director as a broken one he never wrote).
 */
export function eventsFromWritten(written: unknown, shotSeconds: number, sung = "", lightingKeys?: ReadonlySet<string> | null): ShotEvent[] {
  // a lighting state is kept only when it is one of the project's (when the caller knows which those are)
  const beats: WrittenBeat[] = acceptTimedBeats(written, shotSeconds, lightingKeys);
  const sungNorm = ` ${norm(sung)} `;
  return sanitizeEvents(
    beats.map((b, i) => {
      const words = b.on_words.trim();
      const hangs = words && sungNorm.includes(` ${norm(words)} `);
      return {
        id: `e${i + 1}`,
        at: b.at_seconds,
        trigger: hangs ? { kind: "lyric", ref: words } : { kind: "time", ref: "" },
        lighting: b.lighting,
        camera: b.camera,
        action: b.action,
        visual: b.picture,
        lightingState: b.lighting_state || null,
        effect: b.effect === "none" ? null : { type: b.effect, seconds: null, level: null },
      };
    }),
    shotSeconds,
  );
}
