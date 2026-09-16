import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  finishingRecipeCompatibleWithHandoff,
  handoffBlocksE2e,
  validateReconstructedMasterHandoff,
} from "./finishingHandoff";
import { createDisabledHarnessConfig } from "./finishingHarness";

const dir = dirname(fileURLToPath(import.meta.url));

const timelineOnlyRecipe = JSON.parse(
  readFileSync(
    resolve(dir, "../../../docs/research/finishing/sample_finishing_recipe.json"),
    "utf8",
  ),
) as Record<string, unknown>;

const sampleHandoff = JSON.parse(
  readFileSync(
    resolve(dir, "../../../docs/research/finishing/sample_reconstructed_master_handoff.json"),
    "utf8",
  ),
) as Record<string, unknown>;

const sampleRecipe = JSON.parse(
  readFileSync(
    resolve(dir, "../../../docs/research/finishing/sample_reconstructed_master_recipe.json"),
    "utf8",
  ),
) as Record<string, unknown>;

function encodedHandoff(): Record<string, unknown> {
  return {
    ...sampleHandoff,
    encode_status: "encoded",
    master: {
      relpath: "unzipped-export/reconstructed_master/master.mp4",
      mime: "video/mp4",
      content_hash: "sha256:fixture-not-a-real-hash",
    },
    not_claimed: [
      "live 720×1280 pixels of original master 76fe7438",
      "live SAM-3 fetch via sam3-segment-proxy / Control Center",
    ],
  };
}

describe("reconstructed-master finishing handoff", () => {
  it("accepts the checked-in provenance-only sidecar (current E2E: no MP4 claimed)", () => {
    const result = validateReconstructedMasterHandoff(sampleHandoff);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(sampleHandoff.encode_status).toBe("not_claimed");
    expect(sampleHandoff.blocks_e2e).toBe(false);
    expect(sampleHandoff.paid_calls).toBe(false);
    expect(sampleHandoff.astra_required).toBe(false);
    expect(handoffBlocksE2e(sampleHandoff)).toBe(false);
  });

  it("accepts an encoded sidecar once Lane H supplies master.relpath", () => {
    const result = validateReconstructedMasterHandoff(encodedHandoff());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects finishing as an E2E gate", () => {
    const result = validateReconstructedMasterHandoff({
      ...sampleHandoff,
      blocks_e2e: true,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "e2e")).toBe(true);
    expect(handoffBlocksE2e({ ...sampleHandoff, blocks_e2e: true })).toBe(true);
  });

  it("rejects Astra / paid spend on the sidecar", () => {
    const astra = validateReconstructedMasterHandoff({
      ...sampleHandoff,
      astra_required: true,
    });
    expect(astra.ok).toBe(false);
    expect(astra.errors.some((e) => e.code === "spend")).toBe(true);

    const paid = validateReconstructedMasterHandoff({
      ...sampleHandoff,
      paid_calls: true,
    });
    expect(paid.ok).toBe(false);
    expect(paid.errors.some((e) => e.code === "spend")).toBe(true);
  });

  it("rejects recut / regenerate / non-single-clip import", () => {
    const recut = validateReconstructedMasterHandoff({
      ...sampleHandoff,
      finishing: { ...(sampleHandoff.finishing as object), recut: true },
    });
    expect(recut.ok).toBe(false);
    expect(recut.errors.some((e) => e.code === "finishing")).toBe(true);

    const sequence = validateReconstructedMasterHandoff({
      ...sampleHandoff,
      finishing: { ...(sampleHandoff.finishing as object), import_mode: "sequence" },
    });
    expect(sequence.ok).toBe(false);
  });

  it("rejects inventing an MP4 path before Lane H encodes", () => {
    const result = validateReconstructedMasterHandoff({
      ...sampleHandoff,
      encode_status: "not_claimed",
      master: { relpath: "reconstructed_master/master.mp4", mime: "video/mp4" },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "encode")).toBe(true);
  });

  it("rejects encoded status without a relpath", () => {
    const result = validateReconstructedMasterHandoff({
      ...sampleHandoff,
      encode_status: "encoded",
      master: { relpath: null, mime: "video/mp4" },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "encode")).toBe(true);
  });

  it("pairs the sample UXP recipe with a not_claimed handoff (no AME of missing master)", () => {
    const result = finishingRecipeCompatibleWithHandoff(sampleRecipe, sampleHandoff);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects AME export of the reconstructed master before encode", () => {
    const recipe = {
      ...sampleRecipe,
      actions: [
        ...(sampleRecipe.actions as object[]),
        {
          op: "queue_ame_export",
          runner: "uxp",
          preset_path: "presets/avt_master_h264.epr",
          output_path: "out/master.mp4",
        },
      ],
    };
    const result = finishingRecipeCompatibleWithHandoff(recipe, sampleHandoff);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "encode")).toBe(true);
  });

  it("allows AME after Lane H encodes", () => {
    const recipe = {
      ...sampleRecipe,
      actions: [
        ...(sampleRecipe.actions as object[]),
        {
          op: "queue_ame_export",
          runner: "uxp",
          preset_path: "presets/avt_master_h264.epr",
          output_path: "out/master.mp4",
        },
      ],
    };
    const result = finishingRecipeCompatibleWithHandoff(recipe, encodedHandoff());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("does not treat the timeline-only ZIP recipe as a reconstructed-master handoff", () => {
    const result = finishingRecipeCompatibleWithHandoff(timelineOnlyRecipe, sampleHandoff);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "recipe" || e.code === "encode")).toBe(true);
  });

  it("does not enable Astra via the finishing harness", () => {
    const config = createDisabledHarnessConfig();
    expect(config.astra.enabled).toBe(false);
    expect(config.spend.max_usd).toBe(0);
  });
});
