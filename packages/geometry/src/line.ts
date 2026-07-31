import { length } from './units.js';
import { type Vec2, cross, subVec2, vec2 } from './vec2.js';

/**
 * An infinite line, as a point and a direction. The direction is a `Vec2` rather than a
 * unit vector of floats so that the parallel test stays an exact integer comparison —
 * two wall faces are either parallel or they are not, and a float dot product would make
 * that decision fuzzy at exactly the joins where it matters most.
 */
export interface Line {
  readonly point: Vec2;
  readonly direction: Vec2;
}

export function line(point: Vec2, direction: Vec2): Line {
  return { point, direction };
}

/**
 * Where two infinite lines cross, or null when they are parallel (including collinear).
 *
 * The crossing is a rational point and is rounded once onto the 1/32" grid. Callers that
 * care whether the rounding moved anything should compare against the inputs; for wall
 * joins a half-unit is far below the tolerance of the thing being built.
 */
export function lineIntersection(a: Line, b: Line): Vec2 | null {
  const denominator = cross(a.direction, b.direction);
  if (denominator === 0) return null;

  const offset = subVec2(b.point, a.point);
  const t = cross(offset, b.direction) / denominator;

  return vec2(
    length(Math.round(a.point.x + a.direction.x * t)),
    length(Math.round(a.point.y + a.direction.y * t)),
  );
}

/** Signed distance test: which side of the line does `p` fall on? Exact. */
export function sideOfLine(l: Line, p: Vec2): number {
  return cross(l.direction, subVec2(p, l.point));
}

/** Parameter of `p` projected onto the line, in multiples of `direction`. */
export function parameterOnLine(l: Line, p: Vec2): number {
  const d = l.direction;
  const lengthSquared = d.x * d.x + d.y * d.y;
  if (lengthSquared === 0) return 0;
  const offset = subVec2(p, l.point);
  return (offset.x * d.x + offset.y * d.y) / lengthSquared;
}

/** True when the two lines have no unique crossing. */
export function areParallel(a: Line, b: Line): boolean {
  return cross(a.direction, b.direction) === 0;
}

/** Distance from a point to the infinite line, in units. */
export function distanceToLine(l: Line, p: Vec2): number {
  const d = l.direction;
  const magnitude = Math.hypot(d.x, d.y);
  if (magnitude === 0) return Math.hypot(p.x - l.point.x, p.y - l.point.y);
  return Math.abs(sideOfLine(l, p)) / magnitude;
}
