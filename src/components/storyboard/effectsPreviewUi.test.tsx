/**
 * Effects on the board's player: where post has filed a preview copy of what it built, that copy is on the stage for
 * its stretch of the song, the strip under the song marks it, and the switch puts the plain board back.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { effectsLayer, type EffectsPreview } from "@/lib/storyboard/effectsPreview";
import type { MediaAsset, TimelineSegment } from "@/lib/storyboard/media";
import { SequencePlayer } from "./SequencePlayer";

vi.mock("./signedUrls", async (orig) => ({
  ...(await orig<typeof import("./signedUrls")>()),
  useSignedRefs: (refs: { bucket: string; path: string }[]) => Object.fromEntries(refs.map((r) => [`${r.bucket}:${r.path}`, `https://signed/${r.path}`])),
}));

const AT = "2026-11-23T00:00:00Z";
const clip: MediaAsset = { id: "clip1", assetType: "generated_clip", footageRole: null, bucket: "project-clips", path: "u/p/clip1.mp4", playback: null, name: "clip1.mp4", mime: "video/mp4", isVideo: true, isImage: false, durationSeconds: 4, shotId: null, sourceTool: "higgsfield", providerJobId: null, createdAt: AT };
const seg = (over: Partial<TimelineSegment>): TimelineSegment => ({ shotId: "s1", key: "c001", index: 1, start: 0, end: 4, section: null, media: { kind: "video", assetId: "clip1", role: "generated_clip", sourceIn: 0, sourceOut: null, leadIn: 0, base: false }, scene: "he walks", note: null, events: [], ...over });
const copy = (over: Partial<EffectsPreview> = {}): EffectsPreview => ({ assetId: "fx1", bucket: "project-exports", path: "u/p/effects_preview/vhs_v2.mp4", createdAt: AT, section: "vhs", version: 2, songStart: 0, songEnd: 4, fps: 24, frames: 96, label: "VHS open", madeAt: null, builtFrom: null, ...over });
const assets = new Map([[clip.id, clip]]);
const stage = () => screen.getByTestId("sequence-stage");

describe("effects on the board's player", () => {
  it("plays as it always did when the project has no preview copies", () => {
    render(<SequencePlayer timeline={[seg({})]} assets={assets} song={null} />);
    expect(stage().dataset.effects).toBe("");
    expect(screen.queryByTestId("sequence-effects-toggle")).toBeNull();
    expect(screen.queryAllByTestId("sequence-effects-span")).toHaveLength(0);
    expect(document.querySelector("video[data-effects-asset-id]")).toBeNull();
  });

  it("puts the copy on the stage for its stretch, names it, and marks it under the song", () => {
    render(<SequencePlayer timeline={[seg({})]} assets={assets} song={null} effects={effectsLayer([copy()])} />);
    expect(stage().dataset.effects).toBe("fx1");
    const fx = document.querySelector('video[data-effects-asset-id="fx1"]') as HTMLVideoElement;
    expect(fx.getAttribute("src")).toBe("https://signed/u/p/effects_preview/vhs_v2.mp4");
    expect(fx.className).toContain("opacity-100");
    expect(screen.getByTestId("sequence-effects-badge").textContent).toBe("effects · VHS open · v2");
    const bars = screen.getAllByTestId("sequence-effects-span");
    expect(bars).toHaveLength(1);
    expect(bars[0].dataset.section).toBe("vhs");
    expect(bars[0].dataset.version).toBe("2");
    expect(bars[0].style.left).toBe("0%");
    expect(bars[0].style.width).toBe("100%");
    expect(screen.getByTestId("sequence-effects-coverage").textContent).toContain("built for");
  });

  it("gives the plain board back when Effects is switched off, and the copy again when it is switched on", () => {
    render(<SequencePlayer timeline={[seg({})]} assets={assets} song={null} effects={effectsLayer([copy()])} />);
    const toggle = screen.getByTestId("sequence-effects-toggle");
    expect(toggle.dataset.on).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.dataset.on).toBe("false");
    expect(stage().dataset.effects).toBe("");
    expect(screen.queryByTestId("sequence-effects-badge")).toBeNull();
    expect((document.querySelector('video[data-effects-asset-id="fx1"]') as HTMLVideoElement).className).toContain("opacity-0");
    fireEvent.click(toggle);
    expect(stage().dataset.effects).toBe("fx1");
  });

  it("shows the copy over a shot that has no footage yet, not the empty slate", () => {
    const open = seg({ media: { kind: "none" } });
    const { rerender } = render(<SequencePlayer timeline={[open]} assets={assets} song={null} />);
    expect(screen.getByTestId("sequence-slate")).toBeTruthy();
    rerender(<SequencePlayer timeline={[open]} assets={assets} song={null} effects={effectsLayer([copy()])} />);
    expect(screen.queryByTestId("sequence-slate")).toBeNull();
    expect(stage().dataset.effects).toBe("fx1");
  });

  it("leaves a stretch the copy does not cover to the board, and marks only what is covered", () => {
    const timeline = [seg({}), seg({ shotId: "s2", key: "c002", index: 2, start: 4, end: 8 })];
    render(<SequencePlayer timeline={timeline} assets={assets} song={null} effects={effectsLayer([copy({ songStart: 4, songEnd: 8 })])} />);
    // the playhead rests at the start of the song: the board's own clip, no copy
    expect(stage().dataset.effects).toBe("");
    const bar = screen.getByTestId("sequence-effects-span");
    expect(bar.style.left).toBe("50%");
    expect(bar.style.width).toBe("50%");
  });

  it("shows only the part of a copy that falls inside the section being played", () => {
    render(<SequencePlayer timeline={[seg({ start: 2, end: 4 })]} assets={assets} song={null} effects={effectsLayer([copy({ songStart: 0, songEnd: 3 })])} />);
    const bar = screen.getByTestId("sequence-effects-span");
    expect(bar.style.left).toBe("0%");
    expect(bar.style.width).toBe("50%");
  });
});
