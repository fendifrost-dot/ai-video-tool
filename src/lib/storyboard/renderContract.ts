/**
 * The render contract — the one document a renderer executes (Fendi, 2026-10-03: "WHAT REVIEW PLAYS = WHAT EXPORT
 * RENDERS. There must not be separate editorial truth.")
 *
 * It is made from the SAME timeline Review plays (`buildTimeline`), by asking the player's own functions what is on
 * screen at every output frame (`segmentAt`, `videoStateAt`, `pictureAt`) and writing the answers down. So a
 * renderer does not interpret the storyboard, re-derive a sync, or re-implement an effect: it reads, per shot,
 *
 *   • which output frames the shot covers                         frame_in / frame_out
 *   • the original file to read and where its picture starts      media.path, media.frames.source_first
 *   • how many frames hold the first picture, play, hold the last media.frames.lead / play / tail
 *   • what the edit does to the picture, frame run by frame run   picture_runs (brightness, contrast, flash)
 *
 * and the song, where it starts, and the frame it all goes into. Everything editorial (which shot, which media,
 * which range, which effect, when) is decided upstream, on the shot records; nothing is decided by a renderer.
 *
 * What the contract deliberately says is NOT rendered — because Review does not play it either:
 *   • transitions: a shot's transition preset is carried as declared, and marked `realized: "cut"`. Review cuts.
 *   • directed change inside a shot (a timed event that is not an effect) is direction for the FOOTAGE; it is
 *     carried for the record (`direction`) and a renderer draws nothing for it.
 *
 * `reviewFrameAt` (what Review shows at a time) and `contractFrameAt` (what the contract says at that time) are the
 * two readings a parity test holds equal; `contractFrameAt` is also what any renderer's output can be checked against.
 *
 * Pure module.
 */
import { DEFAULT_FRAME_FIT, DEFAULT_PROJECT_ASPECT, frameSize, type FrameFit, type ProjectAspect } from "@/lib/project/aspect";
import { effectKeys, isDirected, pictureAt, type Picture } from "./events";
import { segmentAt, videoStateAt, type AssignmentRole, type MediaAsset, type TimelineSegment } from "./media";

export const RENDER_CONTRACT_VERSION = 2;
/** The frame rate a render is made at when none is asked for. A render setting — the cut itself is in seconds on the song. */
export const DEFAULT_RENDER_FPS = 30;

export type PictureRun = { frame_in: number; frame_out: number; brightness: number; contrast: number; flash: number };

export type ContractVideo = {
  kind: "video";
  asset_id: string;
  bucket: string;
  /** The original file — a renderer reads this, never the lighter copy the browser plays. */
  path: string;
  role: AssignmentRole;
  /** Editorial, seconds inside the file: where the shot's range of it begins and ends, and how long the shot runs before the file has picture. */
  source_in: number;
  source_out: number | null;
  lead_in: number;
  /** The file's length when known. */
  source_seconds: number | null;
  /** True when the take shows only because nothing was selected on the shot. */
  base_layer: boolean;
  /**
   * The same thing in output frames, as the player plays it: `lead` frames hold the picture at `source_first`,
   * then `play` frames run from `source_first` at the file's own rate, then `tail` frames hold the last picture
   * reached. lead + play + tail = frame_out - frame_in.
   */
  frames: { lead: number; play: number; tail: number; source_first: number };
};

export type ContractSegment = {
  shot_id: string;
  key: string;
  index: number;
  section: string | null;
  scene: string;
  /** Song clock, seconds. Segments are gapless: a shot is on screen until the next one starts, as in Review. */
  song_in: number;
  song_out: number;
  /** Output frames [frame_in, frame_out). A shot shorter than one frame at this frame rate has none. */
  frame_in: number;
  frame_out: number;
  media: { kind: "none" } | { kind: "image"; asset_id: string; bucket: string; path: string; role: AssignmentRole } | ContractVideo;
  /** The edit's effects as keys on the song clock (what they are), and as evaluated runs of output frames (what to apply). */
  effects: ReturnType<typeof effectKeys>;
  picture_runs: PictureRun[];
  /** Timed direction that has to be IN the footage. Carried for the record; nothing is drawn for it. */
  direction: { song_time: number; offset: number; lighting: string; camera: string; action: string; visual: string; lighting_state: string | null }[];
  /** The transition the shot record declares, and what plays: a cut. */
  transition_in: { declared: string | null; realized: "cut" };
};

