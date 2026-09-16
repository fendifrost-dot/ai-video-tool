import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  bindRecipeToHandoffIdentity,
  createReconstructedMasterHandoff,
  F2_DEMO_HANDOFF_IDENTITY,
  F2_SECOND_CLIP_HANDOFF_IDENTITY,
  finishingRecipeCompatibleWithHandoff,
  finishingWorkspaceRootForProject,
  handoffBlocksE2e,
  validateReconstructedMasterHandoff,
  type FinishingHandoffIdentity,
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

const secondHandoff = JSON.parse(
  readFileSync(
    resolve(dir, "../../../docs/research/finishing/fixtures/second_clip_handoff.json"),
    "utf8",
  ),
) as Record<string, unknown>;

const secondRecipe = JSON.parse(
  readFileSync(
    resolve(dir, "../../../docs/research/finishing/fixtures/second_clip_recipe.json"),
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

describe("reconstructed-master handoff portability (second clip/project)", () => {
  it("accepts the synthetic second-clip fixture without demo ids", () => {
    expect(secondHandoff.project_id).not.toBe(sampleHandoff.project_id);
    expect(secondHandoff.master_clip_asset_id).not.toBe(sampleHandoff.master_clip_asset_id);
    expect(secondHandoff.master_clip_asset_id).not.toBe("76fe7438-671d-4428-a7f6-17a45e98c16f");
    const result = validateReconstructedMasterHandoff(secondHandoff);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(secondHandoff.paid_calls).toBe(false);
    expect(secondHandoff.astra_required).toBe(false);
    expect(secondHandoff.blocks_e2e).toBe(false);
  });

  it("pairs the second-clip recipe with the second-clip sidecar", () => {
    const result = finishingRecipeCompatibleWithHandoff(secondRecipe, secondHandoff);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects mixing the demo recipe with the second-clip sidecar", () => {
    const result = finishingRecipeCompatibleWithHandoff(sampleRecipe, secondHandoff);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "recipe")).toBe(true);
  });

  it("factory parameterizes arbitrary UUID identities (no demo allowlist)", () => {
    const third: FinishingHandoffIdentity = {
      project_id: "01234567-89ab-4cde-8f01-23456789abcd",
      master_clip_asset_id: "fedcba98-7654-4321-8abc-def012345678",
      chest_asset_id: "aaaa1111-bbbb-4ccc-8ddd-eeee22223333",
      sleeve_asset_id: "ffff0000-1111-4222-8333-444455556666",
    };
    expect(third.master_clip_asset_id).not.toBe(F2_DEMO_HANDOFF_IDENTITY.master_clip_asset_id);
    expect(third.master_clip_asset_id).not.toBe(F2_SECOND_CLIP_HANDOFF_IDENTITY.master_clip_asset_id);

    const demo = createReconstructedMasterHandoff(F2_DEMO_HANDOFF_IDENTITY);
    const second = createReconstructedMasterHandoff(F2_SECOND_CLIP_HANDOFF_IDENTITY, {
      frame_count: 4,
      temporal_job_count: 2,
    });
    const other = createReconstructedMasterHandoff(third);

    for (const sidecar of [demo, second, other]) {
      const result = validateReconstructedMasterHandoff(sidecar);
      expect(result.ok).toBe(true);
      expect(sidecar.paid_calls).toBe(false);
      expect(sidecar.astra_required).toBe(false);
      expect(sidecar.blocks_e2e).toBe(false);
    }
  });

  it("rejects nickname clip ids that are not UUIDs", () => {
    const result = validateReconstructedMasterHandoff({
      ...sampleHandoff,
      master_clip_asset_id: "ice-on-canonical-demo",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "provenance")).toBe(true);
  });

  it("binds a demo recipe onto the second identity without new F2 modules", () => {
    const bound = bindRecipeToHandoffIdentity(sampleRecipe, F2_SECOND_CLIP_HANDOFF_IDENTITY);
    const rec = bound as Record<string, unknown>;
    expect(rec.project_id).toBe(F2_SECOND_CLIP_HANDOFF_IDENTITY.project_id);
    expect(rec.workspace_root).toBe(
      finishingWorkspaceRootForProject(F2_SECOND_CLIP_HANDOFF_IDENTITY.project_id),
    );
    const result = finishingRecipeCompatibleWithHandoff(bound, secondHandoff);
    expect(result.ok).toBe(true);
  });

  it("allows Resolve ingest of a second clip with no UXP recipe", () => {
    const resolveHandoff = createReconstructedMasterHandoff(F2_SECOND_CLIP_HANDOFF_IDENTITY, {
      finishing: { host: "resolve" },
    });
    expect(validateReconstructedMasterHandoff(resolveHandoff).ok).toBe(true);
    expect(finishingRecipeCompatibleWithHandoff(null, resolveHandoff).ok).toBe(true);
    expect(finishingRecipeCompatibleWithHandoff(secondRecipe, resolveHandoff).ok).toBe(false);
  });

  it("factory cannot turn Astra or E2E blocking on", () => {
    const sidecar = createReconstructedMasterHandoff(F2_SECOND_CLIP_HANDOFF_IDENTITY);
    expect(sidecar.astra_required).toBe(false);
    expect(sidecar.paid_calls).toBe(false);
    expect(sidecar.blocks_e2e).toBe(false);
    expect(handoffBlocksE2e(sidecar)).toBe(false);
    expect(createDisabledHarnessConfig().astra.enabled).toBe(false);
  });
});
