import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importSpecifiers, scanEdgeFunctions, violationFor } from "./check-edge-imports.mjs";

const root = resolve("supabase/functions");

describe("edge deploy imports", () => {
  it("reads a from-clause and a side-effect import", () => {
    const specs = importSpecifiers(`import { a } from "../_shared/editModel.ts";\nimport "./local.ts";\n`);
    expect(specs).toEqual(["../_shared/editModel.ts", "./local.ts"]);
  });

  it("allows a function to import _shared and refuses src and a sibling function", () => {
    const file = resolve(root, "performance-sync/index.ts");
    expect(violationFor(file, "../_shared/performanceAlign.ts", root)).toBeNull();
    expect(violationFor(file, "../../../src/lib/storyboard/performanceAlign.ts", root)?.spec).toContain(
      "src/",
    );
    expect(violationFor(file, "../edit-render/model.ts", root)?.resolved).toContain("edit-render");
  });

  it("refuses a shared module that reaches into a function", () => {
    const file = resolve(root, "_shared/performanceAlign.ts");
    expect(violationFor(file, "./syncMatch.ts", root)).toBeNull();
    expect(violationFor(file, "../edit-render/index.ts", root)).not.toBeNull();
  });

  it("the deployed functions stay inside their folder or _shared", () => {
    expect(scanEdgeFunctions(root)).toEqual([]);
  });
});
