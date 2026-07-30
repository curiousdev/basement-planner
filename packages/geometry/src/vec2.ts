import {
  type Length,
  ZERO_LENGTH,
  addLengths,
  length,
  negateLength,
  scaleLength,
  subLengths,
} from './units.js';

/**
 * A point or vector in model space. Model space is y-up; the flip to y-down happens
 * once, in the render viewport transform.
 */
export interface Vec2 {
  readonly x: Length;
  readonly y: Length;
}

export function vec2(x: Length, y: Length): Vec2 {
  return { x, y };
}

export const ORIGIN: Vec2 = { x: ZERO_LENGTH, y: ZERO_LENGTH };

export function addVec2(a: Vec2, b: Vec2): Vec2 {
  return { x: addLengths(a.x, b.x), y: addLengths(a.y, b.y) };
}

export function subVec2(a: Vec2, b: Vec2): Vec2 {
  return { x: subLengths(a.x, b.x), y: subLengths(a.y, b.y) };
}

export function negateVec2(a: Vec2): Vec2 {
  return { x: negateLength(a.x), y: negateLength(a.y) };
}

/** Scale by a real factor, rounding each component to the nearest 1/32". */
export function scaleVec2(a: Vec2, factor: number): Vec2 {
  return { x: scaleLength(a.x, factor), y: scaleLength(a.y, factor) };
}

/** Exact: both components are integers, so the dot product is an integer. */
export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/** Exact 2D cross product (the z of the 3D cross). Positive when b is CCW from a. */
export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

/**
 * Exact orientation test. Positive when `c` lies left of the directed line `a → b`,
 * negative when right, zero when collinear. Integer inputs make this exact, which is
 * the whole reason lengths are integers.
 */
export function orient2d(a: Vec2, b: Vec2, c: Vec2): number {
  return cross(subVec2(b, a), subVec2(c, a));
}

/** Exact squared magnitude, in Length². */
export function magnitudeSquared(a: Vec2): number {
  return a.x * a.x + a.y * a.y;
}

/** Magnitude in units (1/32"). Irrational in general, so this returns a float. */
export function magnitude(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

/** Magnitude snapped back to a Length. Use only when the result is stored. */
export function magnitudeRounded(a: Vec2): Length {
  return length(Math.round(magnitude(a)));
}

export function distanceSquared(a: Vec2, b: Vec2): number {
  return magnitudeSquared(subVec2(a, b));
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distanceRounded(a: Vec2, b: Vec2): Length {
  return length(Math.round(distance(a, b)));
}

export function equalsVec2(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Rotate 90° counter-clockwise. Exact — no trigonometry, no rounding. */
export function perpendicularCcw(a: Vec2): Vec2 {
  return { x: negateLength(a.y), y: a.x };
}

/** Rotate 90° clockwise. Exact. */
export function perpendicularCw(a: Vec2): Vec2 {
  return { x: a.y, y: negateLength(a.x) };
}

/** Direction as a unit vector of floats. Zero-length input yields `{ x: 0, y: 0 }`. */
export function direction(a: Vec2): { readonly x: number; readonly y: number } {
  const m = magnitude(a);
  if (m === 0) return { x: 0, y: 0 };
  return { x: a.x / m, y: a.y / m };
}

/** Angle of the vector in radians, measured CCW from +x, in (-π, π]. */
export function angleOf(a: Vec2): number {
  return Math.atan2(a.y, a.x);
}

/** Rotate about the origin. Trigonometric, therefore rounded — expect 1/32" of drift. */
export function rotateVec2(a: Vec2, radians: number): Vec2 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: length(Math.round(a.x * cos - a.y * sin)),
    y: length(Math.round(a.x * sin + a.y * cos)),
  };
}

export function rotateVec2About(a: Vec2, pivot: Vec2, radians: number): Vec2 {
  return addVec2(pivot, rotateVec2(subVec2(a, pivot), radians));
}

/** Linear interpolation, rounded to the nearest 1/32". */
export function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: length(Math.round(a.x + (b.x - a.x) * t)),
    y: length(Math.round(a.y + (b.y - a.y) * t)),
  };
}

export function midpoint(a: Vec2, b: Vec2): Vec2 {
  return lerpVec2(a, b, 0.5);
}

/** Manhattan distance — exact, and the right metric for orthogonal snapping. */
export function manhattanDistance(a: Vec2, b: Vec2): Length {
  return length(Math.abs(a.x - b.x) + Math.abs(a.y - b.y));
}
