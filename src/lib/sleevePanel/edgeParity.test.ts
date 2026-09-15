import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { repairVisibleSleevePanelsOnStill as srcRepair } from "./liveStill";
import { repairVisibleSleevePanelsOnStill as edgeRepair } from "../../../supabase/functions/_shared/sleevePanel/liveStill.ts";
import { LEFT_VISIBLE_QUAD, RIGHT_VISIBLE_QUAD, buildCrossedArmsSleeveFixture } from "./fixtures";
import { rgbaFingerprint } from "./raster";
import { SLEEVE_STILL_REPAIR_METHOD_VERSION } from "./liveStill";

const MIRROR_FILES = [
  "types.ts",
  "raster.ts",
  "contract.ts",
  "visibleGeometry.ts",
  "navyFill.ts",
  "repair.ts",
  "liveStill.ts",
] as const;

describe("edge sleevePanel mirror stays in sync with src", () => {
  it("mirrors differ only by Deno .ts import extensions + banner", () => {
    for (const file of MIRROR_FILES) {
      const src = readFileSync(resolve("src/lib/sleevePanel", file), "utf8");
      const edge = readFileSync(resolve("supabase/functions/_shared/sleevePanel", file), "utf8");
      const srcNorm = src.replace(/from "(\.\/[^"]+)"/g, 'from "$1.ts"').trim();
      const edgeNorm = edge
        .replace(/^\/\*\* Edge mirror of src\/lib\/sleevePanel\/[^*]+\*\/\n/, "")
        .trim();
      expect(edgeNorm).toBe(srcNorm);
    }
  });

  it("src and edge live adapters produce the same fixture fingerprint", () => {
    const fx = buildCrossedArmsSleeveFixture();
    const input = {
      still: fx.still,
      flatRef: fx.flatRef,
      panels: [
        {
          side: "left" as const,
          targetQuad: LEFT_VISIBLE_QUAD,
          sourceBboxNorm: fx.panels[0].sourceBboxNorm,
        },
        {
          side: "right" as const,
          targetQuad: RIGHT_VISIBLE_QUAD,
          sourceBboxNorm: fx.panels[1].sourceBboxNorm,
        },
      ],
      visibleMask: fx.visibleMask,
      hiddenMask: fx.hiddenMask,
    };
    const a = srcRepair(input);
    const b = edgeRepair(input);
    expect(a.meta.repair_method_version).toBe(SLEEVE_STILL_REPAIR_METHOD_VERSION);
    expect(b.meta.repair_method_version).toBe(SLEEVE_STILL_REPAIR_METHOD_VERSION);
    expect(rgbaFingerprint(a.still)).toBe(rgbaFingerprint(b.still));
    expect(a.output.claims.hiddenShoulderToCuffValidated).toBe(false);
    expect(b.output.claims.hiddenShoulderToCuffValidated).toBe(false);
  });
});
