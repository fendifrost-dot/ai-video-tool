/**
 * Browser face detection: the Shape Detection API when the engine has it,
 * otherwise the pure skin-tone heuristic. Split from faceRegion.ts so that file
 * stays DOM-free and unit-testable.
 */

import {
  detectFaceRegionHeuristic,
  type FaceRegion,
} from "./faceRegion";
import type { RgbaImage } from "./logoComposite";

type DetectedBox = { boundingBox: { x: number; y: number; width: number; height: number } };

type FaceDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<DetectedBox[]>;
};

type FaceDetectorCtor = new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) =>
  FaceDetectorLike;

function shapeDetector(): FaceDetectorCtor | null {
  const ctor = (globalThis as { FaceDetector?: FaceDetectorCtor }).FaceDetector;
  return typeof ctor === "function" ? ctor : null;
}

function toCanvas(img: RgbaImage): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return canvas;
}

/**
 * Detect the largest face in an image. The Shape Detection API is a real
 * detector so it is preferred and reported at high confidence; when it is
 * absent (most desktop Chrome builds) or finds nothing, fall back to the
 * heuristic, whose own confidence the caller still has to clear.
 */
export async function detectFace(img: RgbaImage): Promise<FaceRegion | null> {
  const Ctor = shapeDetector();
  if (Ctor) {
    try {
      const faces = await new Ctor({ fastMode: false, maxDetectedFaces: 5 }).detect(toCanvas(img));
      const largest = faces
        .map((f) => f.boundingBox)
        .sort((a, b) => b.width * b.height - a.width * a.height)[0];
      if (largest && largest.width > 0 && largest.height > 0) {
        return {
          left: Math.round(largest.x),
          top: Math.round(largest.y),
          right: Math.round(largest.x + largest.width) - 1,
          bottom: Math.round(largest.y + largest.height) - 1,
          confidence: 0.95,
          method: "shape-detector",
        };
      }
    } catch {
      // Detector present but unusable (no backend on this platform) — fall through.
    }
  }
  return detectFaceRegionHeuristic(img);
}