export type RenderContract = {
  version: typeof RENDER_CONTRACT_VERSION;
  /** Every time in the contract is on this clock unless it says source_*. */
  clock: "song";
  frame: { aspect: ProjectAspect; width: number; height: number; fit: FrameFit; background: "#000000" };
  fps: number;
  /** The stretch of the song that is rendered. Output frame n shows song time range.song_in + n / fps. */
  range: { song_in: number; song_out: number };
  frames: number;
  duration_seconds: number;
  /** The sound: the song itself, from range.song_in, for the length of the render. */
  audio: { asset_id: string; bucket: string; path: string; song_in: number } | null;
  segments: ContractSegment[];
};

/** What is on screen at one moment: the same shape from Review's own functions and from the contract. */
export type FrameReading = {
  shot_id: string | null;
  kind: "none" | "image" | "video";
  asset_id: string | null;
  /** Seconds inside the file the picture is taken from (video only). */
  source_time: number | null;
  hold: "lead_in" | "ran_out" | null;
  picture: Picture;
};

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const AS_FILMED: Picture = { brightness: 1, contrast: 1, flash: 0 };

/** What Review shows at song time `t` — read from the player's own functions. */
export function reviewFrameAt(timeline: readonly TimelineSegment[], assets: ReadonlyMap<string, Pick<MediaAsset, "id" | "durationSeconds">>, t: number): FrameReading {
  const seg = segmentAt(timeline, t);
  if (!seg) return { shot_id: null, kind: "none", asset_id: null, source_time: null, hold: null, picture: AS_FILMED };
  const picture = seg.events?.length ? pictureAt(seg.events, t - seg.start) : AS_FILMED;
  if (seg.media.kind === "none") return { shot_id: seg.shotId, kind: "none", asset_id: null, source_time: null, hold: null, picture };
  if (seg.media.kind === "image") return { shot_id: seg.shotId, kind: "image", asset_id: seg.media.assetId, source_time: null, hold: null, picture };
  const state = videoStateAt(seg, t, assets.get(seg.media.assetId)?.durationSeconds ?? null);
  return { shot_id: seg.shotId, kind: "video", asset_id: seg.media.assetId, source_time: state ? round4(state.at) : null, hold: state?.hold ?? null, picture };
}

/**
 * The contract of a timeline. `range` picks a stretch of the song (Review's section); without it the whole
 * storyboard is rendered. Every per-frame number is the player's own answer at that frame's time.
 */
