// In-app cut model. Pure: no Deno, no network, no provider calls.
//
// A sequence is an edit of a project/variation. It stores each clip's source in/out (where in the file)
// separately from its place on the timeline, so a cut can be slipped against the song and exported to
// Premiere the way the YSL cold-open was built. It does not write shots, takes, or slip_seconds — that
// board alignment stays in lyricSync / shot_asset_assignments.

export const EDIT_FPS = 24;
export const MEDIA_ROOT = "__MEDIA_ROOT__";
export const YSL_PROJECT_ID = "764a63d2-93cd-44f3-905f-292f14ab2f51";
export const YSL_VARIATION_ID = "c067efb9-90af-418e-aa6d-58834f6e19de";

export const TRANSITIONS = ["cut", "crossfade", "dip", "whip", "flash"] as const;
export type EditTransition = (typeof TRANSITIONS)[number];
export const TRACKS = ["V1", "A1", "A2"] as const;
export type EditTrack = (typeof TRACKS)[number];
export const LABEL_COLORS = ["Rose", "Mango", "Iris", "Lavender"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number] | string;
export const MARKER_KINDS = ["beat", "lyric", "lipsync", "comment"] as const;
export type MarkerKind = (typeof MARKER_KINDS)[number];

export type EditClip = {
  id: string;
  track: EditTrack;
  order: number;
  shotId: string | null;
  shotKey: string | null;
  assetId: string | null;
  name: string;
  fileName: string | null;
  sourceIn: number;
  sourceOut: number;
  timelineIn: number;
  timelineOut: number;
  speed: number;
  transition: EditTransition;
  transitionSeconds: number;
  labelColor: string | null;
  placeholder: boolean;
  comment: string;
  enabled: boolean;
  /** Length of the source file, seconds. Null when unknown. */
  mediaDuration: number | null;
  /**
   * Whose mouth this picture is. `camera`: a real take, or a dress retimed to one — a sync offset moves the mouth.
   * `model`: a montage or restage — the mouth is generated and an offset will not line it up.
   */
  mouth: "camera" | "model" | null;
};

export type EditMarker = {
  id: string;
  clipId: string | null;
  kind: MarkerKind;
  name: string;
  comment: string;
  timeIn: number;
  timeOut: number | null;
};

export type EditSequence = {
  id: string;
  projectId: string;
  variationId: string | null;
  name: string;
  version: number;
  parentId: string | null;
  fps: number;
  width: number;
  height: number;
  songAssetId: string | null;
  songOffset: number;
  songName: string;
  songFile: string;
  songDuration: number;
  notes: string;
  clips: EditClip[];
  markers: EditMarker[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function secondsToFrames(seconds: number, fps: number): number {
  if (!(fps > 0)) return 0;
  return Math.round(seconds * fps);
}

export function framesToSeconds(frames: number, fps: number): number {
  if (!(fps > 0)) return 0;
  return frames / fps;
}

export function videoClips(seq: EditSequence): EditClip[] {
  return seq.clips
    .filter((c) => c.track === "V1" && c.enabled)
    .sort((a, b) => a.timelineIn - b.timelineIn || a.order - b.order);
}

export function durationFrames(seq: EditSequence): number {
  const ends = seq.clips
    .filter((c) => c.enabled)
    .map((c) => secondsToFrames(c.timelineOut, seq.fps));
  return ends.length ? Math.max(...ends) : 0;
}

export function durationSeconds(seq: EditSequence): number {
  return framesToSeconds(durationFrames(seq), seq.fps);
}

function clip(
  partial: Partial<EditClip> &
    Pick<EditClip, "id" | "name" | "timelineIn" | "timelineOut" | "sourceIn" | "sourceOut">,
): EditClip {
  return {
    track: "V1",
    order: 0,
    shotId: null,
    shotKey: null,
    assetId: null,
    fileName: null,
    speed: 1,
    transition: "cut",
    transitionSeconds: 0,
    labelColor: null,
    placeholder: false,
    comment: "",
    enabled: true,
    mediaDuration: null,
    mouth: null,
    ...partial,
  };
}

export function emptySequence(input: {
  projectId: string;
  variationId?: string | null;
  name: string;
  id?: string;
  fps?: number;
  width?: number;
  height?: number;
}): EditSequence {
  return {
    id: input.id ?? crypto.randomUUID(),
    projectId: input.projectId,
    variationId: input.variationId ?? null,
    name: input.name,
    version: 1,
    parentId: null,
    fps: input.fps ?? EDIT_FPS,
    width: input.width ?? 720,
    height: input.height ?? 1280,
    songAssetId: null,
    songOffset: 0,
    songName: "",
    songFile: "song_master_24bit.wav",
    songDuration: 0,
    notes: "",
    clips: [],
    markers: [],
  };
}

function quantizeClip(c: EditClip, fps: number): EditClip {
  const q = (s: number) => framesToSeconds(secondsToFrames(s, fps), fps);
  return {
    ...c,
    sourceIn: q(c.sourceIn),
    sourceOut: q(c.sourceOut),
    timelineIn: q(c.timelineIn),
    timelineOut: q(c.timelineOut),
  };
}

// ---------------------------------------------------------------------------------------------------------- csv

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }
  return rows;
}

const truthy = (v: string) => /^(true|1|yes)$/i.test(v.trim());

/**
 * The machine EDL (edl_v1_coldopen.csv). Times are quantized to `fps` so they land on the same frames
 * as the Premiere XML. Song offset is the first row's song-in, in frames, minus its timeline-in.
 */
