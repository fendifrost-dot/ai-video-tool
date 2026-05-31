import type { TimelineItem } from "@/lib/timeline/types";

export type TimelineValidationIssue = {
  code: "overlap" | "past_duration" | "invalid_range";
  message: string;
  itemId?: string;
};

export function validateTimelineItems(
  items: Pick<TimelineItem, "id" | "track" | "start_frame" | "end_frame">[],
  durationFrames: number | null,
): TimelineValidationIssue[] {
  const issues: TimelineValidationIssue[] = [];

  for (const item of items) {
    if (item.end_frame <= item.start_frame) {
      issues.push({
        code: "invalid_range",
        message: `Item ${item.id}: end_frame must be greater than start_frame`,
        itemId: item.id,
      });
    }
    if (durationFrames != null && item.end_frame > durationFrames) {
      issues.push({
        code: "past_duration",
        message: `Item ${item.id}: end_frame ${item.end_frame} exceeds manifest duration ${durationFrames}`,
        itemId: item.id,
      });
    }
  }

  const byTrack = new Map<string, typeof items>();
  for (const item of items) {
    const list = byTrack.get(item.track) ?? [];
    list.push(item);
    byTrack.set(item.track, list);
  }

  for (const [track, trackItems] of byTrack) {
    const sorted = [...trackItems].sort((a, b) => a.start_frame - b.start_frame);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;
      if (curr.start_frame < prev.end_frame) {
        issues.push({
          code: "overlap",
          message: `Track ${track}: items ${prev.id} and ${curr.id} overlap in time`,
          itemId: curr.id,
        });
      }
    }
  }

  return issues;
}

export function assertTimelineValid(
  items: Parameters<typeof validateTimelineItems>[0],
  durationFrames: number | null,
): void {
  const issues = validateTimelineItems(items, durationFrames);
  if (issues.length > 0) {
    throw new Error(issues.map((i) => i.message).join("; "));
  }
}
