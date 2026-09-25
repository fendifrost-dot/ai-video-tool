import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildHeroRequest, composeHeroPrompt, HERO_PROVIDERS, POSE_LOCK_CONSTRAINTS, rankHeroProviders } from "./poseLockedHero.ts";

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

Deno.test("pose-lock law is stated first, then the Look's construction facts, then the body", () => {
  const p = composeHeroPrompt(req.constraints, req.promptBody);
  assert(p.startsWith(POSE_LOCK_CONSTRAINTS[0] + "."));
  const lawEnd = p.indexOf("Do not solve garment placement");
  const factsAt = p.indexOf("THE JACKET IS ZIPPED CLOSED.");
  const bodyAt = p.indexOf("Sand-beige knit");
  assert(lawEnd < factsAt && factsAt < bodyAt);
});

Deno.test("providers rank by geometry guarantee: mask > try_on > prompt > none; unverified last", () => {
  const ids = rankHeroProviders().map((s) => s.id);
  assertEquals(ids, ["fal_inpaint_masked", "fal_vton", "xai_image_edit", "runway_image_reference"]);
  for (const s of Object.values(HERO_PROVIDERS)) {
    assert(s.geometryEvidence.length > 40 && s.garmentEvidence.length > 20, `${s.id} carries evidence`);
  }
});

Deno.test("xAI route carries the approved realisation as the anchor and the composed prompt", () => {
  const b = buildHeroRequest({ ...req, provider: "xai_image_edit" });
  assertEquals(b.edgeFunction, "grok-image-garment-proxy");
  assertEquals(b.body.anchorPath, req.canonicalLook.path);
  assertEquals(b.body.scenePath, req.sourceFrame.path);
  assertEquals(b.body.referenceMode, "full_look");
  assertStringIncludes(String(b.body.prompt), "Keep the person's identity");
});

Deno.test("default provider is the strongest available mechanism", () => {
  const b = buildHeroRequest(req);
  assertEquals(b.provider, "fal_inpaint_masked");
  assertEquals(b.mechanism, "mask");
  assertEquals(b.body.wardrobeFeatureId, "feature-jacket");
  assertEquals(b.body.controlnet, "pose");
});

Deno.test("a retired lane is never selected by default", () => {
  const specs = { ...HERO_PROVIDERS, fal_inpaint_masked: { ...HERO_PROVIDERS.fal_inpaint_masked, status: "retired" as const } };
  const b = buildHeroRequest(req, specs);
  assertEquals(b.provider, "fal_vton");
});