export function importEdlCsv(
  csv: string,
  meta: {
    projectId: string;
    variationId?: string | null;
    name?: string;
    fps?: number;
    width?: number;
    height?: number;
  },
): EditSequence {
  const fps = meta.fps ?? EDIT_FPS;
  const rows = parseCsv(csv);
  const header = rows[0]?.map((h) => h.trim()) ?? [];
  const idx = (name: string) => header.indexOf(name);
  const col = {
    tlIn: idx("tl_in_s"),
    tlOut: idx("tl_out_s"),
    songIn: idx("song_in"),
    shot: idx("shot"),
    mode: idx("mode"),
    asset: idx("asset_id"),
    file: idx("file"),
    srcIn: idx("src_in_s"),
    srcOut: idx("src_out_s"),
    pending: idx("lipsync_pending"),
    label: idx("label"),
  };
  if (col.tlIn < 0 || col.srcIn < 0 || col.shot < 0)
    throw new Error("EDL is missing tl_in_s, src_in_s or shot");
  const num = (row: string[], i: number) => Number(row[i] ?? "");
  const data = rows.slice(1).filter((r) => r[col.shot]?.trim());
  const first = data[0];
  const songOffsetFrames = first
    ? secondsToFrames(num(first, col.songIn), fps) - secondsToFrames(num(first, col.tlIn), fps)
    : 0;
  const seq = emptySequence({
    projectId: meta.projectId,
    variationId: meta.variationId,
    name: meta.name ?? "Imported EDL",
    fps,
    width: meta.width,
    height: meta.height,
  });
  seq.songOffset = framesToSeconds(songOffsetFrames, fps);
  seq.songName = "YSL (Ice On) - album master";
  seq.songDuration = framesToSeconds(4844, fps);
  const media = framesToSeconds(97, fps);
  seq.clips = data.map((row, order) => {
    const shotKey = row[col.shot]!.trim();
    const pending = truthy(row[col.pending] ?? "");
    const mode = (row[col.mode] ?? "").trim();
    const name = pending
      ? `LIPSYNC PENDING ${shotKey}`
      : mode === "sync"
        ? `${shotKey} sync`
        : `${shotKey} b-roll`;
    const labelColor = pending ? "Rose" : mode === "sync" ? "Mango" : "Iris";
    const comment = row[col.label] ?? "";
    const c = quantizeClip(
      clip({
        id: `v-${order + 1}`,
        order: order + 1,
        shotKey,
        assetId: row[col.asset]?.trim() || null,
        name,
        fileName: row[col.file]?.trim() || null,
        sourceIn: num(row, col.srcIn),
        sourceOut: num(row, col.srcOut),
        timelineIn: num(row, col.tlIn),
        timelineOut: num(row, col.tlOut),
        labelColor,
        placeholder: pending,
        comment,
        mediaDuration: media,
        mouth: pending ? "camera" : mode === "sync" ? "model" : null,
      }),
      fps,
    );
    return c;
  });
  seq.markers = seq.clips
    .filter((c) => c.placeholder)
    .map((c, i) => ({
      id: `m-${i + 1}`,
      clipId: null,
      kind: "lipsync" as const,
      name: c.name,
      comment: c.comment,
      timeIn: c.timelineIn,
      timeOut: c.timelineOut,
    }));
  addSongAudio(seq);
  return seq;
}

function addSongAudio(seq: EditSequence) {
  const end = durationSeconds(seq);
  const srcIn = seq.songOffset;
  const srcOut = seq.songOffset + end;
  for (const [track, order] of [
    ["A1", 1],
    ["A2", 2],
  ] as const) {
    seq.clips.push(
      clip({
        id: `a-${track}`,
        track,
        order,
        name: seq.songName || "Song",
        fileName: seq.songFile,
        sourceIn: srcIn,
        sourceOut: srcOut,
        timelineIn: 0,
        timelineOut: end,
        mediaDuration: seq.songDuration || null,
        comment: "song",
      }),
    );
  }
}

// ---------------------------------------------------------------------------------------------------------- xml

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inner(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? decodeXml(m[1]!) : null;
}

function blocksBetween(xml: string, open: string, close: string): string[] {
  const out: string[] = [];
  let from = 0;
  while (from < xml.length) {
    const start = xml.indexOf(open, from);
    if (start < 0) break;
    const end = xml.indexOf(close, start);
    if (end < 0) break;
    out.push(xml.slice(start, end + close.length));
    from = end + close.length;
  }
  return out;
}

/**
 * First `<tag>…</tag>` whose close belongs to this open. FCP7 nests the same tag inside `<file><media>`
 * (`<video>` sample characteristics, `<audio>` on the song), so the first close in the document is not the
 * sequence track's close.
 */
function sliceElement(xml: string, tag: string, from = 0): string {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = xml.indexOf(open, from);
  if (start < 0) return "";
  let depth = 1;
  let i = start + open.length;
  while (i < xml.length && depth > 0) {
    const nextOpen = xml.indexOf(open, i);
    const nextClose = xml.indexOf(close, i);
    if (nextClose < 0) return xml.slice(start);
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + open.length;
    } else {
      depth -= 1;
      i = nextClose + close.length;
    }
  }
  return xml.slice(start, i);
}

type FileRec = { id: string; name: string; durationFrames: number };

function fileMap(xml: string): Map<string, FileRec> {
  const map = new Map<string, FileRec>();
  const re = /<file id="([^"]+)">([\s\S]*?)<\/file>/g;
  for (const m of xml.matchAll(re)) {
    const body = m[2]!;
    map.set(m[1]!, {
      id: m[1]!,
      name: inner(body, "name") ?? "",
      durationFrames: Number(inner(body, "duration") ?? "0") || 0,
    });
  }
  return map;
}

function shotKeyOf(name: string, fileName: string): string | null {
  return name.match(/c\d{3}/)?.[0] ?? fileName.match(/c\d{3}/)?.[0] ?? null;
}

function assetIdOf(comment: string): string | null {
  return (
    comment.match(/asset ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1] ??
    null
  );
}

