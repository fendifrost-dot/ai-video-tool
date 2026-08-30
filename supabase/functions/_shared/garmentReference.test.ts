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

  it("canonical SL jacket: picks the flat front path and never the on-model crop", () => {
    const paths = pickGrokVideoEditReferencePaths(
      [
        {
          angle: "on_model",
          label: "on-model YSL model (IMG_5541)",
          storage_path:
            "65cf99cb-fd18-4168-b9ab-dfbfd42112ca/8d4a4d22-41c0-43ab-ba99-92750f81e335/onmodel_img5541_1782258480.png",
        },
        {
          angle: "front",
          storage_path:
            "65cf99cb-fd18-4168-b9ab-dfbfd42112ca/8d4a4d22-41c0-43ab-ba99-92750f81e335/2a14a72b-e7de-4ecb-9c24-4142b672d175.jpg",
        },
      ],
      "65cf99cb-fd18-4168-b9ab-dfbfd42112ca/8d4a4d22-41c0-43ab-ba99-92750f81e335/onmodel_img5541_1782258480.png",
      1,
    );
    expect(paths).toEqual([
      "65cf99cb-fd18-4168-b9ab-dfbfd42112ca/8d4a4d22-41c0-43ab-ba99-92750f81e335/2a14a72b-e7de-4ecb-9c24-4142b672d175.jpg",
    ]);
  });
});

describe("isOnModelReference", () => {
  it("detects on-model angle labels", () => {
    expect(isOnModelReference({ angle: "on_model" })).toBe(true);
    expect(isOnModelReference({ angle: "front" })).toBe(false);
  });
});