export function renderContract(input: {
  timeline: readonly TimelineSegment[];
  assets: ReadonlyMap<string, MediaAsset>;
  song: { assetId: string; bucket: string; path: string } | null;
  aspect?: ProjectAspect;
  fps?: number;
  range?: { songIn: number; songOut: number } | null;
}): RenderContract {
  const aspect = input.aspect ?? DEFAULT_PROJECT_ASPECT;
  const fps = input.fps && input.fps > 0 ? input.fps : DEFAULT_RENDER_FPS;
  const all = input.timeline;
  const songIn = round4(input.range?.songIn ?? (all.length ? all[0].start : 0));
  const songOut = round4(input.range?.songOut ?? (all.length ? all[all.length - 1].end : 0));
  const frames = Math.max(0, Math.round((songOut - songIn) * fps));
  const timeOf = (n: number) => songIn + n / fps;

  // which shot each output frame belongs to — by the player's own rule
  const owner: (TimelineSegment | null)[] = [];
  for (let n = 0; n < frames; n++) owner.push(segmentAt(all, timeOf(n)));

  const segments: ContractSegment[] = [];
  all.forEach((seg, i) => {
    const next = all[i + 1];
    // gapless, as Review plays it: a shot is on screen until the next one starts
    const segIn = seg.start;
    const segOut = next ? next.start : seg.end;
    if (segOut <= songIn + 1e-6 || segIn >= songOut - 1e-6) return;
    const first = owner.indexOf(seg);
    const frameIn = first < 0 ? Math.min(frames, Math.max(0, Math.ceil((segIn - songIn) * fps - 1e-6))) : first;
    const frameOut = first < 0 ? frameIn : owner.lastIndexOf(seg) + 1;

    // the picture, frame by frame, as runs of equal values
    const runs: PictureRun[] = [];
    if (seg.events?.some((e) => e.effect)) {
      for (let n = frameIn; n < frameOut; n++) {
        const p = pictureAt(seg.events, timeOf(n) - seg.start);
        const last = runs[runs.length - 1];
        if (last && last.frame_out === n && last.brightness === p.brightness && last.contrast === p.contrast && last.flash === p.flash) last.frame_out = n + 1;
        else runs.push({ frame_in: n, frame_out: n + 1, brightness: p.brightness, contrast: p.contrast, flash: p.flash });
      }
    }
    // a run that is the picture as filmed says nothing: left out
    const pictureRuns = runs.filter((r) => !(r.brightness === 1 && r.contrast === 1 && r.flash === 0));

    let media: ContractSegment["media"] = { kind: "none" };
    const asset = seg.media.kind === "none" ? null : input.assets.get(seg.media.assetId);
    if (seg.media.kind === "image" && asset) {
      media = { kind: "image", asset_id: asset.id, bucket: asset.bucket, path: asset.path, role: seg.media.role };
    } else if (seg.media.kind === "video" && asset) {
      const fileSeconds = asset.durationSeconds ?? null;
      let lead = 0;
      let tail = 0;
      let sourceFirst: number | null = null;
      let lastAt: number | null = null;
      for (let n = frameIn; n < frameOut; n++) {
        const st = videoStateAt(seg, timeOf(n), fileSeconds);
        if (!st) continue;
        if (st.hold === "lead_in") lead++;
        else if (lastAt != null && st.at <= lastAt + 1e-9) tail++; // the playhead has stopped: the last picture holds
        else if (sourceFirst == null) sourceFirst = st.at;
        if (st.hold !== "lead_in") lastAt = st.at;
      }
      media = {
        kind: "video",
        asset_id: asset.id,
        bucket: asset.bucket,
        path: asset.path,
        role: seg.media.role,
        source_in: seg.media.sourceIn,
        source_out: seg.media.sourceOut,
        lead_in: seg.media.leadIn,
        source_seconds: fileSeconds,
        base_layer: seg.media.base,
        frames: { lead, play: frameOut - frameIn - lead - tail, tail, source_first: round4(sourceFirst ?? seg.media.sourceIn) },
      };
    }

    segments.push({
      shot_id: seg.shotId,
      key: seg.key,
      index: seg.index,
      section: seg.section,
      scene: seg.scene,
      song_in: round4(Math.max(segIn, songIn)),
      song_out: round4(Math.min(segOut, songOut)),
      frame_in: frameIn,
      frame_out: frameOut,
      media,
      effects: effectKeys(seg.events ?? []),
      picture_runs: pictureRuns,
      direction: (seg.events ?? [])
        .filter((e) => isDirected(e))
        // a change of light that carries an effect is the edit's (it is in picture_runs), not direction for the footage
        .map((e) => ({ song_time: e.songTime, offset: e.offset, lighting: e.effect ? "" : e.lighting, camera: e.camera, action: e.action, visual: e.visual, lighting_state: e.effect ? null : e.lightingState })),
      transition_in: { declared: seg.transitionIn?.preset ?? seg.transitionIn?.type ?? null, realized: "cut" },
    });
  });

  return {
    version: RENDER_CONTRACT_VERSION,
    clock: "song",
    // the frame every shot is rendered into; media of another shape is fitted whole (never cropped)
    frame: { aspect, ...frameSize(aspect), fit: DEFAULT_FRAME_FIT, background: "#000000" },
    fps,
    range: { song_in: songIn, song_out: songOut },
    frames,
    duration_seconds: round4(frames / fps),
    audio: input.song ? { asset_id: input.song.assetId, bucket: input.song.bucket, path: input.song.path, song_in: songIn } : null,
    segments,
  };
}