/** FCP7 xmeml (the attached ysl_ice_on_v1.xml). One sequence per `<sequence>`. */
export function importXmeml(
  xml: string,
  meta: { projectId: string; variationId?: string | null },
): EditSequence[] {
  const files = fileMap(xml);
  return blocksBetween(xml, "<sequence ", "</sequence>").map((block, si) => {
    const fps = Number(inner(block, "timebase") ?? String(EDIT_FPS)) || EDIT_FPS;
    const media = sliceElement(block, "media");
    const video = sliceElement(media, "video");
    const audio = sliceElement(media, "audio");
    const afterMedia = media ? block.slice(block.indexOf(media) + media.length) : "";
    const seq = emptySequence({
      projectId: meta.projectId,
      variationId: meta.variationId,
      name: inner(block, "name") ?? `Sequence ${si + 1}`,
      id: `seq-${si + 1}`,
      fps,
      width: Number(inner(video, "width") ?? "720") || 720,
      height: Number(inner(video, "height") ?? "1280") || 1280,
    });
    const clipItems = blocksBetween(video, "<clipitem ", "</clipitem>");
    seq.clips = clipItems.map((item, order) => clipFromItem(item, order, fps, files, "V1"));
    const audioItems = blocksBetween(audio, "<clipitem ", "</clipitem>");
    audioItems.forEach((item, i) => {
      const track = i === 0 ? "A1" : "A2";
      seq.clips.push(clipFromItem(item, i + 1, fps, files, track));
    });
    const song = seq.clips.find((c) => c.track === "A1");
    if (song) {
      seq.songOffset = song.sourceIn;
      seq.songFile = song.fileName || seq.songFile;
      seq.songName = song.name;
      seq.songDuration = song.mediaDuration ?? seq.songDuration;
    }
    const seqMarkers = blocksBetween(
      afterMedia.replace(/<clipitem[\s\S]*?<\/clipitem>/g, ""),
      "<marker>",
      "</marker>",
    );
    seq.markers = seqMarkers.map((m, i) => markerFromXml(m, i, fps, null));
    return seq;
  });
}

function clipFromItem(
  item: string,
  order: number,
  fps: number,
  files: Map<string, FileRec>,
  track: EditTrack,
): EditClip {
  const fileId = item.match(/<file id="([^"]+)"/)?.[1] ?? "";
  const file = files.get(fileId);
  const name = inner(item, "name") ?? file?.name ?? `clip ${order + 1}`;
  const comment = inner(item, "mastercomment1") ?? "";
  const label = inner(item, "label2");
  const start = Number(inner(item, "start") ?? "0");
  const end = Number(inner(item, "end") ?? "0");
  const inn = Number(inner(item, "in") ?? "0");
  const out = Number(inner(item, "out") ?? "0");
  const placeholder = name.startsWith("LIPSYNC PENDING");
  const c = clip({
    id: `${track}-${order + 1}`,
    track,
    order: order + 1,
    shotKey: track === "V1" ? shotKeyOf(name, file?.name ?? "") : null,
    assetId: assetIdOf(comment),
    name,
    fileName: file?.name || null,
    sourceIn: framesToSeconds(inn, fps),
    sourceOut: framesToSeconds(out, fps),
    timelineIn: framesToSeconds(start, fps),
    timelineOut: framesToSeconds(end, fps),
    labelColor: label,
    placeholder,
    comment,
    mediaDuration: file ? framesToSeconds(file.durationFrames, fps) : null,
  });
  return c;
}

function markerFromXml(
  block: string,
  index: number,
  fps: number,
  clipId: string | null,
): EditMarker {
  const inn = Number(inner(block, "in") ?? "0");
  const out = Number(inner(block, "out") ?? "-1");
  const name = inner(block, "name") ?? "marker";
  return {
    id: `mk-${index + 1}-${inn}`,
    clipId,
    kind: name.startsWith("LIPSYNC") ? "lipsync" : "comment",
    name,
    comment: inner(block, "comment") ?? "",
    timeIn: framesToSeconds(inn, fps),
    timeOut: out >= 0 ? framesToSeconds(out, fps) : null,
  };
}

export function importEdit(
  text: string,
  meta: { projectId: string; variationId?: string | null; name?: string },
): EditSequence[] {
  const trimmed = text.trim();
  if (trimmed.startsWith("<")) return importXmeml(trimmed, meta);
  return [importEdlCsv(trimmed, meta)];
}

// ------------------------------------------------------------------------------------------------------- export

function rateXml(fps: number): string {
  return `<rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>`;
}

function fileXml(
  id: string,
  file: FileRec,
  fps: number,
  width: number,
  height: number,
  audio: boolean,
): string {
  const media = audio
    ? `<media><audio><samplecharacteristics><depth>24</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio></media>`
    : `<media><video><samplecharacteristics>${rateXml(fps)}<width>${width}</width><height>${height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video></media>`;
  return `<file id="${escapeXml(id)}"><name>${escapeXml(file.name)}</name><pathurl>file://localhost/${MEDIA_ROOT}/${escapeXml(file.name)}</pathurl>${rateXml(fps)}<duration>${file.durationFrames}</duration><timecode>${rateXml(fps)}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>${media}</file>`;
}

