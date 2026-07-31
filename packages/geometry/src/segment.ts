import { type Bbox } from './bbox.js';
import { type Length, length } from './units.js';
import {
  type Vec2,
  addVec2,
  angleOf,
  cross,
  direction,
  distance,
  dot,
  equalsVec2,
  lerpVec2,
  magnitude,
  subVec2,
  vec2,
} from './vec2.js';

/**
 * A directed line segment from `a` to `b`.
 *
 * Note on exactness: the predicates here use integer cross and dot products, so
 * collinearity, containment, and the intersect/miss decision are exact for any
 * coordinates within roughly ±2^17 units (about ±340 feet). Beyond that the triple
 * products used by `segmentIntersection` can exceed 2^53. Basements are smaller than
 * that; site plans are not, and would need a different kernel.
 */
export interface Segment {
  readonly a: Vec2;
  readonly b: Vec2;
}

export function segment(a: Vec2, b: Vec2): Segment {
  return { a, b };
}

export function segmentVector(s: Segment): Vec2 {
  return subVec2(s.b, s.a);
}

export function isDegenerateSegment(s: Segment): boolean {
  return equalsVec2(s.a, s.b);
}

/** Length in units (1/32"). Irrational in general, so a float. */
export function segmentLength(s: Segment): number {
  return distance(s.a, s.b);
}

export function segmentLengthRounded(s: Segment): Length {
  return length(Math.round(segmentLength(s)));
}

/** Exact squared length, in Length². */
export function segmentLengthSquared(s: Segment): number {
  const v = segmentVector(s);
  return v.x * v.x + v.y * v.y;
}

export function segmentDirection(s: Segment): { readonly x: number; readonly y: number } {
  return direction(segmentVector(s));
}

export function segmentAngle(s: Segment): number {
  return angleOf(segmentVector(s));
}

export function reverseSegment(s: Segment): Segment {
  return { a: s.b, b: s.a };
}

export function translateSegment(s: Segment, delta: Vec2): Segment {
  return { a: addVec2(s.a, delta), b: addVec2(s.b, delta) };
}

export function segmentBbox(s: Segment): Bbox {
  return {
    min: vec2(length(Math.min(s.a.x, s.b.x)), length(Math.min(s.a.y, s.b.y))),
    max: vec2(length(Math.max(s.a.x, s.b.x)), length(Math.max(s.a.y, s.b.y))),
  };
}

export function segmentMidpoint(s: Segment): Vec2 {
  return lerpVec2(s.a, s.b, 0.5);
}

/** Point at parameter `t` along the segment, rounded to the nearest 1/32". */
export function pointAtParameter(s: Segment, t: number): Vec2 {
  return lerpVec2(s.a, s.b, t);
}

/**
 * Parameter of the projection of `p` onto the segment's infinite line. Unclamped, so
 * values outside [0, 1] mean "off the end". Returns 0 for a degenerate segment.
 */
export function parameterOfProjection(s: Segment, p: Vec2): number {
  const v = segmentVector(s);
  const lengthSquared = dot(v, v);
  if (lengthSquared === 0) return 0;
  return dot(subVec2(p, s.a), v) / lengthSquared;
}

export function closestPointOnSegment(s: Segment, p: Vec2): Vec2 {
  const t = parameterOfProjection(s, p);
  if (t <= 0) return s.a;
  if (t >= 1) return s.b;
  return pointAtParameter(s, t);
}

/** Perpendicular distance from `p` to the segment, in units. Not rounded. */
export function distanceToSegment(s: Segment, p: Vec2): number {
  const v = segmentVector(s);
  const lengthSquared = dot(v, v);
  if (lengthSquared === 0) return distance(s.a, p);
  const t = dot(subVec2(p, s.a), v) / lengthSquared;
  if (t <= 0) return distance(s.a, p);
  if (t >= 1) return distance(s.b, p);
  return Math.abs(cross(v, subVec2(p, s.a))) / magnitude(v);
}

