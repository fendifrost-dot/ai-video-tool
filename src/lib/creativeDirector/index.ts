/**
 * Creative Director (Lane D · Treatment UX Sprint) — public surface.
 *
 * Boundary: source footage + song/timing + wardrobe refs + creative brief +
 * capabilities → a complete, filmmaker-language {@link ShotSpec} sequence.
 *
 * The default planner is deterministic and free (no paid generations). Consumers
 * (e.g. the Treatment Builder, Lane B) import {@link CreativeDirectorPanel} or
 * call {@link planWithMock} / a registered {@link CreativeDirectorPlanner}.
 */

export * from "@/lib/creativeDirector/types";
export * from "@/lib/creativeDirector/capabilities";
export {
  MockCreativeDirectorPlanner,
  planWithMock,
  registerPlanner,
  getPlanner,
  listPlanners,
  DEFAULT_PLANNER_ID,
  type CreativeDirectorPlanner,
} from "@/lib/creativeDirector/planner";