/** FCP7 xmeml v4, same shape as ysl_ice_on_v1.xml: V1 picture, A1/A2 song, labels, comments, markers. */
export function exportXmeml(sequences: readonly EditSequence[], projectName = "AVT cut"): string {
  const body = sequences.map((seq) => exportSequence(seq)).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="4"><project><name>${escapeXml(projectName)}</name><children>${body}</children></project></xmeml>\n`;
}

function exportSequence(seq: EditSequence): string {
  const fps = seq.fps;
  const dur = durationFrames(seq);
  const videos = videoClips(seq);
  const emitted = new Set<string>();
  const fileId = (c: EditClip) => {
    if (c.track !== "V1") return "file-song";
    return `file-${c.shotKey ?? c.fileName ?? c.id}`;
  };
  const videoXml = videos
    .map((c, i) => {
      const id = fileId(c);
      const frames = c.mediaDuration != null ? secondsToFrames(c.mediaDuration, fps) : 97;
      const rec: FileRec = {
        id,
        name: c.fileName || `${c.shotKey ?? "clip"}.mp4`,
        durationFrames: frames,
      };
      const file = emitted.has(id)
        ? `<file id="${escapeXml(id)}"/>`
        : fileXml(id, rec, fps, seq.width, seq.height, false);
      emitted.add(id);
      const marker = c.placeholder
        ? `<marker><name>${escapeXml(c.name)}</name><comment>${escapeXml(`Swap in the fixed lip-sync take for ${c.shotKey ?? c.name}; keep source in synced to song ${(seq.songOffset + c.timelineIn).toFixed(2)} s`)}</comment><in>${secondsToFrames(c.sourceIn, fps)}</in><out>-1</out></marker>`
        : "";
      const note = [
        c.comment,
        c.assetId ? `asset ${c.assetId}` : "",
        `src ${c.sourceIn.toFixed(3)}-${c.sourceOut.toFixed(3)}s`,
        `song ${(seq.songOffset + c.timelineIn).toFixed(2)}-${(seq.songOffset + c.timelineOut).toFixed(2)}s`,
        c.transition !== "cut" ? `${c.transition} ${c.transitionSeconds}s` : "",
      ]
        .filter(Boolean)
        .join(" | ");
      return `<clipitem id="${escapeXml(seq.id)}-v${i + 1}"><name>${escapeXml(c.name)}</name><enabled>TRUE</enabled><duration>${frames}</duration>${rateXml(fps)}<start>${secondsToFrames(c.timelineIn, fps)}</start><end>${secondsToFrames(c.timelineOut, fps)}</end><in>${secondsToFrames(c.sourceIn, fps)}</in><out>${secondsToFrames(c.sourceOut, fps)}</out>${file}${c.labelColor ? `<labels><label2>${escapeXml(c.labelColor)}</label2></labels>` : ""}<comments><mastercomment1>${escapeXml(note)}</mastercomment1></comments>${marker}</clipitem>`;
    })
    .join("");
  const songFrames = secondsToFrames(seq.songDuration || 201.87, fps) || 4844;
  const songRec: FileRec = {
    id: "file-song",
    name: seq.songFile || "song_master_24bit.wav",
    durationFrames: songFrames,
  };
  const audios = (["A1", "A2"] as const).map((track, i) => {
    const c = seq.clips.find((x) => x.track === track);
    const srcIn = secondsToFrames(c?.sourceIn ?? seq.songOffset, fps);
    const srcOut = secondsToFrames(c?.sourceOut ?? seq.songOffset + durationSeconds(seq), fps);
    const file =
      i === 0
        ? fileXml("file-song", songRec, fps, seq.width, seq.height, true)
        : `<file id="file-song"/>`;
    return `<clipitem id="${escapeXml(seq.id)}-${track.toLowerCase()}"><name>${escapeXml(seq.songName || "Song")}</name><enabled>TRUE</enabled><duration>${songFrames}</duration>${rateXml(fps)}<start>0</start><end>${dur}</end><in>${srcIn}</in><out>${srcOut}</out>${file}<sourcetrack><mediatype>audio</mediatype><trackindex>${i + 1}</trackindex></sourcetrack></clipitem>`;
  });
  const markers = seq.markers
    .map(
      (m) =>
        `<marker><name>${escapeXml(m.name)}</name><comment>${escapeXml(m.comment)}</comment><in>${secondsToFrames(m.timeIn, fps)}</in><out>${m.timeOut == null ? -1 : secondsToFrames(m.timeOut, fps)}</out></marker>`,
    )
    .join("");
  return `<sequence id="${escapeXml(seq.id)}"><name>${escapeXml(seq.name)}</name><duration>${dur}</duration>${rateXml(fps)}<timecode>${rateXml(fps)}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode><media><video><format><samplecharacteristics>${rateXml(fps)}<width>${seq.width}</width><height>${seq.height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance><colordepth>24</colordepth></samplecharacteristics></format><track>${videoXml}<enabled>TRUE</enabled><locked>FALSE</locked></track></video><audio><numOutputChannels>2</numOutputChannels><format><samplecharacteristics><depth>24</depth><samplerate>48000</samplerate></samplecharacteristics></format><track>${audios[0]}<enabled>TRUE</enabled><locked>FALSE</locked><outputchannelindex>1</outputchannelindex></track><track>${audios[1]}<enabled>TRUE</enabled><locked>FALSE</locked><outputchannelindex>2</outputchannelindex></track></audio></media>${markers}</sequence>`;
}

// ----------------------------------------------------------------------------------------------------- gestures

export type Gesture =
  | { kind: "slip"; clipId: string; deltaFrames: number }
  | { kind: "move"; clipId: string; deltaFrames: number; ripple: boolean }
  | { kind: "trim"; clipId: string; edge: "in" | "out"; deltaFrames: number; ripple: boolean };

const MIN_FRAMES = 1;

function mapClip(seq: EditSequence, id: string, fn: (c: EditClip) => EditClip): EditSequence {
  return { ...seq, clips: seq.clips.map((c) => (c.id === id ? fn(c) : c)) };
}

/** Shift clips on the same track that start at or after `atOrAfter` (seconds). */
function shiftFrom(
  seq: EditSequence,
  track: EditTrack,
  exceptId: string,
  atOrAfter: number,
  deltaFrames: number,
): EditSequence {
  if (deltaFrames === 0) return seq;
  const delta = framesToSeconds(deltaFrames, seq.fps);
  return {
    ...seq,
    clips: seq.clips.map((c) => {
      if (c.track !== track || c.id === exceptId) return c;
      if (c.timelineIn + 1e-6 < atOrAfter) return c;
      return { ...c, timelineIn: c.timelineIn + delta, timelineOut: c.timelineOut + delta };
    }),
  };
}

/**
 * Slip moves the source window and leaves the cut on the song.
 * Trim-in with ripple keeps the timeline start, drops or extends the head, and pulls later clips with the tail.
 * Trim-out changes the tail. Move slides the clip on the song; ripple carries everything after it.
 */
export function applyGesture(seq: EditSequence, g: Gesture): EditSequence {
  const target = seq.clips.find((c) => c.id === g.clipId);
  if (!target || target.track !== "V1") return seq;
  const fps = seq.fps;
  const at = (frames: number) => framesToSeconds(frames, fps);
  const tin = secondsToFrames(target.timelineIn, fps);
  const tout = secondsToFrames(target.timelineOut, fps);
  const sin = secondsToFrames(target.sourceIn, fps);
  const sout = secondsToFrames(target.sourceOut, fps);
  const speed = target.speed > 0 ? target.speed : 1;
  if (g.kind === "slip") {
    let d = g.deltaFrames;
    if (sin + d < 0) d = -sin;
    if (sout + d - (sin + d) < MIN_FRAMES) return seq;
    return mapClip(seq, target.id, (c) => ({
      ...c,
      sourceIn: at(sin + d),
      sourceOut: at(sout + d),
    }));
  }
  if (g.kind === "move") {
    let d = g.deltaFrames;
    if (tin + d < 0) d = -tin;
    const next = mapClip(seq, target.id, (c) => ({
      ...c,
      timelineIn: at(tin + d),
      timelineOut: at(tout + d),
    }));
    return g.ripple ? shiftFrom(next, target.track, target.id, target.timelineIn, d) : next;
  }
  if (g.edge === "in" && g.ripple) {
    let d = g.deltaFrames;
    if (tout - tin - d < MIN_FRAMES) d = tout - tin - MIN_FRAMES;
    if (sin + Math.round(d * speed) < 0) d = -Math.floor(sin / speed);
    const next = mapClip(seq, target.id, (c) => ({
      ...c,
      sourceIn: at(sin + Math.round(d * speed)),
      timelineOut: at(tout - d),
    }));
    return shiftFrom(next, target.track, target.id, target.timelineOut, -d);
  }
  if (g.edge === "in") {
    let d = g.deltaFrames;
    if (tin + d < 0) d = -tin;
    if (tout - (tin + d) < MIN_FRAMES) d = tout - tin - MIN_FRAMES;
    if (sin + Math.round(d * speed) < 0) d = -Math.floor(sin / speed);
    return mapClip(seq, target.id, (c) => ({
      ...c,
      timelineIn: at(tin + d),
      sourceIn: at(Math.max(0, sin + Math.round(d * speed))),
    }));
  }
  let d = g.deltaFrames;
  if (tout + d - tin < MIN_FRAMES) d = tin + MIN_FRAMES - tout;
  const next = mapClip(seq, target.id, (c) => ({
    ...c,
    timelineOut: at(tout + d),
    sourceOut: at(Math.max(sin + MIN_FRAMES, sout + Math.round(d * speed))),
  }));
  return g.ripple ? shiftFrom(next, target.track, target.id, target.timelineOut, d) : next;
}

/** Nearest target, in frames, within the threshold. Timeline edges snap; a slip does not (the cut stays on the beat). */
export function snapFrame(
  frame: number,
  targets: readonly number[],
  thresholdFrames: number,
): number {
  let best = frame;
  let bestDist = thresholdFrames + 1;
  for (const t of targets) {
    const d = Math.abs(t - frame);
    if (d < bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return bestDist <= thresholdFrames ? best : frame;
}

export function snapTargets(input: {
  fps: number;
  songOffset: number;
  beats: readonly number[];
  lyricTimes: readonly number[];
}): number[] {
  const toFrame = (songSeconds: number) =>
    secondsToFrames(songSeconds - input.songOffset, input.fps);
  return [...input.beats, ...input.lyricTimes].map(toFrame);
}

/**
 * Drop a new take on a placeholder (or any clip) without moving the cut or the source window.
 * Clearing the placeholder renames `LIPSYNC PENDING cXXX` back to the shot key.
 */
export function replaceTake(
  seq: EditSequence,
  clipId: string,
  next: {
    assetId: string | null;
    fileName: string | null;
    mediaDuration?: number | null;
    clearPlaceholder?: boolean;
  },
): EditSequence {
  return mapClip(seq, clipId, (c) => {
    const clear = next.clearPlaceholder !== false && c.placeholder;
    return {
      ...c,
      assetId: next.assetId,
      fileName: next.fileName,
      mediaDuration: next.mediaDuration === undefined ? c.mediaDuration : next.mediaDuration,
      placeholder: clear ? false : c.placeholder,
      labelColor: clear && c.labelColor === "Rose" ? "Mango" : c.labelColor,
      name: clear && c.shotKey ? c.shotKey : c.name,
    };
  });
}

export function attachBoardRefs(
  seq: EditSequence,
  shots: readonly { id: string; spec_key: string | null }[],
  assets: readonly { id: string; durationSeconds: number | null }[],
): EditSequence {
  const byKey = new Map(shots.filter((s) => s.spec_key).map((s) => [s.spec_key!, s.id]));
  const byAsset = new Map(assets.map((a) => [a.id, a.durationSeconds]));
  return {
    ...seq,
    clips: seq.clips.map((c) => ({
      ...c,
      shotId: c.shotId ?? (c.shotKey ? (byKey.get(c.shotKey) ?? null) : null),
      mediaDuration: c.mediaDuration ?? (c.assetId ? (byAsset.get(c.assetId) ?? null) : null),
    })),
  };
}

export type MediaWarning = { clipId: string; shotKey: string | null; message: string };

/** The source out-point runs past the file, or the file is shorter than the timeline slot. */
export function mediaWarnings(seq: EditSequence): MediaWarning[] {
  const slack = 1 / seq.fps;
  const out: MediaWarning[] = [];
  for (const c of videoClips(seq)) {
    if (c.mediaDuration == null) continue;
    if (c.sourceOut > c.mediaDuration + slack) {
      out.push({
        clipId: c.id,
        shotKey: c.shotKey,
        message: `${c.name} runs ${(c.sourceOut - c.mediaDuration).toFixed(2)} s past the end of the file — extend the shot or generate a new take`,
      });
    }
    const played = (c.sourceOut - c.sourceIn) / (c.speed || 1);
    const slot = c.timelineOut - c.timelineIn;
    if (played + slack < slot) {
      out.push({
        clipId: c.id,
        shotKey: c.shotKey,
        message: `${c.name} is shorter than its timeline window (${played.toFixed(2)} s of picture for ${slot.toFixed(2)} s) — extend or generate a new take`,
      });
    }
    if (c.mouth === "model") {
      out.push({
        clipId: c.id,
        shotKey: c.shotKey,
        message: `${c.name}: the mouth is the model's. A sync offset will not line it up. Replace it with the camera take, or a dress retimed to that take.`,
      });
    }
  }
  return out;
}