/** What the CONTRACT says is on screen at output frame `n` — read from the contract alone, as a renderer would. */
export function contractFrameAt(contract: RenderContract, n: number): FrameReading {
  const seg = contract.segments.find((s) => n >= s.frame_in && n < s.frame_out);
  if (!seg) return { shot_id: null, kind: "none", asset_id: null, source_time: null, hold: null, picture: AS_FILMED };
  const run = seg.picture_runs.find((r) => n >= r.frame_in && n < r.frame_out);
  const picture: Picture = run ? { brightness: run.brightness, contrast: run.contrast, flash: run.flash } : AS_FILMED;
  if (seg.media.kind === "none") return { shot_id: seg.shot_id, kind: "none", asset_id: null, source_time: null, hold: null, picture };
  if (seg.media.kind === "image") return { shot_id: seg.shot_id, kind: "image", asset_id: seg.media.asset_id, source_time: null, hold: null, picture };
  const f = seg.media.frames;
  const k = n - seg.frame_in;
  // inside the lead-in the first picture of the shot's range holds
  if (k < f.lead) return { shot_id: seg.shot_id, kind: "video", asset_id: seg.media.asset_id, source_time: round4(seg.media.source_in), hold: "lead_in", picture };
  // then the file runs at its own rate; it never reads past its out-point or its end, and the last picture reached holds
  const played = Math.min(k - f.lead, Math.max(0, f.play - 1));
  const at = Math.min(f.source_first + played / contract.fps, seg.media.source_out ?? Infinity, seg.media.source_seconds != null && seg.media.source_seconds > 0 ? Math.max(0, seg.media.source_seconds - 0.05) : Infinity);
  return { shot_id: seg.shot_id, kind: "video", asset_id: seg.media.asset_id, source_time: round4(at), hold: k - f.lead >= f.play ? "ran_out" : null, picture };
}

export type RenderReadiness = {
  /** Nothing stands between this contract and a finished video. */
  ready: boolean;
  /** What a render of it would be missing — each names its shot. */
  blockers: string[];
  /** What a render of it does, said so nobody expects more. */
  notes: string[];
};

/** Whether the contract describes a finished video, and what it would and would not contain. */
export function renderReadiness(contract: RenderContract): RenderReadiness {
  const blockers: string[] = [];
  const notes: string[] = [];
  if (!contract.audio) blockers.push("the project has no song to render the picture against");
  if (contract.segments.length === 0 || contract.frames === 0) blockers.push("there are no shots to render");
  const empty = contract.segments.filter((s) => s.media.kind === "none" && s.frame_out > s.frame_in);
  if (empty.length) blockers.push(`${empty.length === 1 ? "shot" : "shots"} ${empty.map((s) => s.index).join(", ")} ${empty.length === 1 ? "has" : "have"} nothing on ${empty.length === 1 ? "it" : "them"} — a render would show black there`);
  const tooShort = contract.segments.filter((s) => s.frame_out <= s.frame_in);
  if (tooShort.length) notes.push(`${tooShort.length === 1 ? "shot" : "shots"} ${tooShort.map((s) => s.index).join(", ")} ${tooShort.length === 1 ? "is" : "are"} shorter than one frame at ${contract.fps} fps and ${tooShort.length === 1 ? "is" : "are"} not on screen`);
  const stills = contract.segments.filter((s) => s.media.kind === "image");
  if (stills.length) notes.push(`${stills.length === 1 ? "shot" : "shots"} ${stills.map((s) => s.index).join(", ")} ${stills.length === 1 ? "is a held image" : "are held images"}`);
  const held = contract.segments.filter((s) => s.media.kind === "video" && (s.media.frames.lead > 0 || s.media.frames.tail > 0));
  if (held.length) notes.push(`${held.length === 1 ? "shot" : "shots"} ${held.map((s) => s.index).join(", ")} ${held.length === 1 ? "holds" : "hold"} a frame where ${held.length === 1 ? "its" : "their"} footage does not cover the whole shot`);
  const fx = contract.segments.filter((s) => s.picture_runs.length > 0);
  if (fx.length) notes.push(`the edit's effects are applied on ${fx.length === 1 ? "shot" : "shots"} ${fx.map((s) => s.index).join(", ")}`);
  const declared = contract.segments.filter((s) => s.transition_in.declared && s.transition_in.declared !== "cut");
  if (declared.length) notes.push(`${declared.length} shot${declared.length === 1 ? " declares" : "s declare"} a transition; every one plays — and renders — as a cut`);
  const directed = contract.segments.filter((s) => s.direction.length > 0);
  if (directed.length) notes.push(`${directed.length === 1 ? "shot" : "shots"} ${directed.map((s) => s.index).join(", ")} ${directed.length === 1 ? "has" : "have"} timed direction that must already be in the footage — a render adds nothing for it`);
  return { ready: blockers.length === 0, blockers, notes };
}
