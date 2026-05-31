import { describe, expect, it } from "vitest";
import { buildSeedTimelineRows } from "./seedTimeline";
import type { Shot, StoryboardNode } from "@/integrations/supabase/aliases";

describe("buildSeedTimelineRows", () => {
  it("falls back to shots when no storyboard nodes", () => {
    const shots: Shot[] = [
      {
        id: "s1",
        shot_number: 1,
        timestamp_start: 0,
        timestamp_end: 4,
        song_section: "verse",
      } as Shot,
    ];
    const rows = buildSeedTimelineRows({
      manifestId: "m1",
      frameRate: 24,
      nodes: [],
      shots,
      assets: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.shot_id).toBe("s1");
    expect(rows[0]?.start_frame).toBe(0);
    expect(rows[0]?.end_frame).toBe(96);
  });

  it("uses storyboard nodes when present", () => {
    const nodes: StoryboardNode[] = [
      {
        id: "n1",
        node_order: 0,
        shot_id: "s1",
        timestamp_start_seconds: 0,
        timestamp_end_seconds: 2,
      } as StoryboardNode,
    ];
    const rows = buildSeedTimelineRows({
      manifestId: "m1",
      frameRate: 24,
      nodes,
      shots: [],
      assets: [],
    });
    expect(rows[0]?.storyboard_node_id).toBe("n1");
    expect(rows[0]?.end_frame).toBe(48);
  });
});
