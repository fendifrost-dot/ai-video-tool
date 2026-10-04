import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewCheckReport } from "@/lib/storyboard/reviewCheck";
import type { TimelineSegment } from "@/lib/storyboard/media";
import type { CutAcceptance } from "@/lib/storyboard/acceptance";

const run = vi.fn();
vi.mock("@/lib/storyboard/reviewCheck", () => ({ runReviewCheck: (...a: unknown[]) => run(...a) }));
vi.mock("./signedUrls", () => ({ mediaRefKey: (r: { bucket: string; path: string }) => `${r.bucket}:${r.path}`, playbackRef: (a: { bucket: string; path: string }) => a, signRefs: async () => ({}) }));

import { CutCheck } from "./CutCheck";

const seg = { shotId: "r1", key: "c001", index: 1, start: 0, end: 4, scene: "one", media: { kind: "none" } } as unknown as TimelineSegment;
const report = (over: Partial<ReviewCheckReport> = {}): ReviewCheckReport => ({
  version: 1,
  at: "2026-10-03T12:00:00.000Z",
  window: "not on screen",
  song: { resolves: true, status: 206, contentType: "audio/wav", totalBytes: 2_000_000, format: "wav", seconds: 201.87, sampleRate: 44100, channels: 2, decodes: true, note: null, name: "song.wav", plays: { bucket: "project-audio", path: "u/p/song.wav" }, analysisSeconds: 201.87, ok: true },
  files: [
    { assetId: "take", name: "take.mp4", use: "take", plays: { bucket: "b", path: "u/p/take.mp4" }, shots: 40, resolves: true, status: 206, contentType: "video/mp4", bytes: 9_000_000, container: "mp4", codec: "avc1.64001f", width: 720, height: 1280, seconds: 190.34, hasAudio: true, decoded: [{ ok: true, requested: 0, keyframeTime: 0, width: 720, height: 1280, note: null }], note: null, ok: true },
  ],
  cut: {
    ok: true,
    samples: 2019,
    stepSeconds: 0.1,
    songSeconds: 201.87,
    checks: [{ id: "sync", label: "Performance is where the song clock says, in every shot", ok: true, detail: "1825 moments on a take", failures: [] }],
    cuts: [{ index: 1, key: "c001", shotId: "r1", songIn: 0, songOut: 4, shows: "take", assetId: "take", assetName: "take.mp4", sourceIn: 0, sourceOut: 3.15, holdsFirstFrame: 0.85, holdsLastFrame: 0 }],
  },
  player: { id: "player", label: "The player on this page holds the link of each shot's own file", ok: true, detail: "1 video link and the song compared", failures: [] },
  live: { ran: false, reason: "this browser window is not on screen", samples: [], ok: true },
  ok: true,
  notChecked: ["frames on the real player: this browser window is not on screen", "how the picture looks — only watching it shows that"],
  ...over,
});
const props = { timeline: [seg], boxes: [{ id: "r1", key: "c001", start: 0, end: 4 }], assignments: [], assets: new Map(), syncs: [], song: null };

afterEach(() => {
  cleanup();
  run.mockReset();
});

describe("Check this cut", () => {
  it("runs on a press and shows every line, what was skipped and why, and what it cannot see", async () => {
    run.mockResolvedValue(report());
    render(<CutCheck {...props} />);
    expect(screen.queryByTestId("review-verify-result")).toBeNull();
    fireEvent.click(screen.getByTestId("review-verify"));
    await waitFor(() => expect(screen.getByTestId("review-verify-result").dataset.ok).toBe("true"));
    const rows = screen.getAllByTestId("review-verify-check");
    expect(rows.map((r) => [r.dataset.id, r.dataset.ok])).toEqual([
      ["song", "true"],
      ["files", "true"],
      ["sync", "true"],
      ["player", "true"],
      ["live", "skipped"],
    ]);
    expect(rows[4].textContent).toContain("not run — this browser window is not on screen");
    expect(screen.getByTestId("review-verify-not-checked").textContent).toContain("how the picture looks");
    expect(screen.getByTestId("review-verify-cut").textContent).toContain("first frame 0.8 s");
    expect(JSON.parse(screen.getByTestId("review-verify-json").textContent ?? "{}").version).toBe(1);
    expect(screen.getByTestId("review-verify").textContent).toBe("Check again");
  });

  it("says plainly when something does not hold, with the line that failed", async () => {
    const bad = report({ ok: false });
    bad.cut.checks[0] = { ...bad.cut.checks[0], ok: false, failures: ["c005 at 0:17.20: the take is 0.412 s from the song clock"] };
    run.mockResolvedValue(bad);
    render(<CutCheck {...props} />);
    fireEvent.click(screen.getByTestId("review-verify"));
    await waitFor(() => expect(screen.getByTestId("review-verify-result").dataset.ok).toBe("false"));
    expect(screen.getByTestId("review-verify-summary").textContent).toContain("Something does not hold");
    expect(screen.getAllByTestId("review-verify-check")[2].textContent).toContain("0.412 s from the song clock");
  });

  it("a cut that plays is not thereby a cut whose clips do what they were asked: both are said, apart, and both are in the report", async () => {
    run.mockResolvedValue(report());
    const line = { requirement: "framing" as const, label: "Framing", finding: "fails" as const, source: "measured" as const, says: "2.54× as far", measured: { finding: "fails" as const, says: "2.54× as far" }, judged: null };
    const accepted: CutAcceptance = {
      clips: [{ index: 39, key: "c035", shotId: "r39", start: 156.86, end: 160.78, assetId: "clip", name: "clip.mp4", acceptance: { verdict: "fails", lines: [line], fails: 1, open: 0 } }],
      meets: 0,
      fails: 1,
      open: 0,
      verdict: "fails",
    };
    render(<CutCheck {...props} accepted={accepted} />);
    fireEvent.click(screen.getByTestId("review-verify"));
    // everything that can be checked without watching it holds…
    await waitFor(() => expect(screen.getByTestId("review-verify-result").dataset.ok).toBe("true"));
    // …and that is said to be about playing only
    const said = screen.getByTestId("review-verify-accepted");
    expect(said.dataset.verdict).toBe("fails");
    expect(said.textContent).toContain("That is whether the cut plays — not whether its clips do what they were asked.");
    expect(said.textContent).toContain("1 generated clip: 1 fails what was asked");
    const saved = JSON.parse(screen.getByTestId("review-verify-json").textContent ?? "{}");
    expect(saved.ok).toBe(true);
    expect(saved.acceptance).toMatchObject({ verdict: "fails", clips: [{ shot: 39, key: "c035", verdict: "fails", says: "fails framing", lines: [{ requirement: "framing", finding: "fails", source: "measured" }] }] });
  });

  it("a cut with no generated clip says nothing about acceptance", async () => {
    run.mockResolvedValue(report());
    render(<CutCheck {...props} accepted={{ clips: [], meets: 0, fails: 0, open: 0, verdict: "none" }} />);
    fireEvent.click(screen.getByTestId("review-verify"));
    await waitFor(() => expect(screen.getByTestId("review-verify-result").dataset.ok).toBe("true"));
    expect(screen.queryByTestId("review-verify-accepted")).toBeNull();
  });

  it("shows the reason when the check itself cannot run", async () => {
    run.mockRejectedValue(new Error("Not signed in"));
    render(<CutCheck {...props} />);
    fireEvent.click(screen.getByTestId("review-verify"));
    await waitFor(() => expect(screen.getByTestId("review-verify-error").textContent).toBe("Not signed in"));
  });
});