export function commitSequence(seq: EditSequence, summary: string, at = new Date().toISOString()) {
  return {
    snapshot: seq,
    summary,
    at,
    versionNumber: seq.version,
    sequence: { ...seq, version: seq.version + 1 },
  };
}

export function withDatabaseIds(seq: EditSequence): EditSequence {
  const seqId = UUID_RE.test(seq.id) ? seq.id : crypto.randomUUID();
  const clipIds = new Map<string, string>();
  const clips = seq.clips.map((c) => {
    const id = UUID_RE.test(c.id) ? c.id : crypto.randomUUID();
    clipIds.set(c.id, id);
    return { ...c, id };
  });
  const markers = seq.markers.map((m) => ({
    ...m,
    id: UUID_RE.test(m.id) ? m.id : crypto.randomUUID(),
    clipId: m.clipId ? (clipIds.get(m.clipId) ?? (UUID_RE.test(m.clipId) ? m.clipId : null)) : null,
  }));
  return { ...seq, id: seqId, clips, markers };
}

type Row = Record<string, unknown>;

export function sequenceToRows(
  seq: EditSequence,
  userId: string,
): { sequence: Row; clips: Row[]; markers: Row[] } {
  const ready = withDatabaseIds(seq);
  return {
    sequence: {
      id: ready.id,
      user_id: userId,
      project_id: ready.projectId,
      variation_id: ready.variationId,
      name: ready.name,
      version_number: ready.version,
      parent_sequence_id: ready.parentId && UUID_RE.test(ready.parentId) ? ready.parentId : null,
      fps: ready.fps,
      width: ready.width,
      height: ready.height,
      song_asset_id: ready.songAssetId,
      song_offset_seconds: ready.songOffset,
      song_name: ready.songName,
      song_file: ready.songFile,
      song_duration_seconds: ready.songDuration,
      notes: ready.notes,
    },
    clips: ready.clips.map((c) => ({
      id: c.id,
      sequence_id: ready.id,
      user_id: userId,
      track: c.track,
      item_order: c.order,
      shot_id: c.shotId && UUID_RE.test(c.shotId) ? c.shotId : null,
      asset_id: c.assetId && UUID_RE.test(c.assetId) ? c.assetId : null,
      shot_key: c.shotKey,
      name: c.name,
      file_name: c.fileName,
      source_in_seconds: c.sourceIn,
      source_out_seconds: c.sourceOut,
      timeline_in_seconds: c.timelineIn,
      timeline_out_seconds: c.timelineOut,
      speed: c.speed,
      transition: c.transition,
      transition_seconds: c.transitionSeconds,
      label_color: c.labelColor,
      placeholder: c.placeholder,
      comment: c.comment,
      enabled: c.enabled,
      media_duration_seconds: c.mediaDuration,
      mouth: c.mouth,
    })),
    markers: ready.markers.map((m) => ({
      id: m.id,
      sequence_id: ready.id,
      clip_id: m.clipId,
      user_id: userId,
      kind: m.kind,
      name: m.name,
      comment: m.comment,
      time_in_seconds: m.timeIn,
      time_out_seconds: m.timeOut,
    })),
  };
}

