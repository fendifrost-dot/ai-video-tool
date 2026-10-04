/**
 * Where his face is on every frame of a stretch of a file — the reading storyboard/takeCheck.ts measures lip sync
 * and framing from. frameSeries.ts reads the light of the whole picture; this reads the landmarks of one face.
 *
 * The frames are decoded by byte range with WebCodecs (no media element, so it runs in a window that is not on
 * screen). The landmarks come from MediaPipe's face landmarker, loaded when a check is first run and not before:
 * the reader's code and model are fetched from their public hosts at a pinned version, so nothing is added to the
 * app's own bundle. A page that cannot reach them says so; nothing else in the app depends on it.
 */
import type { Mp4Track } from "./mp4";
import type { RangeRead } from "./probe";
import { eachFrame } from "./frameSeries";
import { faceOf, type FaceFrame } from "@/lib/storyboard/takeCheck";

const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1";
const MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

type Point = { x: number; y: number };
type FaceReader = { detect: (image: TexImageSource) => { faceLandmarks: Point[][] } };

let reader: Promise<FaceReader> | null = null;

/** The landmarker, made once per page. A failed load is not remembered. */
export function faceReader(): Promise<FaceReader> {
  if (!reader) {
    reader = (async () => {
      const url = `${VISION}/vision_bundle.mjs`;
      const mod = (await import(/* @vite-ignore */ url)) as {
        FilesetResolver: { forVisionTasks: (base: string) => Promise<unknown> };
        FaceLandmarker: { createFromOptions: (fileset: unknown, options: unknown) => Promise<FaceReader> };
      };
      const fileset = await mod.FilesetResolver.forVisionTasks(`${VISION}/wasm`);
      // on the processor: the same answer in a window that is not on screen, where a graphics context may not be given
      return mod.FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL, delegate: "CPU" }, runningMode: "IMAGE", numFaces: 1 });
    })();
    reader.catch(() => {
      reader = null;
    });
  }
  return reader;
}

/** The longest side the whole frame is read at. */
const FULL_SIDE = 960;
/** A closer look is a square this many pixels a side. */
const WINDOW_SIDE = 512;
/** …cut from the frame at this share of its shorter side, stepped by half of itself. */
const WINDOW_SHARE = 0.6;

/**
 * The squares of a frame looked at again, closer, when no face is found in the whole of it: the reader is made for a
 * face that fills a good part of the picture, and a man standing full-length in a room is a small face. Pure —
 * exported for its test. Each is [x, y, side] in the frame's own pixels.
 */
export function closerWindows(w: number, h: number): [number, number, number][] {
  const side = Math.round(Math.min(w, h) * WINDOW_SHARE);
  if (!(side > 8)) return [];
  const steps = (length: number) => {
    const n = Math.max(1, Math.ceil((length - side) / (side / 2)) + 1);
    return Array.from({ length: n }, (_, i) => (n === 1 ? 0 : Math.round(((length - side) * i) / (n - 1))));
  };
  const out: [number, number, number][] = [];
  for (const y of steps(h)) for (const x of steps(w)) out.push([x, y, side]);
  return out;
}

function canvasOf(w: number, h: number): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D } {
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) throw new Error("this browser gave no canvas to read faces on");
  return { canvas, ctx };
}

/**
 * Every frame of [from, to) of a file with his face, when one is found. The whole frame is tried first; when it
 * shows no face, the frame is looked at again in closer squares — the one the face was last found in first.
 */
export async function faceSeries(read: RangeRead, track: Mp4Track, from = 0, to: number = track.duration): Promise<FaceFrame[]> {
  const faces = await faceReader();
  const w = track.width ?? 0;
  const h = track.height ?? 0;
  if (!(w > 0) || !(h > 0)) throw new Error("the file does not say how large its picture is");
  const scale = Math.min(1, FULL_SIDE / Math.max(w, h));
  const fw = Math.max(2, Math.round(w * scale));
  const fh = Math.max(2, Math.round(h * scale));
  const full = canvasOf(fw, fh);
  const close = canvasOf(WINDOW_SIDE, WINDOW_SIDE);
  const windows = closerWindows(w, h);
  let lastWindow = -1;
  const out: FaceFrame[] = [];

  await eachFrame(read, track, from, to, (frame, t) => {
    // the frame as it is SHOWN (a file may store it wider than it shows it)
    const sw = frame.displayWidth || w;
    const sh = frame.displayHeight || h;
    full.ctx.drawImage(frame, 0, 0, fw, fh);
    let found = faces.detect(full.canvas).faceLandmarks[0];
    let points: Point[] | null = found ? found.map((p) => ({ x: p.x * sw, y: p.y * sh })) : null;
    if (!points && windows.length) {
      const order = lastWindow >= 0 ? [lastWindow, ...windows.map((_, i) => i).filter((i) => i !== lastWindow)] : windows.map((_, i) => i);
      for (const i of order) {
        const [x, y, side] = windows[i];
        // the windows are laid out on the coded size; the frame is drawn at its shown size
        const kx = sw / w;
        const ky = sh / h;
        close.ctx.drawImage(frame, x * kx, y * ky, side * kx, side * ky, 0, 0, WINDOW_SIDE, WINDOW_SIDE);
        found = faces.detect(close.canvas).faceLandmarks[0];
        if (found) {
          points = found.map((p) => ({ x: (x + p.x * side) * kx, y: (y + p.y * side) * ky }));
          lastWindow = i;
          break;
        }
      }
    }
    out.push({ t, face: points ? faceOf(points, sw, sh) : null });
  });
  return out.sort((a, b) => a.t - b.t);
}
