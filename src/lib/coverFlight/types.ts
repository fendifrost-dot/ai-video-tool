/**
 * Music-cover camera-flight guides (the @by.jadla two-line system).
 *
 * Coordinates are normalized 0..1 in image space (origin top-left), so a path
 * drawn on a 1:1 cover still maps when we export at native resolution.
 */

export type CoverAspect = "square" | "wide" | "tall";

export type PathKind = "horizontal" | "circle" | "diagonal";

export type Point = {
  x: number;
  y: number;
};

/** White viewing-direction arrow. Angle is radians, 0 = right, clockwise-positive in screen space. */
export type FlightArrow = {
  x: number;
  y: number;
  angle: number;
};

export type FlightGuides = {
  path: Point[];
  arrows: FlightArrow[];
};

export type CoverFlightCompileInput = {
  /** Fills the [INSERT PATH] block. Required. */
  pathDescription: string;
  /** Optional named landmarks (subject, typography, collage panels). */
  keyElements?: string;
};

export type CoverFlightCompileResult = {
  promptText: string;
  pathDescription: string;
  unfilled: boolean;
  issues: string[];
};

export type CoverFlightValidation = {
  ok: boolean;
  issues: string[];
};
