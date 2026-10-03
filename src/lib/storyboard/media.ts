/**
 * Footage on a storyboard box (Fendi, 2026-10-03).
 *
 * A file exists once (`project_assets`). Putting it on a box, taking it off and moving it to another box change
 * rows in `shot_asset_assignments` — never the file. One assignment per box is PRIMARY: the media the box shows and
 * Review plays.
 *
 * PERFORMANCE footage is special. A take is one recording on its own clock; `performance_syncs` says how that clock
 * maps to the SONG clock. A box's range inside the take is therefore DERIVED from the box's song window, every time
 * — it is never stored, never re-measured when the storyboard changes, and never stretched: the take is cut, in
 * sync, wherever the box sits. The synced take is the base layer under the whole video: a box with nothing selected
 * still has its performance range available.
 *
 * Pure module.
 */
import { DEFAULT_FRAME_FIT, DEFAULT_PROJECT_ASPECT, frameSize, type FrameFit, type ProjectAspect } from "@/lib/project/aspect";
import { sourceRangeForSongRange, type PerformanceSync } from "@/lib/sync/performanceSync";
import { orderBoxes, type StoryboardBox } from "./boxes";

export const ASSIGNMENT_ROLES = ["performance", "b_roll", "generated_image", "generated_clip", "reference"] as const;
export type AssignmentRole = (typeof ASSIGNMENT_ROLES)[number];

export const FOOTAGE_ROLES = ["performance", "b_roll", "reference"] as const;
export type FootageRole = (typeof FOOTAGE_ROLES)[number];