/** Exact: is `p` collinear with the segment and between its endpoints (inclusive)? */
export function isPointOnSegment(s: Segment, p: Vec2): boolean {
  if (cross(subVec2(s.b, s.a), subVec2(p, s.a)) !== 0) return false;
  return (
    p.x >= Math.min(s.a.x, s.b.x) &&
    p.x <= Math.max(s.a.x, s.b.x) &&
    p.y >= Math.min(s.a.y, s.b.y) &&
    p.y <= Math.max(s.a.y, s.b.y)
  );
}

/**
 * The result of intersecting two segments.
 *
 * `exact` on a point intersection reports whether the true crossing lands on the 1/32"
 * grid. When it is false, `point` has been rounded and is up to ~0.02" off the true
 * crossing — which matters when the result becomes a wall corner, because rounding two
 * corners independently can open a gap a room loop will not close.
 */
export type SegmentIntersection =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'point';
      readonly point: Vec2;
      readonly t: number;
      readonly u: number;
      readonly exact: boolean;
    }
  | { readonly kind: 'collinear'; readonly overlap: Segment };

const NO_INTERSECTION: SegmentIntersection = { kind: 'none' };

function pointResult(
  point: Vec2,
  t: number,
  u: number,
  exact: boolean,
): SegmentIntersection {
  return { kind: 'point', point, t, u, exact };
}

function degenerateAgainst(
  point: Vec2,
  other: Segment,
  pointIsFirst: boolean,
): SegmentIntersection {
  if (!isPointOnSegment(other, point)) return NO_INTERSECTION;
  const t = parameterOfProjection(other, point);
  return pointIsFirst ? pointResult(point, 0, t, true) : pointResult(point, t, 0, true);
}

/**
 * Intersect two segments exactly. Endpoint touches count as intersections, and
 * collinear overlaps are reported as such rather than collapsed to a point.
 */
export function segmentIntersection(s1: Segment, s2: Segment): SegmentIntersection {
  const d1 = isDegenerateSegment(s1);
  const d2 = isDegenerateSegment(s2);
  if (d1 && d2) {
    return equalsVec2(s1.a, s2.a) ? pointResult(s1.a, 0, 0, true) : NO_INTERSECTION;
  }
  if (d1) return degenerateAgainst(s1.a, s2, true);
  if (d2) return degenerateAgainst(s2.a, s1, false);

  const r = segmentVector(s1);
  const s = segmentVector(s2);
  const qp = subVec2(s2.a, s1.a);
  const denominator = cross(r, s);

  if (denominator === 0) {
    // Parallel. Collinear only if the offset between the two lines is zero.
    if (cross(qp, r) !== 0) return NO_INTERSECTION;

    const rr = dot(r, r);
    const n0 = dot(qp, r);
    const n1 = n0 + dot(s, r);
    const low = Math.min(n0, n1);
    const high = Math.max(n0, n1);
    if (high < 0 || low > rr) return NO_INTERSECTION;

    const overlapLow = Math.max(low, 0);
    const overlapHigh = Math.min(high, rr);
    const start = pointAtParameter(s1, overlapLow / rr);
    if (overlapLow === overlapHigh) {
      return pointResult(start, overlapLow / rr, parameterOfProjection(s2, start), true);
    }
    return {
      kind: 'collinear',
      overlap: segment(start, pointAtParameter(s1, overlapHigh / rr)),
    };
  }

  // Normalise so the denominator is positive and the range checks are simple compares.
  const sign = denominator < 0 ? -1 : 1;
  const den = denominator * sign;
  const tNumerator = cross(qp, s) * sign;
  const uNumerator = cross(qp, r) * sign;

  if (tNumerator < 0 || tNumerator > den) return NO_INTERSECTION;
  if (uNumerator < 0 || uNumerator > den) return NO_INTERSECTION;

  const offsetX = r.x * tNumerator;
  const offsetY = r.y * tNumerator;
  const exact = offsetX % den === 0 && offsetY % den === 0;
  const point = vec2(
    length(Math.round(s1.a.x + offsetX / den)),
    length(Math.round(s1.a.y + offsetY / den)),
  );

  return pointResult(point, tNumerator / den, uNumerator / den, exact);
}

/** Do the two segments touch or cross at all? Exact, and cheaper than the full result. */
export function segmentsIntersect(s1: Segment, s2: Segment): boolean {
  return segmentIntersection(s1, s2).kind !== 'none';
}