const num = (v: unknown, fallback = 0) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown) => (typeof v === "string" && v ? v : null);

export function sequenceFromRows(sequence: Row, clips: Row[], markers: Row[]): EditSequence {
  const fps = num(sequence.fps, EDIT_FPS);
  return {
    id: str(sequence.id),
    projectId: str(sequence.project_id),
    variationId: strOrNull(sequence.variation_id),
    name: str(sequence.name),
    version: num(sequence.version_number, 1),
    parentId: strOrNull(sequence.parent_sequence_id),
    fps,
    width: num(sequence.width, 720),
    height: num(sequence.height, 1280),
    songAssetId: strOrNull(sequence.song_asset_id),
    songOffset: num(sequence.song_offset_seconds),
    songName: str(sequence.song_name),
    songFile: str(sequence.song_file),
    songDuration: num(sequence.song_duration_seconds),
    notes: str(sequence.notes),
    clips: clips
      .map((c) =>
        clip({
          id: str(c.id),
          track: (TRACKS as readonly string[]).includes(str(c.track))
            ? (str(c.track) as EditTrack)
            : "V1",
          order: num(c.item_order),
          shotId: strOrNull(c.shot_id),
          shotKey: strOrNull(c.shot_key),
          assetId: strOrNull(c.asset_id),
          name: str(c.name) || "clip",
          fileName: strOrNull(c.file_name),
          sourceIn: num(c.source_in_seconds),
          sourceOut: num(c.source_out_seconds),
          timelineIn: num(c.timeline_in_seconds),
          timelineOut: num(c.timeline_out_seconds),
          speed: num(c.speed, 1) || 1,
          transition: (TRANSITIONS as readonly string[]).includes(str(c.transition))
            ? (str(c.transition) as EditTransition)
            : "cut",
          transitionSeconds: num(c.transition_seconds),
          labelColor: strOrNull(c.label_color),
          placeholder: c.placeholder === true,
          comment: str(c.comment),
          enabled: c.enabled !== false,
          mediaDuration:
            typeof c.media_duration_seconds === "number" ? c.media_duration_seconds : null,
          mouth: c.mouth === "camera" || c.mouth === "model" ? c.mouth : null,
        }),
      )
      .sort((a, b) => a.track.localeCompare(b.track) || a.order - b.order),
    markers: markers.map((m) => ({
      id: str(m.id),
      clipId: strOrNull(m.clip_id),
      kind: (MARKER_KINDS as readonly string[]).includes(str(m.kind))
        ? (str(m.kind) as MarkerKind)
        : "comment",
      name: str(m.name),
      comment: str(m.comment),
      timeIn: num(m.time_in_seconds),
      timeOut: typeof m.time_out_seconds === "number" ? m.time_out_seconds : null,
    })),
  };
}

// --------------------------------------------------------------------------------------------------------- plan

export type RenderKind = "proxy" | "final";
export type RenderAspect = "9:16" | "1:1" | "16:9";

export type RenderMediaItem = {
  role: "picture" | "song";
  clipId: string | null;
  name: string;
  assetId: string;
  bucket: string;
  path: string;
  /** Short-lived storage URL. Never placed on argv. Null when the file could not be signed. */
  url: string | null;
  sourceIn: number;
  sourceOut: number;
  timelineIn: number;
  timelineOut: number;
  /** Probed seconds, or a stored length that is not the 4.04 s filing default. Null until then. */
  durationSeconds: number | null;
  placeholder: boolean;
};

export type RenderMediaGap = {
  clipId: string | null;
  name: string;
  assetId: string | null;
  reason: string;
};

