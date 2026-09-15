import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createDisabledHarnessConfig,
  astraRunnerEnabled,
} from "./finishingHarness";
import {
  validateFinishingRecipe,
  workspacePathAllowed,
} from "./finishingRecipe";

const sample = JSON.parse(
  readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../docs/research/finishing/sample_finishing_recipe.json",
    ),
    "utf8",
  ),
) as unknown;

describe("finishingRecipe validator", () => {
  it("accepts the checked-in UXP-only sample recipe", () => {
    const result = validateFinishingRecipe(sample);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects unknown ops (no generic click/type escape hatch)", () => {
    const result = validateFinishingRecipe({
      ...(sample as object),
      actions: [{ op: "click", runner: "astra" }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "op")).toBe(true);
  });

  it("rejects Astra ops while spend is locked at $0", () => {
    const result = validateFinishingRecipe({
      ...(sample as object),
      actions: [{ op: "astra_visual_adjust", runner: "astra" }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "spend")).toBe(true);
  });

  it("rejects After Effects host in v1", () => {
    const result = validateFinishingRecipe({
      ...(sample as object),
      host: "after_effects",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "host")).toBe(true);
  });

  it("rejects Architecture C and iCloud workspace roots", () => {
    expect(workspacePathAllowed("/Volumes/T7/avt-finishing/ok")).toBe(true);
    expect(
      workspacePathAllowed(
        "/Users/x/Library/Mobile Documents/com~apple~CloudDocs/FENDI FILES",
      ),
    ).toBe(false);
    expect(
      workspacePathAllowed("/workspace/docs/research/architecture-c-still"),
    ).toBe(false);
    const result = validateFinishingRecipe({
      ...(sample as object),
      workspace_root: "/tmp/architecture-c/chest",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "workspace")).toBe(true);
  });

  it("rejects assigning a UXP op to the Astra runner", () => {
    const result = validateFinishingRecipe({
      ...(sample as object),
      actions: [
        {
          op: "import_fcpxml",
          runner: "astra",
          path: "timeline.fcpxml",
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "runner")).toBe(true);
  });

  it("rejects empty actions and home-directory roots", () => {
    expect(validateFinishingRecipe({ ...(sample as object), actions: [] }).ok).toBe(
      false,
    );
    expect(workspacePathAllowed("/")).toBe(false);
    expect(workspacePathAllowed("/Users")).toBe(false);
  });
});

describe("finishingHarness", () => {
  it("ships with Astra disabled and $0 spend", () => {
    const config = createDisabledHarnessConfig();
    expect(config.astra.enabled).toBe(false);
    expect(config.astra.max_steps).toBe(0);
    expect(config.spend.max_usd).toBe(0);
    expect(config.allow_network).toBe(false);
    expect(astraRunnerEnabled(config)).toBe(false);
  });
});
