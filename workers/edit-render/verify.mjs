// ffprobe check for a finished render: h264 + aac, yuv420p, duration > 0, moov atom before mdat (faststart).
import { spawnSync } from "node:child_process";
import { closeSync, openSync, readSync, statSync } from "node:fs";

/** Top-level MP4 atom types in file order. */
export function topLevelAtoms(file) {
  const fd = openSync(file, "r");
  const size = statSync(file).size;
  const out = [];
  const head = Buffer.alloc(16);
  let pos = 0;
  try {
    while (pos + 8 <= size && out.length < 64) {
      readSync(fd, head, 0, 16, pos);
      let len = head.readUInt32BE(0);
      const type = head.toString("latin1", 4, 8);
      if (len === 1) len = Number(head.readBigUInt64BE(8));
      else if (len === 0) len = size - pos;
      if (len < 8) break;
      out.push(type);
      pos += len;
    }
  } finally {
    closeSync(fd);
  }
  return out;
}

export function verifyMp4(file) {
  const run = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration,size:stream=codec_type,codec_name,pix_fmt,width,height",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8", timeout: 30_000 },
  );
  if (run.status !== 0) throw new Error(`ffprobe failed: ${String(run.stderr).trim()}`);
  const probe = JSON.parse(run.stdout);
  const streams = probe.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  const duration = Number(probe.format?.duration);
  const atoms = topLevelAtoms(file);
  const faststart = atoms.indexOf("moov") >= 0 && atoms.indexOf("moov") < atoms.indexOf("mdat");
  const problems = [];
  if (video?.codec_name !== "h264") problems.push("video is not h264");
  if (video?.pix_fmt !== "yuv420p") problems.push("pixel format is not yuv420p");
  if (audio?.codec_name !== "aac") problems.push("audio is not aac");
  if (!(duration > 0)) problems.push("duration is 0");
  if (!faststart) problems.push("moov is not before mdat");
  return {
    ok: problems.length === 0,
    problems,
    summary: {
      video: video
        ? {
            codec: video.codec_name,
            pixFmt: video.pix_fmt,
            width: video.width,
            height: video.height,
          }
        : null,
      audio: audio ? { codec: audio.codec_name } : null,
      durationSeconds: duration,
      bytes: Number(probe.format?.size) || statSync(file).size,
      atoms,
      faststart,
    },
  };
}
