import { describe, expect, it } from "vitest";
import { alignPerformance, syncWriteAllowed, LOCKED_PROJECT_ID } from "./performanceAlign";

function tone(seconds: number, sr: number, hz: number, from = 0): Float32Array {
  const n = Math.round(seconds * sr);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * hz * (i + from)) / sr) * 0.4;
  return x;
}

/** Irregular noise bursts. A single click is smeared by the 150 Hz high-pass and never clears the coarse gate. */
function bursts(seconds: number, sr: number, seed = 7): Float32Array {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const x = new Float32Array(Math.round(seconds * sr));
  for (let i = 0; i < x.length; i++) x[i] = (rnd() - 0.5) * 0.02;
  let t = 0.2;
  while (t < seconds - 0.3) {
    const len = Math.round((0.05 + rnd() * 0.15) * sr);
    const start = Math.round(t * sr);
    const amp = 0.3 + rnd() * 0.6;
    for (let i = 0; i < len && start + i < x.length; i++)
      x[start + i] += (rnd() - 0.5) * 2 * amp * (1 - i / len);
    t += 0.18 + rnd() * 0.55;
  }
  return x;
}

describe("server audio alignment", () => {
  it("refuses silence and a write to the live YSL board", () => {
    const song = tone(3, 16000, 440);
    const silent = alignPerformance({ song, take: new Float32Array(16000 * 3), sampleRate: 16000 });
    expect(silent.ok).toBe(false);
    if (!silent.ok) expect(silent.error).toBe("no_audio");
    expect(syncWriteAllowed({ projectId: LOCKED_PROJECT_ID, write: true, dryRun: false }).ok).toBe(
      false,
    );
    expect(syncWriteAllowed({ projectId: "other", write: true, dryRun: true }).ok).toBe(false);
    expect(syncWriteAllowed({ projectId: "other", write: true, dryRun: false }).ok).toBe(true);
  });

  it("reports a negative offset when the camera rolled before the song", () => {
    const sr = 8000;
    const song = bursts(36, sr);
    const offset = -1.5;
    const take = new Float32Array(Math.round(28 * sr));
    const shift = Math.round(offset * sr);
    for (let i = 0; i < take.length; i++) {
      const j = i + shift;
      if (j >= 0 && j < song.length) take[i] = song[j] * 0.6;
    }
    const aligned = alignPerformance({ song, take, sampleRate: sr });
    expect(aligned.ok).toBe(true);
    if (aligned.ok) {
      expect(aligned.match.offsetSeconds).toBeCloseTo(offset, 2);
      expect(aligned.match.method).toBe("server_bandpass_envelope_gcc_phat");
    }
  });
});
