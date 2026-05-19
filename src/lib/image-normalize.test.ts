import { describe, expect, it } from "vitest";
import { _internal } from "./image-normalize";

const { looksLikeHeic } = _internal;

function fakeFile(name: string, type = ""): File {
  return new File([new Uint8Array([0])], name, { type });
}

describe("looksLikeHeic", () => {
  it("matches HEIC MIME types", () => {
    expect(looksLikeHeic(fakeFile("x", "image/heic"))).toBe(true);
    expect(looksLikeHeic(fakeFile("x", "image/heif"))).toBe(true);
    expect(looksLikeHeic(fakeFile("x", "image/heic-sequence"))).toBe(true);
    expect(looksLikeHeic(fakeFile("x", "image/heif-sequence"))).toBe(true);
  });

  it("matches HEIC/HEIF extensions when MIME is empty (Safari behavior)", () => {
    expect(looksLikeHeic(fakeFile("IMG_1234.HEIC", ""))).toBe(true);
    expect(looksLikeHeic(fakeFile("photo.heic", ""))).toBe(true);
    expect(looksLikeHeic(fakeFile("photo.heif", ""))).toBe(true);
    expect(looksLikeHeic(fakeFile("photo.HEIF", "application/octet-stream"))).toBe(true);
  });

  it("returns false for JPG/PNG/WEBP/GIF", () => {
    expect(looksLikeHeic(fakeFile("a.jpg", "image/jpeg"))).toBe(false);
    expect(looksLikeHeic(fakeFile("a.png", "image/png"))).toBe(false);
    expect(looksLikeHeic(fakeFile("a.webp", "image/webp"))).toBe(false);
    expect(looksLikeHeic(fakeFile("a.gif", "image/gif"))).toBe(false);
  });

  it("does not match unrelated extensions that contain 'hei'", () => {
    expect(looksLikeHeic(fakeFile("ineritance.png", "image/png"))).toBe(false);
  });
});
