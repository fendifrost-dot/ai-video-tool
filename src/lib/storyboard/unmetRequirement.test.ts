/**
 * The check that stops a draft reading as finished while the original take stands in for work not done.
 *
 * The case is the real one: Interrupted Broadcast's performance shots 19–24 sit inside scenes that dress Fendi in
 * the leather coat (62.75–96.08 s) and the Mastic jacket (96.08–123.53 s), while the only synced take is
 * hero_clip_hd_1080.mp4 — filmed in a camo shirt and a navy cap. With no replacement chosen, `boxMedia` resolved
 * each of those shots to the inherited take and the cut looked complete.
 */
import { describe, expect, it } from "vitest";
import { productionRoute, unmetRequirement, type ProductionRoute } from "./route";
import type { ShotSpec } from "@/lib/treatment/shotSpec";

const ON_TAKE = { onBaseTake: true, empty: false };
const ON_OWN = { onBaseTake: false, empty: false };
const NOTHING = { onBaseTake: false, empty: true };

/** A performance shot the treatment redresses — shots 19–23, dressed by the Chicago scene's leather coat. */
const redressedPerformance = {
  shotType: "performance",
  production: { method: "restage" },
  wardrobe: { source: "treatment", description: "his exact YSL leather coat", garments: [] },
  timeline: { start: 70.59, end: 76.47 },
} as unknown as Pick<ShotSpec, "production" | "shotType" | "wardrobe" | "timeline">;

/** The same shot with nothing redressing him: the take as filmed is the deliverable. */
const asFilmed = {
  shotType: "performance",
  production: { method: "footage" },
  wardrobe: { source: "none", description: "", garments: [] },
  timeline: { start: 70.59, end: 76.47 },
} as unknown as Pick<ShotSpec, "production" | "shotType" | "wardrobe" | "timeline">;

const FACTS = { hasTake: true, maxRestageSeconds: 10 } as Parameters<typeof productionRoute>[1];

describe("a performance shot the treatment redresses, playing the unchanged take", () => {
  const route = productionRoute(redressedPerformance, FACTS);

  it("routes to the garment lane rather than the storyboard — which was already true", () => {
    expect(route.verdict).toBe("elsewhere");
    expect(route.where).toMatch(/Garment lane/);
  });

  it("is reported as UNFINISHED, not as a shot that has its footage", () => {
    const unmet = unmetRequirement(route, ON_TAKE)!;
    expect(unmet).not.toBeNull();
    expect(unmet.kind).toBe("fallback");
    expect(unmet.text).toMatch(/not finished/);
    expect(unmet.text).toMatch(/standing in for work that has not been done/);
  });

  it("carries the route's own reason and says where the work happens", () => {
    const unmet = unmetRequirement(route, ON_TAKE)!;
    expect(unmet.text).toMatch(/restaging keeps the clothes/);
    expect(unmet.fix).toMatch(/outside the storyboard/);
    expect(unmet.where).toMatch(/Garment lane/);
  });

  it("is silent once something made for the shot is playing", () => {
    expect(unmetRequirement(route, ON_OWN)).toBeNull();
  });
});

describe("the honest case", () => {
  it("a shot MEANT to play the take as filmed is finished, not flagged", () => {
    const route = productionRoute(asFilmed, FACTS);
    expect(route.verdict).toBe("storyboard");
    expect(unmetRequirement(route, ON_TAKE)).toBeNull();
  });

  it("but the same shot is flagged when the treatment dresses him and the footage cannot", () => {
    const dressed = {
      ...asFilmed,
      wardrobe: { source: "treatment", description: "his exact YSL leather coat", garments: [] },
    } as unknown as typeof asFilmed;
    const route = productionRoute(dressed, FACTS);
    expect(route.verdict).toBe("unsupported");
    expect(unmetRequirement(route, ON_TAKE)!.kind).toBe("fallback");
  });
});

describe("a shot the storyboard itself should have made", () => {
  it("says so plainly instead of pointing elsewhere", () => {
    const cutaway = {
      shotType: "b_roll",
      production: { method: "generate" },
      wardrobe: { source: "none", description: "", garments: [] },
      timeline: { start: 0, end: 3.92 },
    } as unknown as Pick<ShotSpec, "production" | "shotType" | "wardrobe" | "timeline">;
    const route = productionRoute(cutaway, { hasTake: false } as Parameters<
      typeof productionRoute
    >[1]);
    const unmet = unmetRequirement(route, ON_TAKE)!;
    expect(unmet.fix).toMatch(/Make it on the storyboard/);
    expect(unmet.where).toBeNull();
  });
});

describe("a shot playing nothing", () => {
  it("is reported as empty, with where it would be made", () => {
    const route = productionRoute(redressedPerformance, FACTS);
    const unmet = unmetRequirement(route, NOTHING)!;
    expect(unmet.kind).toBe("none");
    expect(unmet.text).toBe("Nothing plays on this shot.");
    expect(unmet.fix).toMatch(/Garment lane/);
  });

  it("empty wins over the base-take reading, so one shot yields one answer", () => {
    const route = productionRoute(redressedPerformance, FACTS);
    expect(unmetRequirement(route, { onBaseTake: true, empty: true })!.kind).toBe("none");
  });
});

describe("the shape the UI depends on", () => {
  it("never returns a fallback without saying where or how to fix it", () => {
    const routes: ProductionRoute[] = [
      productionRoute(redressedPerformance, FACTS),
      productionRoute(asFilmed, FACTS),
    ];
    for (const r of routes) {
      const unmet = unmetRequirement(r, ON_TAKE);
      if (unmet) expect(unmet.fix.length).toBeGreaterThan(0);
    }
  });
});
