import { describe, expect, it } from "vitest";
import {
  isOnModelReference,
  pickGrokVideoEditReferencePaths,
} from "./garmentReference.ts";

describe("pickGrokVideoEditReferencePaths", () => {
  it("excludes on-model refs and returns at most one flat path (R4 config)", () => {
    const paths = pickGrokVideoEditReferencePaths(
      [
        {
          angle: "on_model",
          label: "on-model YSL model",
          storage_path: "artist/onmodel.png",
        },
        {
          angle: "front",
          storage_path: "artist/flat-front.jpg",
        },
      ],
      "artist/onmodel.png",
      1,
    );

    expect(paths).toEqual(["artist/flat-front.jpg"]);
    expect(paths.some((p) => p.includes("onmodel"))).toBe(false);
  });

  it("returns empty when only on-model refs exist", () => {
    const paths = pickGrokVideoEditReferencePaths(
      [
        {
          angle: "on_model",
          label: "on-model lookbook",
          storage_path: "artist/onmodel.png",
        },
      ],
      null,
      1,
    );
    expect(paths).toEqual([]);
  });

  it("fail-closed: no flat refs + non-null on-model fallbackPath → []", () => {
    const paths = pickGrokVideoEditReferencePaths(
      [
        {
          angle: "on_model",
          label: "on-model YSL model",
          storage_path: "artist/onmodel.png",
        },
      ],
      "artist/onmodel.png",
      1,
    );
    expect(paths).toEqual([]);
  });

  it("fail-closed: ignores non-on-model fallbackPath when refs have no flat", () => {
    const paths = pickGrokVideoEditReferencePaths(
      [
        {
          angle: "on_model",
          label: "on-model lookbook",
          storage_path: "artist/onmodel.png",
        },
      ],
      "artist/some-other-path.jpg",
      1,
    );
    expect(paths).toEqual([]);
  });
});

describe("isOnModelReference", () => {
  it("detects on-model angle labels", () => {
    expect(isOnModelReference({ angle: "on_model" })).toBe(true);
    expect(isOnModelReference({ angle: "front" })).toBe(false);
  });
});
