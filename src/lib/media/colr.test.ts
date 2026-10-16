import { describe, expect, it } from "vitest";
import { probeVideo, type RangeRead } from "./probe";
import { avcSampleDescription, writeMp4 } from "./mp4Trim";

/** A one-frame H.264 file written by this repo's own muxer, with the colour tag asked for. */
function fileWith(colr?: "bt709" | "bt601"): Uint8Array {
  // an avcC with a High profile (0x64), level 4.0: enough for the reader to name the codec
  const avcC = Uint8Array.from([1, 0x64, 0x00, 0x28, 0xff, 0xe1, 0, 0, 1, 0, 0]);
  const payload = Uint8Array.from([0, 0, 0, 1, 0x65, 0x88]);
  return writeMp4({
    timescale: 90000,
    width: 720,
    height: 1280,
    stsd: avcSampleDescription(720, 1280, avcC, colr ? { colr } : {}),
    deltas: [3750],
    offsets: [0],
    syncs: [true],
    sizes: [payload.byteLength],
    payload,
  });
}
const reader =
  (file: Uint8Array): RangeRead =>
  async (start, end) => ({
    status: 206,
    bytes: file.subarray(start, Math.min(end, file.byteLength - 1) + 1),
    total: file.byteLength,
    contentType: "video/mp4",
  });

describe("the colour tag on a muxed file", () => {
  it("is read back as the transfer it names, and is absent when none was asked for", async () => {
    expect((await probeVideo(reader(fileWith("bt709")))).video?.transfer).toBe("bt709");
    expect((await probeVideo(reader(fileWith("bt601")))).video?.transfer).toBe("bt601");
    expect((await probeVideo(reader(fileWith()))).video?.transfer).toBeNull();
  });

  it("writes the nclx layout: four-cc, three u16 codes, one flag byte", () => {
    const stsd = avcSampleDescription(16, 16, Uint8Array.from([1, 0x64, 0, 0x28, 0xff]), {
      colr: "bt709",
    });
    const text = Array.from(stsd, (b) => String.fromCharCode(b)).join("");
    const at = text.indexOf("colr");
    expect(at).toBeGreaterThan(0);
    // size (4) + 'colr' (4) then 'nclx' + 1,1,1 as u16 + 0x00: 19 bytes in all
    const size = (stsd[at - 4] << 24) | (stsd[at - 3] << 16) | (stsd[at - 2] << 8) | stsd[at - 1];
    expect(size).toBe(19);
    expect(text.slice(at + 4, at + 8)).toBe("nclx");
    expect([...stsd.slice(at + 8, at + 15)]).toEqual([0, 1, 0, 1, 0, 1, 0]);
  });
});
