import type { FlightArrow, FlightGuides, Point } from "./types";

export const FLIGHT_LINE_COLOR = "#ef4444";
export const FLIGHT_ARROW_FILL = "#ffffff";
export const FLIGHT_ARROW_STROKE = "#111111";

function toPx(p: Point, w: number, h: number): { x: number; y: number } {
  return { x: p.x * w, y: p.y * h };
}

export function drawFlightPath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  width: number,
  height: number,
): void {
  if (points.length < 2) return;
  const lineWidth = Math.max(3, Math.min(width, height) * 0.008);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = FLIGHT_LINE_COLOR;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  const first = toPx(points[0], width, height);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const p = toPx(points[i], width, height);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawFlightArrow(
  ctx: CanvasRenderingContext2D,
  arrow: FlightArrow,
  width: number,
  height: number,
): void {
  const size = Math.max(14, Math.min(width, height) * 0.045);
  const { x, y } = toPx(arrow, width, height);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(arrow.angle);
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1.5, size * 0.08);
  ctx.strokeStyle = FLIGHT_ARROW_STROKE;
  ctx.fillStyle = FLIGHT_ARROW_FILL;
  ctx.beginPath();
  ctx.moveTo(size * 0.7, 0);
  ctx.lineTo(-size * 0.45, size * 0.38);
  ctx.lineTo(-size * 0.2, 0);
  ctx.lineTo(-size * 0.45, -size * 0.38);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawFlightGuides(
  ctx: CanvasRenderingContext2D,
  guides: FlightGuides,
  width: number,
  height: number,
): void {
  drawFlightPath(ctx, guides.path, width, height);
  for (const arrow of guides.arrows) {
    drawFlightArrow(ctx, arrow, width, height);
  }
}

/**
 * Rasterize cover + guides at native (capped) resolution for Flow upload.
 * Caller supplies an already-decoded image.
 */
export function renderAnnotatedCover(
  image: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  guides: FlightGuides,
  maxEdge = 2048,
): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(imageWidth, imageHeight));
  const w = Math.max(1, Math.round(imageWidth * scale));
  const h = Math.max(1, Math.round(imageHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.drawImage(image, 0, 0, w, h);
  drawFlightGuides(ctx, guides, w, h);
  return canvas;
}

/** Map a pointer into normalized image space for an object-contain layout. */
export function pointerToNorm(
  clientX: number,
  clientY: number,
  container: DOMRect,
  imageWidth: number,
  imageHeight: number,
): Point | null {
  if (!(imageWidth > 0) || !(imageHeight > 0)) return null;
  const contain = containRect(container.width, container.height, imageWidth, imageHeight);
  const x = clientX - container.left - contain.x;
  const y = clientY - container.top - contain.y;
  if (x < 0 || y < 0 || x > contain.w || y > contain.h) return null;
  return { x: x / contain.w, y: y / contain.h };
}

export function containRect(
  boxW: number,
  boxH: number,
  imgW: number,
  imgH: number,
): { x: number; y: number; w: number; h: number } {
  if (!(boxW > 0) || !(boxH > 0) || !(imgW > 0) || !(imgH > 0)) {
    return { x: 0, y: 0, w: boxW, h: boxH };
  }
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}