export type RenderMediaReport = {
  /** Picture inputs that resolved to a stored file. The song is counted separately. */
  realCount: number;
  song: boolean;
  missing: RenderMediaGap[];
  slate: RenderMediaGap[];
  items: RenderMediaItem[];
};

export type RenderPlan = {
  costUsd: 0;
  billable: false;
  providers: [];
  kind: RenderKind;
  aspect: RenderAspect;
  structural: boolean;
  durationSeconds: number;
  durationFrames: number;
  width: number;
  height: number;
  fps: number;
  filterComplex: string;
  argv: string[];
  warnings: string[];
  upscale: { invoked: false; costUsd: 0; note: string } | null;
  inputs: RenderMediaReport;
  /** The sequence the plan was built from, so a local encode can re-plan after ffprobe. */
  sequence: EditSequence;
};

const XFADE: Record<Exclude<EditTransition, "cut">, string> = {
  crossfade: "fade",
  dip: "fadeblack",
  whip: "hblur",
  flash: "fadewhite",
};

const LABEL_HEX: Record<string, string> = {
  Rose: "0xc45c6a",
  Mango: "0xe0a045",
  Iris: "0x3d4f8a",
  Lavender: "0x8d7aab",
};

function fgPath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export function frameSize(
  kind: RenderKind,
  aspect: RenderAspect,
  sequence: { width: number; height: number },
): { width: number; height: number } {
  if (kind === "final" && aspect === "9:16") {
    const w = sequence.width % 2 === 0 ? sequence.width : sequence.width - 1;
    const h = sequence.height % 2 === 0 ? sequence.height : sequence.height - 1;
    return { width: Math.max(2, w), height: Math.max(2, h) };
  }
  const table: Record<RenderKind, Record<RenderAspect, [number, number]>> = {
    proxy: { "9:16": [360, 640], "1:1": [360, 360], "16:9": [640, 360] },
    final: { "9:16": [720, 1280], "1:1": [1080, 1080], "16:9": [1920, 1080] },
  };
  const [width, height] = table[kind][aspect];
  return { width, height };
}

