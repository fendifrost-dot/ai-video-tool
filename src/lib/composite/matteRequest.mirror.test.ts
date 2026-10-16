import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as browser from "./matteRequest";
import * as edge from "../../../supabase/functions/_shared/matteRequest";

/** The browser copy and the edge copy are one module written twice: the same words, the same arithmetic. */
describe("matteRequest mirrors", () => {
  it("export the same names and constants", () => {
    expect(Object.keys(browser).sort()).toEqual(Object.keys(edge).sort());
    expect(browser.MATTE_MODEL).toBe(edge.MATTE_MODEL);
    expect(browser.MATTE_USD_PER_30_FRAMES).toBe(edge.MATTE_USD_PER_30_FRAMES);
    expect(browser.MATTE_MAX_SECONDS).toBe(edge.MATTE_MAX_SECONDS);
    expect(browser.MATTE_DEFAULT_FPS).toBe(edge.MATTE_DEFAULT_FPS);
  });

  it("give the same answers", () => {
    for (const frames of [1, 29, 30, 31, 96, 263])
      expect(browser.matteEstimateUsd(frames)).toEqual(edge.matteEstimateUsd(frames));
    for (const s of [4.004, 7.958, 10.961])
      expect(browser.matteFrames(s, null)).toBe(edge.matteFrames(s, null));
    expect(browser.buildMatteInput("https://x/y.mp4")).toEqual(
      edge.buildMatteInput("https://x/y.mp4"),
    );
    const answer = { video: [{ url: "https://v3b.fal.media/1.mp4" }, { url: "https://a/2.mp4" }] };
    expect(browser.matteResultUrls(answer)).toEqual(["https://v3b.fal.media/1.mp4"]);
    expect(browser.matteResultUrls(answer)).toEqual(edge.matteResultUrls(answer));
    expect(browser.matteSourceCheck({ seconds: 61, isVideo: true })).toEqual(
      edge.matteSourceCheck({ seconds: 61, isVideo: true }),
    );
  });

  it("are the same source below the header", () => {
    const body = (p: string) => readFileSync(p, "utf8").replace(/^\/\*\*[\s\S]*?\*\/\s*/, "");
    // paths from the repo root: under jsdom import.meta.url is not a file: URL
    expect(body(resolve(process.cwd(), "src/lib/composite/matteRequest.ts"))).toBe(
      body(resolve(process.cwd(), "supabase/functions/_shared/matteRequest.ts")),
    );
  });
});
