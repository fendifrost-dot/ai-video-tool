// @vitest-environment node
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module
import { DEFAULT_BLENDER, capabilityManifest, parseBlenderVersion } from "./blenderProbe.mjs";

describe("blender capability manifest", () => {
  it("parses blender --version text and does not run a binary", async () => {
    expect(parseBlenderVersion("Blender 5.2.4\n\tbuild date: 2026-01-01\n\tbuild hash: abc\n")).toBe("5.2.4");
    expect(parseBlenderVersion("Blender 4.2.3 LTS\n")).toBe("4.2.3");
    expect(DEFAULT_BLENDER).toBe("/workspace/tools/blender/current/blender");
    let launched = false;
    const manifest = await capabilityManifest({
      spawnImpl: async (bin, args) => {
        launched = true;
        expect(bin).toBe(DEFAULT_BLENDER);
        expect(args).toEqual(["--version"]);
        return "Blender 5.2.4\n";
      },
    });
    expect(launched).toBe(true);
    expect(manifest.tool_versions.blender).toBe("5.2.4");
    expect(manifest.skill_dependency).toEqual({ name: "blender", constraint: ">=5.2" });
    expect(manifest.blender_bin).toBe(DEFAULT_BLENDER);
  });

  it("leaves the version empty when the probe cannot run", async () => {
    const manifest = await capabilityManifest({
      spawnImpl: async () => {
        throw new Error("not installed");
      },
    });
    expect(manifest.tool_versions.blender).toBeUndefined();
  });
});