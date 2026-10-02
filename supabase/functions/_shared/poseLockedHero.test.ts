// Converted from a Deno test to vitest (2026-10-02): the file imported
// `https://deno.land/std/assert`, which the default ESM loader cannot resolve, so vitest
// failed to COLLECT it — 0 tests failed and 0 ran. AVT has no `deno test` script, so these
// five assertions were running nowhere while the suite read as green. Every sibling
// `_shared/*.test.ts` is a vitest test; this one now matches. The assertions are unchanged.
import { describe, expect, it } from "vitest";
import {
  buildHeroRequest,
  composeHeroPrompt,
  HERO_PROVIDERS,
  POSE_LOCK_CONSTRAINTS,
  rankHeroProviders,
} from "./poseLockedHero.ts";

const req = {
  artistId: "artist-1",
  projectId: "project-1",
  sourceFrame: { bucket: "project-exports", path: "sched/S08/hero_source_00084.png" },
  sourceShotId: "S08",
  sourceFrameIndex: 84,
  lookId: "look-1",
  primaryWardrobeFeatureId: "feature-jacket",
  canonicalLook: { bucket: "look-composites", path: "heroes/anchor_hook_s11_f0080.jpg" },
  productReferences: [{ bucket: "wardrobe", path: "jacket_flat.jpg" }],
  identityReferences: [],
  constraints: ["THE JACKET IS ZIPPED CLOSED", "Its collar STANDS UP"],
  promptBody: "Sand-beige knit track jacket with one narrow navy chest band.",
};

describe("poseLockedHero", () => {
  it("states the pose-lock law first, then the Look's construction facts, then the body", () => {
    const p = composeHeroPrompt(req.constraints, req.promptBody);
    expect(p.startsWith(POSE_LOCK_CONSTRAINTS[0] + ".")).toBe(true);
    const lawEnd = p.indexOf("Do not solve garment placement");
    const factsAt = p.indexOf("THE JACKET IS ZIPPED CLOSED.");
    const bodyAt = p.indexOf("Sand-beige knit");
    expect(lawEnd).toBeLessThan(factsAt);
    expect(factsAt).toBeLessThan(bodyAt);
  });

  it("ranks providers by geometry guarantee: mask > try_on > prompt > none; unverified last", () => {
    const ids = rankHeroProviders().map((s) => s.id);
    expect(ids).toEqual([
      "fal_inpaint_masked",
      "fal_vton",
      "xai_image_edit",
      "runway_image_reference",
    ]);
    for (const s of Object.values(HERO_PROVIDERS)) {
      expect(s.geometryEvidence.length, `${s.id} carries geometry evidence`).toBeGreaterThan(40);
      expect(s.garmentEvidence.length, `${s.id} carries garment evidence`).toBeGreaterThan(20);
    }
  });

  it("carries the approved realisation as the anchor and the composed prompt on the xAI route", () => {
    const b = buildHeroRequest({ ...req, provider: "xai_image_edit" });
    expect(b.edgeFunction).toBe("grok-image-garment-proxy");
    expect(b.body.anchorPath).toBe(req.canonicalLook.path);
    expect(b.body.scenePath).toBe(req.sourceFrame.path);
    expect(b.body.referenceMode).toBe("full_look");
    expect(String(b.body.prompt)).toContain("Keep the person's identity");
  });

  it("defaults to the strongest available mechanism", () => {
    const b = buildHeroRequest(req);
    expect(b.provider).toBe("fal_inpaint_masked");
    expect(b.mechanism).toBe("mask");
    expect(b.body.wardrobeFeatureId).toBe("feature-jacket");
    expect(b.body.controlnet).toBe("pose");
    // a masked lane gets the garment prompt, not the pose law
    expect(String(b.prompt)).not.toContain("Keep the person's identity");
    expect(String(b.prompt).startsWith("THE JACKET IS ZIPPED CLOSED.")).toBe(true);
  });

  it("never selects a retired lane by default", () => {
    const specs = {
      ...HERO_PROVIDERS,
      fal_inpaint_masked: { ...HERO_PROVIDERS.fal_inpaint_masked, status: "retired" as const },
    };
    const b = buildHeroRequest(req, specs);
    expect(b.provider).toBe("fal_vton");
  });
});
