import { describe, expect, it } from "vitest";
import { translatingSquareFixture } from "./fixtures";
import { PropagationContractError, validatePropagationInput } from "./validate";
import type { PropagationInput } from "./contract";

function cloneInput(): PropagationInput {
  const f = translatingSquareFixture();
  return {
    clip: {
      ...f.clip,
      frames: f.clip.frames.map((fr) => ({ ...fr, luma: new Uint8Array(fr.luma) })),
    },
    canonical: {
      ...f.canonical,
      mask: { ...f.canonical.mask, data: new Uint8Array(f.canonical.mask.data) },
    },
    anchors: [...f.anchors],
  };
}

describe("validatePropagationInput", () => {
  it("accepts the static translating-square fixture", () => {
    const v = validatePropagationInput(translatingSquareFixture());
    expect(v.sortedIndices).toEqual([0, 1, 2, 3, 4]);
    expect(v.width).toBe(16);
    expect(v.height).toBe(16);
  });

  it("rejects an empty clip", () => {
    const input = cloneInput();
    input.clip.frames = [];
    expect(() => validatePropagationInput(input)).toThrow(PropagationContractError);
    try {
      validatePropagationInput(input);
    } catch (e) {
      expect((e as PropagationContractError).code).toBe("empty_clip");
    }
  });

  it("rejects a canonical index that is not in the clip", () => {
    const input = cloneInput();
    input.canonical.index = 99;
    expect(() => validatePropagationInput(input)).toThrowError(/canonical/);
  });

  it("rejects a mask that does not match frame size", () => {
    const input = cloneInput();
    input.canonical.mask = { width: 8, height: 8, data: new Uint8Array(64) };
    expect(() => validatePropagationInput(input)).toThrowError(/mask/);
  });

  it("rejects a non-binary mask", () => {
    const input = cloneInput();
    input.canonical.mask.data[0] = 7;
    expect(() => validatePropagationInput(input)).toThrowError(/0\|1/);
  });

  it("rejects an anchor outside the clip", () => {
    const input = cloneInput();
    input.anchors.push({ index: 12, kind: "manual" });
    expect(() => validatePropagationInput(input)).toThrowError(/anchor/);
  });
});
