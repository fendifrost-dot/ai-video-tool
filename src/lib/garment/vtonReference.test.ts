import { describe, expect, it } from "vitest";
import {
  guessAngleFromFilename,
  orderedRefPathsForComposer,
  pickFullLookGarmentPath,
  pickVtonGarmentPath,
  sortRefsForVtonGarment,
} from "./vtonReference";

describe("pickVtonGarmentPath", () => {
  it("prefers front flat over on-model when front was uploaded second", () => {
    const refs = [
      { storage_path: "a/model.jpg", angle: "other", label: "on model" },
      { storage_path: "a/front-flat.jpg", angle: "front" },
    ];
    expect(pickVtonGarmentPath(refs)).toBe("a/front-flat.jpg");
  });

  it("deprioritizes on-model heuristic labels", () => {
    const refs = [
      { url: "https://x/wearing.jpg", label: "model wearing jacket" },
      { url: "https://x/back.jpg", angle: "back" },
    ];
    expect(pickVtonGarmentPath(refs)).toBe("https://x/back.jpg");
  });

  it("falls back to storage_path when refs empty", () => {
    expect(pickVtonGarmentPath([], "legacy/path.jpg")).toBe("legacy/path.jpg");
  });
});

describe("pickFullLookGarmentPath", () => {
  it("prefers on-model over front flat for hero full-look transfer", () => {
    const refs = [
      { storage_path: "a/front-flat.jpg", angle: "front" },
      { storage_path: "a/on-model.jpg", angle: "on_model", label: "SL on model" },
    ];
    expect(pickFullLookGarmentPath(refs)).toBe("a/on-model.jpg");
  });
});

describe("orderedRefPathsForComposer", () => {
  it("orders front before back for seedream round-robin", () => {
    const paths = orderedRefPathsForComposer([
      { storage_path: "b/back.jpg", angle: "back" },
      { storage_path: "a/front.jpg", angle: "front" },
    ]);
    expect(paths).toEqual(["a/front.jpg", "b/back.jpg"]);
  });
});

describe("sortRefsForVtonGarment", () => {
  it("puts detail after front but before on-model", () => {
    const sorted = sortRefsForVtonGarment([
      { storage_path: "m", label: "on model shoot" },
      { storage_path: "d", angle: "detail" },
      { storage_path: "f", angle: "front" },
    ]);
    expect(sorted.map((r) => r.storage_path)).toEqual(["f", "d", "m"]);
  });
});

describe("guessAngleFromFilename", () => {
  it("detects common product-page naming", () => {
    expect(guessAngleFromFilename("IMG_5432_front_flat.jpg")).toBe("front");
    expect(guessAngleFromFilename("jacket_back.png")).toBe("back");
    expect(guessAngleFromFilename("model_wearing_look.jpg")).toBe("other");
  });
});
