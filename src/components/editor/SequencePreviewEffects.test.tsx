/**
 * Effects on the Cut page's monitor: a preview copy of built effects is laid over the cut for its stretch of the
 * SONG (the cut's own clock plus its song offset), and only while the switch is on.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { importEdlCsv, YSL_PROJECT_ID, YSL_VARIATION_ID } from "../../../supabase/functions/edit-render/model";
import { effectsLayer, type EffectsPreview } from "@/lib/storyboard/effectsPreview";
import { SequencePreview } from "./SequencePreview";

const csv = readFileSync(resolve("src/lib/editor/__fixtures__/edl_v1_coldopen.csv"), "utf8");
const seq = importEdlCsv(csv, { projectId: YSL_PROJECT_ID, variationId: YSL_VARIATION_ID, name: "cold" });
const copy = (over: Partial<EffectsPreview> = {}): EffectsPreview => ({ assetId: "fx1", bucket: "project-exports", path: "u/p/effects_preview/open_v1.mp4", createdAt: "2026-11-23T00:00:00Z", section: "open", version: 1, songStart: seq.songOffset, songEnd: seq.songOffset + 6, fps: 24, frames: 144, label: null, madeAt: null, builtFrom: null, ...over });
const show = (playhead: number, effectsOn: boolean, spans = effectsLayer([copy()])) =>
  render(<SequencePreview sequence={seq} playhead={playhead} playing={false} playbackRate={1} mediaByAsset={{}} songUrl={null} effects={spans} effectsOn={effectsOn} effectsUrls={{ fx1: "https://signed/open_v1.mp4" }} />);

describe("effects on the cut's monitor", () => {
  it("the cold open starts 13.792 s into the song", () => {
    expect(seq.songOffset).toBeCloseTo(13.792, 3);
  });

  it("lays the copy over the monitor where the song has one, once the browser has a frame of it", async () => {
    show(0, true);
    const el = screen.getByTestId("preview-effects");
    // still loading: the cut's own picture stays up, unmarked
    expect(el.dataset.effects).toBe("");
    expect(el.className).toContain("opacity-0");
    expect(screen.queryByTestId("preview-effects-badge")).toBeNull();
    await vi.waitFor(() => expect(el.dataset.src).toBe("https://signed/open_v1.mp4"));
    fireEvent.loadedData(el);
    expect(el.dataset.effects).toBe("fx1");
    expect(el.className).toContain("opacity-100");
    expect(screen.getByTestId("preview-effects-badge").textContent).toBe("effects · open · v1");
  });

  it("takes the copy off again when its file fails", async () => {
    show(0, true);
    const el = screen.getByTestId("preview-effects");
    await vi.waitFor(() => expect(el.dataset.src).toBe("https://signed/open_v1.mp4"));
    fireEvent.loadedData(el);
    expect(el.dataset.effects).toBe("fx1");
    fireEvent.error(el);
    expect(el.dataset.effects).toBe("");
    expect(screen.queryByTestId("preview-effects-badge")).toBeNull();
  });

  it("leaves the cut's own picture where the song has none", () => {
    show(10, true);
    expect(screen.getByTestId("preview-effects").dataset.effects).toBe("");
    expect(screen.queryByTestId("preview-effects-badge")).toBeNull();
  });

  it("shows nothing of it with the switch off, or before its link is signed", () => {
    const { unmount } = show(0, false);
    expect(screen.getByTestId("preview-effects").dataset.effects).toBe("");
    unmount();
    render(<SequencePreview sequence={seq} playhead={0} playing={false} playbackRate={1} mediaByAsset={{}} songUrl={null} effects={effectsLayer([copy()])} effectsOn effectsUrls={{}} />);
    expect(screen.getByTestId("preview-effects").dataset.effects).toBe("");
  });

  it("is addressed by the song, not by the cut's own clock", () => {
    // a copy filed for the first six seconds of the SONG is before this cut begins: never on its monitor
    show(0, true, effectsLayer([copy({ songStart: 0, songEnd: 6 })]));
    expect(screen.getByTestId("preview-effects").dataset.effects).toBe("");
  });
});