function safeLocal(path: string | undefined): string | null {
  if (!path) return null;
  if (/^https?:/i.test(path)) return null;
  if (/[;&|`$]/.test(path)) return null;
  return path;
}

/** Seconds for an ffmpeg filter, truncated so a value is never rounded onto the next microsecond. */
function filterSeconds(seconds: number): string {
  return (Math.floor(seconds * 1e6 + 1e-4) / 1e6).toFixed(6);
}

/**
 * A cut time on the sequence frame grid. `0.166667` is frame 4 at 24 fps (4/24). Printing that
 * with three decimals makes `0.167`, which drops the frame. Truncating the snapped frame time
 * keeps the frame and still excludes the next one.
 */
function gridSeconds(seconds: number, fps: number): string {
  const frame = Math.round(seconds * fps);
  return filterSeconds(frame / fps);
}

/**
 * ffmpeg plan for a sequence. Cost is always 0. Remote URLs are never argv inputs: a resolved file is a
 * local path or an `avt-media/` token the local script replaces after downloading this project's storage.
 * Nothing here calls a generation provider; `upscale: true` only records that a later lane would be explicit.
 *
 * `durations` are trusted seconds (an ffprobe, or a stored length that is not the 4.04 s filing default).
 * A source out past that length is clamped. The 4.04 s default is not passed in, so it cannot clamp a cut.
 */
export function planRender(
  seq: EditSequence,
  options: {
    kind?: RenderKind;
    aspect?: RenderAspect;
    media?: Record<string, string>;
    durations?: Record<string, number>;
    songPath?: string | null;
    songDurationSeconds?: number | null;
    grain?: boolean;
    lut?: string | null;
    captions?: boolean;
    fontFile?: string | null;
    upscale?: boolean;
    output?: string;
  } = {},
): RenderPlan {
  const kind = options.kind ?? "proxy";
  const aspect = options.aspect ?? "9:16";
  const { width, height } = frameSize(kind, aspect, seq);
  const fps = seq.fps;
  const clips = videoClips(seq);
  const warnings: string[] = mediaWarnings(seq).map((w) => w.message);
  const font = options.fontFile && safeLocal(options.fontFile) ? options.fontFile : null;
  const lut = options.lut && safeLocal(options.lut) ? options.lut : null;
  if (options.lut && !lut) warnings.push("LUT path ignored (only a local path is accepted)");

  const args: string[] = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"];
  const chains: string[] = [];
  let structural = true;
  let realCount = 0;
  clips.forEach((c, i) => {
    const local = safeLocal(options.media?.[c.assetId ?? ""] ?? options.media?.[c.fileName ?? ""]);
    const known = c.assetId != null ? options.durations?.[c.assetId] : undefined;
    const sourceEnd =
      known != null && Number.isFinite(known) && known > 0
        ? Math.min(c.sourceOut, known)
        : c.sourceOut;
    const dur = Math.max(1 / fps, c.timelineOut - c.timelineIn);
    if (!local || !(sourceEnd > c.sourceIn)) {
      if (local && !(sourceEnd > c.sourceIn))
        warnings.push(
          `${c.name}: file is shorter than the source in-point, using a colour stand-in`,
        );
      else if (options.media && (c.assetId || c.fileName))
        warnings.push(`${c.name}: no local file, using a colour stand-in`);
      const hex = LABEL_HEX[c.labelColor ?? ""] ?? "0x222222";
      args.push(
        "-f",
        "lavfi",
        "-i",
        `color=c=${hex}:s=${width}x${height}:r=${fps}:d=${dur.toFixed(3)}`,
      );
      const text = fgPath(c.placeholder ? `${c.shotKey ?? c.name} LIP` : (c.shotKey ?? c.name));
      const burn = font
        ? `,drawtext=fontfile='${fgPath(font)}':text='${text}':fontsize=18:fontcolor=white:x=16:y=16`
        : "";
      chains.push(`[${i}:v]setsar=1${burn}[v${i}]`);
    } else {
      structural = false;
      realCount += 1;
      if (known != null && c.sourceOut > known + 1 / fps)
        warnings.push(
          `${c.name}: source out ${c.sourceOut.toFixed(3)}s clamped to the file duration ${known.toFixed(3)}s`,
        );
      args.push("-i", local);
      const speed = c.speed > 0 ? c.speed : 1;
      const pts = speed === 1 ? "" : `,setpts=PTS/${speed}`;
      chains.push(
        `[${i}:v]trim=start=${gridSeconds(c.sourceIn, fps)}:end=${gridSeconds(sourceEnd, fps)},setpts=PTS-STARTPTS${pts},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${fps},setsar=1[v${i}]`,
      );
    }
  });

  const captionMarkers = options.captions
    ? seq.markers.filter((m) => m.kind === "lyric" || m.kind === "lipsync")
    : [];
  const post = Boolean(
    options.grain || lut || (options.captions && font && captionMarkers.length > 0),
  );
  const assembled = post ? "vpre" : "vout";
  if (clips.length === 0) {
    args.push("-f", "lavfi", "-i", `color=c=0x111111:s=${width}x${height}:r=${fps}:d=1`);
    chains.push(`[0:v]setsar=1[${assembled}]`);
  } else if (clips.every((c) => c.transition === "cut" || c.transitionSeconds <= 0)) {
    chains.push(
      `${clips.map((_, i) => `[v${i}]`).join("")}concat=n=${clips.length}:v=1:a=0[${assembled}]`,
    );
  } else {
    let acc = "v0";
    let accDur = clips[0]!.timelineOut - clips[0]!.timelineIn;
    for (let i = 1; i < clips.length; i++) {
      const c = clips[i]!;
      const dur = c.timelineOut - c.timelineIn;
      const last = i === clips.length - 1;
      const out = last ? assembled : `x${i}`;
      const fade = c.transition !== "cut" && c.transitionSeconds > 0;
      if (!fade) {
        chains.push(`[${acc}][v${i}]concat=n=2:v=1:a=0[${out}]`);
        accDur += dur;
      } else {
        const d = Math.min(c.transitionSeconds, accDur * 0.5, dur * 0.5);
        const offset = Math.max(0, accDur - d);
        chains.push(
          `[${acc}][v${i}]xfade=transition=${XFADE[c.transition as Exclude<EditTransition, "cut">]}:duration=${d.toFixed(3)}:offset=${offset.toFixed(3)}[${out}]`,
        );
        accDur = accDur + dur - d;
      }
      acc = out;
    }
  }

  let tail = `[${assembled}]`;
  if (options.grain) {
    chains.push(`${tail}noise=alls=8:allf=t[vg]`);
    tail = "[vg]";
  }
  if (lut) {
    chains.push(`${tail}lut3d=file='${fgPath(lut)}'[vl]`);
    tail = "[vl]";
  }
  if (options.captions && font && captionMarkers.length > 0) {
    captionMarkers.forEach((m, i) => {
      const end = m.timeOut ?? m.timeIn + 1;
      const next = i === captionMarkers.length - 1 ? "vout" : `cap${i}`;
      chains.push(
        `${tail}drawtext=fontfile='${fgPath(font)}':text='${fgPath(m.name.slice(0, 80))}':fontsize=16:fontcolor=white:x=(w-text_w)/2:y=h-40:enable='between(t,${m.timeIn.toFixed(3)},${end.toFixed(3)})'[${next}]`,
      );
      tail = `[${next}]`;
    });
  } else if (options.captions && !font) warnings.push("captions omitted: no font file");
  else if (options.captions && captionMarkers.length === 0)
    warnings.push("captions requested and there are no lyric or lipsync markers");

  if (tail !== "[vout]") chains.push(`${tail}null[vout]`);

  const song = safeLocal(options.songPath ?? undefined);
  const audioIndex = clips.length === 0 ? 1 : clips.length;
  const dur = durationSeconds(seq);
  const songKnown = options.songDurationSeconds;
  const songStart = seq.songOffset;
  let songEnd = songStart + dur;
  const songFits = Boolean(song) && !(songKnown != null && songKnown > 0 && songStart >= songKnown);
  if (song && !songFits)
    warnings.push("song offset is past the end of the file; the proxy stays silent");
  if (song && songFits) {
    structural = false;
    if (songKnown != null && songKnown > 0) songEnd = Math.min(songEnd, songKnown);
    args.push("-i", song);
    chains.push(
      `[${audioIndex}:a]atrim=start=${filterSeconds(songStart)}:end=${filterSeconds(songEnd)},asetpts=PTS-STARTPTS[a]`,
    );
  } else {
    args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
    chains.push(
      `[${audioIndex}:a]atrim=start=0.000000:end=${filterSeconds(dur)},asetpts=PTS-STARTPTS[a]`,
    );
  }

  const filterComplex = chains.join(";");
  args.push(
    "-filter_complex",
    filterComplex,
    "-map",
    "[vout]",
    "-map",
    "[a]",
    "-t",
    filterSeconds(dur),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    kind === "proxy" ? "28" : "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    options.output ?? "OUTPUT",
  );

  return {
    costUsd: 0,
    billable: false,
    providers: [],
    kind,
    aspect,
    structural,
    durationSeconds: dur,
    durationFrames: durationFrames(seq),
    width,
    height,
    fps,
    filterComplex,
    argv: args,
    warnings,
    upscale: options.upscale
      ? {
          invoked: false,
          costUsd: 0,
          note: "Upscale is a separate existing provider lane. This plan does not call it and spends nothing. Run that lane yourself on the finished file.",
        }
      : null,
    inputs: {
      realCount,
      song: Boolean(song && songFits),
      missing: [],
      slate: [],
      items: [],
    },
    sequence: seq,
  };
}

const BLOCKED_ARGV =
  /https?:|fal\.ai|api\.x\.ai|openai\.com|montage-shot|lipsync-shot|grok-|topaz/i;

export function assertPlanSafe(plan: RenderPlan): void {
  if (plan.costUsd !== 0 || plan.billable !== false || plan.providers.length !== 0) {
    throw new Error("a render plan must cost 0 and name no provider");
  }
  const joined = plan.argv.join(" ");
  if (BLOCKED_ARGV.test(joined)) throw new Error("render plan contains a remote or billable input");
  if (plan.upscale && (plan.upscale.invoked || plan.upscale.costUsd !== 0))
    throw new Error("upscale must stay uninvoked");
}