export type Assignment = {
  id: string;
  projectId: string;
  shotId: string;
  assetId: string;
  role: AssignmentRole;
  /** In/out inside the asset, seconds. Null on a performance assignment (derived from the song window). */
  sourceIn: number | null;
  sourceOut: number | null;
  isPrimary: boolean;
  sortOrder: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

/** The slice of a project asset the storyboard needs. */
export type MediaAsset = {
  id: string;
  assetType: string;
  footageRole: FootageRole | null;
  bucket: string;
  path: string;
  /** A lighter copy to play in the browser, when one exists. */
  playback: { bucket: string; path: string } | null;
  name: string;
  mime: string | null;
  isVideo: boolean;
  isImage: boolean;
  durationSeconds: number | null;
  shotId: string | null;
  sourceTool: string | null;
  providerJobId: string | null;
  createdAt: string;
  /**
   * Set on a take that was made FROM another take (the storyboard's "restage"): which take, and the song time of its
   * first frame. It is a version of one moment — never the base layer of other shots, never counted as a take.
   */
  derivedFrom?: { assetId: string; songStart: number | null } | null;
  /**
   * What the footage shows, in the director's words (Setup). `shows` is what he WEARS — the thing a restaged shot
   * keeps; `filmedIn` is the place it was shot — the thing a restaged shot replaces. Both are told to the writer.
   */
  shows?: string | null;
  filmedIn?: string | null;
};

/** A take of the song as filmed: performance footage that was not made from another take. */
export function isOriginalTake(a: Pick<MediaAsset, "footageRole" | "isVideo" | "derivedFrom">): boolean {
  return a.footageRole === "performance" && a.isVideo && !a.derivedFrom;
}

/** A take's sync, as stored: which take, and how its clock maps to the song's. */
export type TakeSync = PerformanceSync & { id: string; performanceAssetId: string; updatedAt?: string };

const VIDEO_RE = /\.(mp4|mov|webm|m4v|mkv)$/i;
const IMAGE_RE = /\.(png|jpe?g|webp|avif|gif)$/i;

export function isVideoPath(path: string, mime?: string | null): boolean {
  return (mime ?? "").startsWith("video/") || VIDEO_RE.test(path);
}
export function isImagePath(path: string, mime?: string | null): boolean {
  return (mime ?? "").startsWith("image/") || IMAGE_RE.test(path);
}

/** What an asset is when it lands on a box. Null = it cannot be assigned (audio, a LUT, a document). */
export function roleForAsset(a: Pick<MediaAsset, "assetType" | "footageRole" | "isVideo" | "isImage"> & { sourceTool?: string | null }): AssignmentRole | null {
  if (a.footageRole === "performance") return a.isVideo ? "performance" : null;
  if (a.footageRole === "b_roll") return a.isVideo || a.isImage ? "b_roll" : null;
  if (a.footageRole === "reference") return "reference";
  if (a.assetType === "generated_still") return "generated_image";
  if (a.assetType === "generated_clip" || a.assetType === "edited_clip" || a.assetType === "social_cutdown") return a.isVideo ? "generated_clip" : null;
  // the still generator files its pictures as reference images: one it made is a generated image, not a reference
  if (a.assetType === "reference_image") return a.sourceTool && a.sourceTool !== "manual" ? "generated_image" : "reference";
  if (a.assetType === "reference_video") return a.isVideo ? "b_roll" : null;
  return null;
}

/** A role that is footage the cut can show (a reference is material to look at, never the picture). */
export function isPlayableRole(role: AssignmentRole): boolean {
  return role !== "reference";
}

// ---------------------------------------------------------------------------
// The performance range of a box
// ---------------------------------------------------------------------------

export type TakeRange = {
  /** In/out inside the take, seconds — the song window mapped through the sync. */
  start: number;
  end: number;
  /** "full": the take covers the whole window. "partial": it covers part (the range is clamped to the take). */
  coverage: "full" | "partial";
  /**
   * Seconds of the box that pass before the take has footage (0 unless the recording starts inside the box). The
   * take is never slid to fill that gap: sliding it would break the sync.
   */
  leadIn: number;
};

/**
 * Where a box sits inside a take. The window is mapped, never scaled: one second of song is one second of take
 * (drift is parts per million and is carried by the mapping). Null when the take has nothing for this window.
 */
export function takeRangeForBox(
  box: Pick<StoryboardBox, "start" | "end">,
  sync: Pick<PerformanceSync, "offsetSeconds" | "driftPpm"> & Partial<PerformanceSync>,
  takeDurationSeconds: number | null,
): TakeRange | null {
  if (!(box.end > box.start)) return null;
  const full = sourceRangeForSongRange({ start: box.start, end: box.end }, sync as PerformanceSync, takeDurationSeconds ?? undefined);
  if (full) return { ...full, coverage: "full", leadIn: 0 };
  // partly inside the recording: clamp to what was recorded
  const k = 1 + (sync.driftPpm ?? 0) / 1e6;
  const s = (box.start - sync.offsetSeconds) / k;
  const e = (box.end - sync.offsetSeconds) / k;
  const lo = Math.max(0, s);
  const hi = takeDurationSeconds != null ? Math.min(takeDurationSeconds, e) : e;
  if (hi - lo < 0.1) return null;
  // the song time at which the clamped range begins, relative to the box
  const leadIn = Math.max(0, lo * k + sync.offsetSeconds - box.start);
  return { start: Math.round(lo * 1e4) / 1e4, end: Math.round(hi * 1e4) / 1e4, coverage: "partial", leadIn: Math.round(leadIn * 1e4) / 1e4 };
}

/** A sync the cut can rely on: the director confirmed it, or set it by hand. A measurement nobody confirmed is not one. */
export function isUsableSync(sync: Pick<PerformanceSync, "status">): boolean {
  return sync.status === "confirmed" || sync.status === "manual";
}

// ---------------------------------------------------------------------------
// What a box shows
// ---------------------------------------------------------------------------

export type BoxMediaItem = {
  /** The assignment row, or null for the base performance layer (which needs no row). */
  assignmentId: string | null;
  asset: MediaAsset;
  role: AssignmentRole;
  kind: "video" | "image";
  /** In/out inside the asset, seconds (null on an image, or a clip played from its start to its end). */
  sourceIn: number | null;
  sourceOut: number | null;
  /** Seconds into the box before this media starts (a take whose recording begins inside the box); 0 otherwise. */
  leadIn: number;
  selected: boolean;
  /** True when this is the synced take offered underneath the box rather than something put on it. */
  base: boolean;
  /** Set when the media does not fill the box, or only part of the take covers it. */
  note: string | null;
};

export type BoxMedia = {
  /** Everything on the box, the selected item first. */
  items: BoxMediaItem[];
  /** What the box shows and Review plays: the primary assignment, else the base performance layer, else nothing. */
  showing: BoxMediaItem | null;
};

function mediaKind(asset: MediaAsset): "video" | "image" | null {
  return asset.isVideo ? "video" : asset.isImage ? "image" : null;
}

/**
 * Resolve the media of one box. `takes` are the project's performance assets; a take whose sync is usable and which
 * covers the box is always available as the base layer, whether or not anything is assigned.
 */
export function boxMedia(input: {
  box: Pick<StoryboardBox, "id" | "start" | "end">;
  assignments: readonly Assignment[];
  assets: ReadonlyMap<string, MediaAsset>;
  syncs: readonly TakeSync[];
}): BoxMedia {
  const { box } = input;
  const seconds = box.end - box.start;
  const syncByAsset = new Map(input.syncs.map((s) => [s.performanceAssetId, s]));
  const mine = input.assignments
    .filter((a) => a.shotId === box.id)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder || b.updatedAt.localeCompare(a.updatedAt));
  // one primary at most: the most recently set wins, so a half-finished "select" can never show two
  const primaryId = mine.filter((a) => a.isPrimary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id ?? null;

  const items: BoxMediaItem[] = [];
  const takesOnBox = new Set<string>();
  for (const a of mine) {
    const asset = input.assets.get(a.assetId);
    if (!asset) continue;
    const kind = mediaKind(asset);
    if (!kind) continue;
    let sourceIn = a.sourceIn;
    let sourceOut = a.sourceOut;
    let note: string | null = null;
    let leadIn = 0;
    if (a.role === "performance") {
      takesOnBox.add(asset.id);
      const sync = syncByAsset.get(asset.id);
      if (!sync || !isUsableSync(sync)) {
        note = "this take is not matched to the song yet";
        sourceIn = null;
        sourceOut = null;
      } else {
        const r = takeRangeForBox(box, sync, asset.durationSeconds);
        if (!r) {
          note = "the take has no footage for this part of the song";
          sourceIn = null;
          sourceOut = null;
        } else {
          sourceIn = r.start;
          sourceOut = r.end;
          leadIn = r.leadIn;
          if (r.coverage === "partial") note = "the take covers only part of this box";
        }
      }
    } else if (kind === "video") {
      const inPoint = sourceIn ?? 0;
      const available = (sourceOut ?? asset.durationSeconds ?? Infinity) - inPoint;
      sourceIn = inPoint;
      sourceOut = Number.isFinite(available) ? inPoint + Math.min(available, seconds) : inPoint + seconds;
      if (Number.isFinite(available) && available + 0.05 < seconds) note = `${available.toFixed(1)} s of footage for a ${seconds.toFixed(1)} s box`;
    }
    items.push({ assignmentId: a.id, asset, role: a.role, kind, sourceIn, sourceOut, leadIn, selected: a.id === primaryId, base: false, note });
  }

  // the base layer: every usable take that covers the box and is not already on it
  for (const sync of input.syncs) {
    if (!isUsableSync(sync) || takesOnBox.has(sync.performanceAssetId)) continue;
    const asset = input.assets.get(sync.performanceAssetId);
    if (!asset || !asset.isVideo) continue;
    // a restaged clip is one moment of a take: it shows where it was put, never underneath other shots
    if (asset.derivedFrom) continue;
    const r = takeRangeForBox(box, sync, asset.durationSeconds);
    if (!r) continue;
    items.push({
      assignmentId: null,
      asset,
      role: "performance",
      kind: "video",
      sourceIn: r.start,
      sourceOut: r.end,
      leadIn: r.leadIn,
      selected: false,
      base: true,
      note: r.coverage === "partial" ? "the take covers only part of this box" : null,
    });
  }

  const selected = items.find((i) => i.selected && isPlayableRole(i.role) && (i.role !== "performance" || i.sourceIn != null)) ?? null;
  const base = items.find((i) => i.base) ?? null;
  return { items, showing: selected ?? base };
}

// ---------------------------------------------------------------------------
// Assignment plans
// ---------------------------------------------------------------------------

export type AssignmentOp =
  | { op: "insert"; shotId: string; assetId: string; role: AssignmentRole; isPrimary: boolean; sourceIn: number | null; sourceOut: number | null; sortOrder: number }
  | { op: "update"; id: string; patch: Partial<{ shot_id: string; is_primary: boolean; source_in_seconds: number | null; source_out_seconds: number | null; sort_order: number }> }
  | { op: "delete"; id: string };

/** Put an asset on a box (selected by default: the director put it there to see it). Idempotent per (box, asset, role). */
export function planAssign(input: {
  assignments: readonly Assignment[];
  shotId: string;
  assetId: string;
  role: AssignmentRole;
  select?: boolean;
  sourceIn?: number | null;
  sourceOut?: number | null;
}): AssignmentOp[] {
  const select = (input.select ?? true) && isPlayableRole(input.role);
  const onBox = input.assignments.filter((a) => a.shotId === input.shotId);
  const ops: AssignmentOp[] = [];
  if (select) for (const a of onBox) if (a.isPrimary && !(a.assetId === input.assetId && a.role === input.role)) ops.push({ op: "update", id: a.id, patch: { is_primary: false } });
  const same = onBox.find((a) => a.assetId === input.assetId && a.role === input.role);
  if (same) {
    if (select && !same.isPrimary) ops.push({ op: "update", id: same.id, patch: { is_primary: true } });
    return ops;
  }
  ops.push({
    op: "insert",
    shotId: input.shotId,
    assetId: input.assetId,
    role: input.role,
    isPrimary: select,
    sourceIn: input.role === "performance" ? null : (input.sourceIn ?? null),
    sourceOut: input.role === "performance" ? null : (input.sourceOut ?? null),
    sortOrder: onBox.reduce((m, a) => Math.max(m, a.sortOrder), 0) + 1,
  });
  return ops;
}

/** Make one assignment the box's selected media. */
export function planSelect(assignments: readonly Assignment[], assignmentId: string): AssignmentOp[] {
  const target = assignments.find((a) => a.id === assignmentId);
  if (!target) return [];
  const ops: AssignmentOp[] = [];
  for (const a of assignments) if (a.shotId === target.shotId && a.isPrimary && a.id !== target.id) ops.push({ op: "update", id: a.id, patch: { is_primary: false } });
  if (!target.isPrimary) ops.push({ op: "update", id: target.id, patch: { is_primary: true } });
  return ops;
}

/** Show nothing put on the box: the base performance layer (if any) shows through. Nothing is removed. */
export function planDeselect(assignments: readonly Assignment[], shotId: string): AssignmentOp[] {
  return assignments.filter((a) => a.shotId === shotId && a.isPrimary).map((a) => ({ op: "update" as const, id: a.id, patch: { is_primary: false } }));
}

/**
 * Move an assignment to another box. The file is not touched and not copied. If the target already carries the same
 * asset in the same role the moved row is simply dropped (one row per box, asset and role). A moved clip keeps its
 * in-point; a moved take keeps nothing — its range follows from the box it lands on.
 */
export function planMove(assignments: readonly Assignment[], assignmentId: string, toShotId: string): AssignmentOp[] {
  const a = assignments.find((x) => x.id === assignmentId);
  if (!a || a.shotId === toShotId) return [];
  const onTarget = assignments.filter((x) => x.shotId === toShotId);
  const twin = onTarget.find((x) => x.assetId === a.assetId && x.role === a.role);
  const ops: AssignmentOp[] = [];
  if (isPlayableRole(a.role)) for (const x of onTarget) if (x.isPrimary && x.id !== twin?.id) ops.push({ op: "update", id: x.id, patch: { is_primary: false } });
  if (twin) {
    ops.push({ op: "delete", id: a.id });
    if (isPlayableRole(a.role) && !twin.isPrimary) ops.push({ op: "update", id: twin.id, patch: { is_primary: true } });
    return ops;
  }
  ops.push({
    op: "update",
    id: a.id,
    patch: { shot_id: toShotId, is_primary: isPlayableRole(a.role), sort_order: onTarget.reduce((m, x) => Math.max(m, x.sortOrder), 0) + 1 },
  });
  return ops;
}

/** Everything on `fromShotId` goes to `toShotId` (merge): rows move, twins collapse, the survivor keeps its own selection. */
export function planMoveAll(assignments: readonly Assignment[], fromShotId: string, toShotId: string): AssignmentOp[] {
  const onTarget = assignments.filter((x) => x.shotId === toShotId);
  const targetHasPrimary = onTarget.some((x) => x.isPrimary);
  let order = onTarget.reduce((m, x) => Math.max(m, x.sortOrder), 0);
  const ops: AssignmentOp[] = [];
  for (const a of assignments.filter((x) => x.shotId === fromShotId)) {
    if (onTarget.some((x) => x.assetId === a.assetId && x.role === a.role)) {
      ops.push({ op: "delete", id: a.id });
      continue;
    }
    order += 1;
    ops.push({ op: "update", id: a.id, patch: { shot_id: toShotId, sort_order: order, ...(targetHasPrimary && a.isPrimary ? { is_primary: false } : {}) } });
  }
  return ops;
}

// ---------------------------------------------------------------------------
// The timeline Review plays — and a renderer would read
// ---------------------------------------------------------------------------

export type TimelineSegment = {
  shotId: string;
  key: string;
  /** 1-based position in song order (a label for people; the id is the identity). */
  index: number;
  /** Song clock, seconds. */
  start: number;
  end: number;
  section: string | null;
  media:
    | { kind: "video"; assetId: string; role: AssignmentRole; sourceIn: number; sourceOut: number | null; leadIn: number; base: boolean }
    | { kind: "image"; assetId: string; role: AssignmentRole; base: false }
    | { kind: "none" };
  /** What the box says happens — shown when there is no media, and carried for the renderer's log. */
  scene: string;
  note: string | null;
};

/**
 * The storyboard as one continuous edit on the song clock: one segment per box, each naming the media it shows and
 * where in that media it starts. Review plays exactly this; a render service reads exactly this. Nothing in it is
 * positional — every segment names the box record it came from.
 */
export function buildTimeline(input: {
  boxes: readonly StoryboardBox[];
  assignments: readonly Assignment[];
  assets: ReadonlyMap<string, MediaAsset>;
  syncs: readonly TakeSync[];
}): TimelineSegment[] {
  return orderBoxes(input.boxes).map((box, i) => {
    const { showing } = boxMedia({ box, assignments: input.assignments, assets: input.assets, syncs: input.syncs });
    const scene = box.spec.origin === "override" && box.spec.performanceDirection ? box.spec.performanceDirection : box.spec.purpose;
    const media: TimelineSegment["media"] = !showing
      ? { kind: "none" }
      : showing.kind === "image"
        ? { kind: "image", assetId: showing.asset.id, role: showing.role, base: false }
        : { kind: "video", assetId: showing.asset.id, role: showing.role, sourceIn: showing.sourceIn ?? 0, sourceOut: showing.sourceOut, leadIn: showing.leadIn, base: showing.base };
    return { shotId: box.id, key: box.key, index: i + 1, start: box.start, end: box.end, section: box.section, media, scene, note: showing?.note ?? null };
  });
}

/** The segment playing at a song time (the last one that has started; null before the first). */
export function segmentAt(timeline: readonly TimelineSegment[], t: number): TimelineSegment | null {
  let hit: TimelineSegment | null = null;
  for (const s of timeline) {
    if (s.start <= t + 1e-6) hit = s;
    else break;
  }
  return hit;
}

/**
 * Where in its media a video segment should be at song time t (seconds inside the asset). Before the media's
 * lead-in has passed it holds on the first frame: the take is not slid forward to fill the box.
 */
export function mediaTimeAt(segment: TimelineSegment, t: number): number | null {
  if (segment.media.kind !== "video") return null;
  const into = Math.max(0, t - segment.start - segment.media.leadIn);
  const at = segment.media.sourceIn + into;
  return segment.media.sourceOut != null ? Math.min(at, segment.media.sourceOut) : at;
}

/** How far past its out-point media must be asked for before it counts as run out (a cut lands on the out-point itself). */
export const RAN_OUT_SLACK = 0.04;

/**
 * What a shot's video should be doing at song time `t`: where its playhead belongs, and whether it runs or holds.
 * It holds its first frame inside a take's lead-in (the recording has not started yet), and its LAST frame once the
 * media has run out before the shot has — a take that ends mid-shot, a clip shorter than its window. A cut that
 * lands exactly on the out-point is not "run out": the same take carries on in the next shot without a pause.
 * `fileSeconds` is the real length of the file when the player knows it.
 */
export function videoStateAt(segment: TimelineSegment, t: number, fileSeconds: number | null = null): { at: number; hold: "lead_in" | "ran_out" | null } | null {
  const m = segment.media;
  if (m.kind !== "video") return null;
  const target = mediaTimeAt(segment, t);
  if (target == null) return null;
  const wanted = m.sourceIn + Math.max(0, t - segment.start - m.leadIn);
  const fileEnd = fileSeconds != null && Number.isFinite(fileSeconds) && fileSeconds > 0 ? fileSeconds : null;
  const ranOut = (m.sourceOut != null && wanted > m.sourceOut + RAN_OUT_SLACK) || (fileEnd != null && wanted >= fileEnd - RAN_OUT_SLACK);
  const at = fileEnd != null ? Math.min(target, Math.max(0, fileEnd - 0.05)) : target;
  const hold = t < segment.start + m.leadIn ? "lead_in" : ranOut ? "ran_out" : null;
  return { at, hold };
}

/** Gaps and overlaps between consecutive boxes (a healthy board has none): what Review reports before it plays. */
export function timelineIssues(timeline: readonly TimelineSegment[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < timeline.length; i++) {
    const gap = timeline[i].start - timeline[i - 1].end;
    if (gap > 0.02) out.push(`${gap.toFixed(2)} s with no box between ${timeline[i - 1].index} and ${timeline[i].index}`);
    if (gap < -0.02) out.push(`boxes ${timeline[i - 1].index} and ${timeline[i].index} overlap by ${(-gap).toFixed(2)} s`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The render plan — the boundary a renderer reads
// ---------------------------------------------------------------------------

export type RenderPlan = {
  version: 1;
  /** Every time in the plan is on this clock unless it says source_*. */
  clock: "song";
  frame: { aspect: ProjectAspect; width: number; height: number; fit: FrameFit };
  song: { asset_id: string; bucket: string; path: string } | null;
  duration_seconds: number;
  segments: {
    shot_id: string;
    key: string;
    index: number;
    song_in: number;
    song_out: number;
    section: string | null;
    scene: string;
    media:
      | { kind: "none" }
      | { kind: "image"; asset_id: string; bucket: string; path: string; role: AssignmentRole }
      | {
          kind: "video";
          asset_id: string;
          bucket: string;
          /** The original file — a renderer reads this, never the lighter copy the browser plays. */
          path: string;
          role: AssignmentRole;
          source_in: number;
          source_out: number | null;
          lead_in: number;
          /** True when the take shows only because nothing was selected on the shot. */
          base_layer: boolean;
        };
  }[];
};

/**
 * The storyboard as a renderer would be handed it: the same timeline Review plays, with every segment's media
 * resolved to its ORIGINAL file and its in/out. A render service added later consumes this and nothing else — it
 * needs no knowledge of treatments, overrides or assignments.
 */
export function renderPlan(
  timeline: readonly TimelineSegment[],
  assets: ReadonlyMap<string, MediaAsset>,
  song: { assetId: string; bucket: string; path: string } | null,
  aspect: ProjectAspect = DEFAULT_PROJECT_ASPECT,
): RenderPlan {
  return {
    version: 1,
    clock: "song",
    // the frame every segment is rendered into; media of another shape is fitted whole (never cropped) unless an
    // edit decision says otherwise
    frame: { aspect, ...frameSize(aspect), fit: DEFAULT_FRAME_FIT },
    song: song ? { asset_id: song.assetId, bucket: song.bucket, path: song.path } : null,
    duration_seconds: timeline.length ? Math.round((timeline[timeline.length - 1].end - timeline[0].start) * 1000) / 1000 : 0,
    segments: timeline.map((s) => {
      const base = { shot_id: s.shotId, key: s.key, index: s.index, song_in: s.start, song_out: s.end, section: s.section, scene: s.scene };
      if (s.media.kind === "none") return { ...base, media: { kind: "none" as const } };
      const a = assets.get(s.media.assetId);
      if (!a) return { ...base, media: { kind: "none" as const } };
      if (s.media.kind === "image") return { ...base, media: { kind: "image" as const, asset_id: a.id, bucket: a.bucket, path: a.path, role: s.media.role } };
      return {
        ...base,
        media: {
          kind: "video" as const,
          asset_id: a.id,
          bucket: a.bucket,
          path: a.path,
          role: s.media.role,
          source_in: s.media.sourceIn,
          source_out: s.media.sourceOut,
          lead_in: s.media.leadIn,
          base_layer: s.media.base,
        },
      };
    }),
  };
}
