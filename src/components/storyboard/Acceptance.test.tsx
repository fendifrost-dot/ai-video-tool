/**
 * A generated clip held against what it was asked for, as the director sees it in the full-screen shot view.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { acceptanceOf, withJudgement, type ClipAsk } from "@/lib/storyboard/acceptance";
import { measureBeats } from "@/lib/storyboard/beatCheck";
import { framesOf, RETEST_C035 } from "@/lib/storyboard/__fixtures__/realCurves";
import type { BoxMediaItem, MediaAsset } from "@/lib/storyboard/media";
import { AcceptancePanel } from "./Acceptance";
import { StoryboardProvider, type StoryboardController } from "./useStoryboardController";

const AT = "2026-10-04T05:00:00Z";
const ASK: ClipAsk = { asked: [{ id: "e1", offset: 1.9, kinds: ["lighting"], says: "light: the mirror ball comes alive" }], fromTake: true };
const asset = (over: Partial<MediaAsset> = {}): MediaAsset =>
  ({ id: "clip1", assetType: "generated_clip", footageRole: "performance", bucket: "project-clips", path: "u/p/clip1.mp4", playback: null, name: "clip1.mp4", mime: "video/mp4", isVideo: true, isImage: false, durationSeconds: 4, shotId: null, sourceTool: "higgsfield", providerJobId: null, createdAt: AT, ...over }) as MediaAsset;
const item = (a: MediaAsset): BoxMediaItem => ({ asset: a, kind: "video", role: "performance", selected: true, base: false, assignmentId: "a1", sourceIn: 0, sourceOut: 3.92, leadIn: 0, note: null }) as unknown as BoxMediaItem;
const SHOT = { number: 39, start: 156.86, end: 160.78 };

function sb(a: MediaAsset, over: Partial<StoryboardController> = {}): StoryboardController {
  return {
    projectId: "p1",
    acceptanceOf: (x: MediaAsset) => acceptanceOf({ ask: ASK, beatCheck: x.beatCheck ?? null, takeCheck: x.takeCheck ?? null, record: x.acceptance ?? null }),
    judge: vi.fn(async () => undefined),
    ...over,
  } as unknown as StoryboardController;
}
const line = (r: string) => screen.getAllByTestId("acceptance-requirement").find((e) => e.getAttribute("data-requirement") === r)!;

describe("does the clip do what it was asked", () => {
  it("a clip that plays and has had nothing looked at is not yet verified — every line says nothing has looked", () => {
    const a = asset();
    render(
      <StoryboardProvider value={sb(a)}>
        <AcceptancePanel item={item(a)} shot={SHOT} />
      </StoryboardProvider>,
    );
    const panel = screen.getByTestId("acceptance");
    expect([panel.getAttribute("data-verdict"), panel.getAttribute("data-fails"), panel.getAttribute("data-open")]).toEqual(["unverified", "0", "5"]);
    expect(screen.getByTestId("acceptance-chip").textContent).toBe("not yet verified");
    expect(screen.getAllByTestId("acceptance-requirement").map((e) => [e.getAttribute("data-requirement"), e.getAttribute("data-finding"), e.getAttribute("data-source")])).toEqual([
      ["timing", "unverified", "none"],
      ["framing", "unverified", "none"],
      ["lips", "unverified", "none"],
      ["lighting", "unverified", "none"],
      ["camera", "unverified", "none"],
    ]);
    // lip sync: the exact stretch to watch with the song, and the way there
    expect(screen.getByTestId("acceptance-watch").textContent).toContain("watch shot 39 with the song, 2:36.86–2:40.78");
    expect(screen.getByTestId("acceptance-watch-link").getAttribute("href")).toBe("/projects/p1/review?from=39&to=39");
    expect(screen.getByTestId("acceptance-note-foot").textContent).toContain("A clip that plays is not thereby a clip that does what it was asked");
  });

  it("the retest: timing could not be told (measured), lighting and camera fail (by eye) — the clip fails, and no timing number is shown as measured", () => {
    let record = withJudgement(null, "lighting", "fails", "opens dark for half a second; the room does not go dark after the beat", AT);
    record = withJudgement(record, "camera", "fails", "no push toward him", AT);
    const a = asset({ beatCheck: measureBeats(framesOf(RETEST_C035), ASK.asked, AT), acceptance: record });
    render(
      <StoryboardProvider value={sb(a)}>
        <AcceptancePanel item={item(a)} shot={SHOT} />
      </StoryboardProvider>,
    );
    expect(screen.getByTestId("acceptance").getAttribute("data-verdict")).toBe("fails");
    expect(screen.getByTestId("acceptance-chip").textContent).toBe("fails what was asked");
    expect(screen.getByTestId("acceptance-line").textContent).toBe("fails lighting, camera and movement · not verified: timing, framing, lip sync");
    const timing = line("timing");
    expect([timing.getAttribute("data-finding"), timing.getAttribute("data-source")]).toEqual(["undetermined", "measured"]);
    expect(timing.textContent).toContain("cannot tell");
    expect(timing.textContent).not.toMatch(/[+−]\d\.\d\d s/);
    const lighting = line("lighting");
    expect([lighting.getAttribute("data-finding"), lighting.getAttribute("data-source")]).toEqual(["fails", "by_eye"]);
    expect(lighting.textContent).toContain("by eye · 2026-10-04");
    expect(lighting.textContent).toContain("opens dark for half a second");
    expect(within(lighting).getByTestId("acceptance-take-back")).toBeTruthy();
  });

  it("judging a line by eye records the finding with its note; the measurement beside it is left as measured", async () => {
    const a = asset({ beatCheck: measureBeats(framesOf(RETEST_C035), ASK.asked, AT), acceptance: withJudgement(null, "timing", "fails", "the ball comes alive at 0.96 s, asked at 1.90 s", AT) });
    const c = sb(a);
    render(
      <StoryboardProvider value={c}>
        <AcceptancePanel item={item(a)} shot={SHOT} />
      </StoryboardProvider>,
    );
    const timing = line("timing");
    expect([timing.getAttribute("data-finding"), timing.getAttribute("data-source"), timing.getAttribute("data-measured")]).toEqual(["fails", "by_eye", "undetermined"]);
    expect(within(timing).getByTestId("acceptance-measured").textContent).toContain("measured: cannot tell");
    // lips: "it does not", with a note
    fireEvent.click(within(line("lips")).getByTestId("acceptance-fails"));
    fireEvent.change(screen.getByTestId("acceptance-note"), { target: { value: "his mouth runs ahead of the words in the second line" } });
    fireEvent.click(screen.getByTestId("acceptance-keep"));
    await waitFor(() => expect(c.judge).toHaveBeenCalledWith(a, "lips", "fails", "his mouth runs ahead of the words in the second line"));
    // and a judgement can be taken back
    fireEvent.click(within(line("timing")).getByTestId("acceptance-take-back"));
    expect(c.judge).toHaveBeenCalledWith(a, "timing", null, "");
  });

  it("footage the app did not generate has nothing asked of it", () => {
    const a = asset();
    const { container } = render(
      <StoryboardProvider value={sb(a, { acceptanceOf: () => null })}>
        <AcceptancePanel item={item(a)} shot={SHOT} />
      </StoryboardProvider>,
    );
    expect(container.innerHTML).toBe("");
  });
});
