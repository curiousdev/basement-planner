/**
 * Angles are radians as doubles — the one place in the model where floats are the
 * canonical representation, because no integer grid represents rotation exactly.
 */

export const TAU = Math.PI * 2;
export const HALF_PI = Math.PI / 2;

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/** Normalise to [0, 2π). */
export function normalizeAngle(radians: number): number {
  const wrapped = radians % TAU;
  if (wrapped >= 0) return wrapped;
  // For a tiny negative input, `wrapped + TAU` rounds up to exactly TAU, which is
  // outside the half-open range this function promises. Fold it back to zero.
  const shifted = wrapped + TAU;
  return shifted >= TAU ? 0 : shifted;
}

/** Normalise to (-π, π] — the range `Math.atan2` returns. */
export function normalizeAngleSigned(radians: number): number {
  const wrapped = normalizeAngle(radians);
  return wrapped > Math.PI ? wrapped - TAU : wrapped;
}

/** Smallest signed rotation from `from` to `to`, in (-π, π]. */
export function angleDifference(from: number, to: number): number {
  return normalizeAngleSigned(to - from);
}

/** Undirected angle between two directions, in [0, π]. */
export function angleBetween(a: number, b: number): number {
  return Math.abs(angleDifference(a, b));
}

/**
 * Are two directions parallel within `tolerance`? Antiparallel counts, because a wall
 * running east and a wall running west are the same wall direction.
 */
export function isParallel(a: number, b: number, tolerance = 1e-9): boolean {
  const difference = angleBetween(a, b);
  return difference <= tolerance || Math.abs(difference - Math.PI) <= tolerance;
}

export function isPerpendicular(a: number, b: number, tolerance = 1e-9): boolean {
  return Math.abs(angleBetween(a, b) - HALF_PI) <= tolerance;
}

/** Snap to the nearest multiple of `increment` radians — the ortho/45° constraint. */
export function snapAngle(radians: number, increment: number): number {
  if (increment <= 0) return radians;
  return Math.round(radians / increment) * increment;
}
