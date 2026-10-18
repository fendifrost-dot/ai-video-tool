/**
 * Transcode a camera master into a reference file the project can store, and KEEP the audio.
 *
 * The stored YSL takes (hero_clip_4k.mov, hero_clip_h264.mp4, hero_clip_hd_1080.mp4) have no audio track.
 * The recipe that produced them passed `-an` (CURSOR_HANDOFF_hero_clip_trim.md, 2026-06-29) to stay under the
 * old 50 MB upload cap. A file with no audio cannot be lined up to the song. This argv is the replacement:
 * picture is re-encoded, the soundtrack is AAC.
 */
export function referenceTranscodeArgs(input: {
  inputPath: string;
  outputPath: string;
  crf?: number;
}): string[] {
  return [
    "ffmpeg",
    "-y",
    "-i",
    input.inputPath,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    String(input.crf ?? 20),
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    input.outputPath,
  ];
}

/** True when an ffmpeg argv throws the audio away. */
export function transcodeDropsAudio(args: readonly string[]): boolean {
  return args.includes("-an");
}
