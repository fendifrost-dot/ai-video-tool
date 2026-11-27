import type { CameraMove, Likeness, SubjectMode } from "./types.ts";

export type PromptBlocks = {
  goal: string;
  roles: string;
  subjects: string;
  camera: string;
  consistency: string;
};

export type CameraPrompt = {
  ok: true;
  mode: SubjectMode;
  text: string;
  blocks: PromptBlocks;
  warnings: string[];
};

export type PromptFailure = { ok: false; error: string };

const ORDER = [
  "【Generation Goal】",
  "【Reference Asset Roles】",
  "【Subjects and Relationships】",
  "【Camera and Event Script】",
  "【Maintain Consistency】",
] as const;

/**
 * Five-part prompt in the order from Berati's prompt anatomy (MIT).
 * The default is an environment plate. A performance does not ask the model
 * to draw him. A non-performance shot may, and then only with a likeness gate
 * and a mouth that stays at rest.
 */
export function buildCameraPrompt(input: {
  move: CameraMove;
  mode?: SubjectMode;
  place: string;
  likeness?: Likeness | null;
  faceImage?: boolean;
}): CameraPrompt | PromptFailure {
  const mode: SubjectMode = input.mode ?? "environment";
  const place = input.place.trim();
  if (!place)
    return { ok: false, error: "Describe the place. The reference clip does not carry the set." };
  if (
    mode === "non_performance" &&
    input.likeness !== "face_check" &&
    input.likeness !== "put_back"
  ) {
    return {
      ok: false,
      error:
        "A shot that generates him needs likeness face_check or put_back. Performance plates stay environment-only.",
    };
  }
  const warnings: string[] = [];
  if (input.move.studyOnly) {
    warnings.push(
      `${input.move.id} is a camera study in the source library. The author says not to send a locked or static frame as a reference.`,
    );
  }
  if ((mode === "environment" || mode === "performance_plate") && input.faceImage) {
    warnings.push(
      "The face photo is left off this request. An environment plate must not give the model his face to redraw.",
    );
  }

  const who =
    mode === "non_performance"
      ? "One person stands where the capsule stood, mouth at rest, not rapping and not singing. No lyric and no lip-sync."
      : "No person, face, mouth, or body is generated.";

  const goal =
    mode === "performance_plate"
      ? `Generate a live-action environment plate in one take, for a performance that will be composited from original footage. The place is ${place}. The camera move is ${input.move.name}: ${input.move.says} ${who}`
      : mode === "non_performance"
        ? `Generate a live-action shot in one take. The place is ${place}. The camera move is ${input.move.name}: ${input.move.says} ${who}`
        : `Generate a live-action environment plate in one take. The place is ${place}. The camera move is ${input.move.name}: ${input.move.says} ${who}`;

  const faceRole =
    mode === "non_performance"
      ? input.likeness === "put_back"
        ? " @Image1 is used only as a likeness guide. His original face pixels are composited back over the generated face before this shot is used. Ignore the photo's background, lighting, and clothes."
        : " @Image1 is used only as a likeness guide for facial features. The shot is not final until that face passes the same face check as his original photographs. Ignore the photo's background, lighting, and clothes. The mouth stays at rest."
      : "";

  const performanceRole =
    mode === "performance_plate"
      ? " This plate is the background only. The performer is composited afterwards from his original footage. His face and his mouth stay those pixels. Do not draw him."
      : "";

  const roles = `@Video1 is a coarse-blockout reference: a grey clay set in which a person, if any, is replaced by a tall rounded capsule with loud diagonal stripes. Use it for the camera: positions, movements, lens feel, framing, shot size and their timing. The capsule carries no body. Never show a capsule. Do not adopt its grey clay set or its stand-in shapes. ${who}${performanceRole}${faceRole} The set in @Video1 is only a layout of crude placeholders: rebuild every wall, window, piece of furniture, vehicle and prop as a real, fully detailed object of the same size in the same place, with real materials, textures, wear and dirt. Plain blocks become real stone, brick, wood, tile or metal. No cone, sphere, plain box or untextured surface appears in the final video. The capsule's stripes are only a label: no surface takes those colours, and no striped capsule appears at any moment.`;

  const subjects = `${place} Wear, dirt, and the real materials are in this description, not in the grey blockout. The striped capsule in @Video1 is not a person and does not appear. ${input.move.use}`;

  const motion =
    mode === "non_performance"
      ? "Any action is natural human motion with real weight, and the mouth stays closed. A real human has natural skin, hair and clothing; no mannequin, clay figure, capsule or doll appears anywhere."
      : "No mannequin, clay figure, capsule, doll, face, or body appears anywhere.";
  const camera = `${input.move.name}. ${input.move.numbers} ${input.move.says} The blockout in @Video1 decides where the camera goes and when. ${input.move.avoid} ${motion} The final picture is live-action and photographic: photoreal, natural grain, motivated light, real haze.`;

  const likenessLine =
    mode === "non_performance"
      ? input.likeness === "put_back"
        ? " His original face pixels are put back before the shot is used."
        : " The face must pass the same face check as his photographs."
      : " Do not invent a performer.";

  const consistency = `Keep the place, the light, and this camera move from the first frame to the last. The person, if one is generated, stays the same size and facing the blockout shows. Keep the lighting and time of day constant from start to end.${likenessLine} There is no music of any kind.`;

  const blocks: PromptBlocks = { goal, roles, subjects, camera, consistency };
  const text = [blocks.goal, blocks.roles, blocks.subjects, blocks.camera, blocks.consistency]
    .map((body, index) => `${ORDER[index]}\n${body}`)
    .join("\n\n");
  return { ok: true, mode, text, blocks, warnings };
}
