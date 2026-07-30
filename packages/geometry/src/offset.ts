import { GeometryError } from './errors.js';
import { type Segment, segmentVector } from './segment.js';
import { type Length, length } from './units.js';
import { type Vec2, addVec2, magnitude, vec2 } from './vec2.js';

/**
 * Offset a segment perpendicular to itself by `distance`, to the left of the direction
 * a → b (the counter-clockwise normal in a y-up world). A negative distance offsets
 * right.
 *
 * The offset vector is rounded once and then applied to both endpoints, rather than
 * rounding each endpoint independently. That keeps the result exactly parallel to the
 * original and exactly the same length — which is what makes a wall's two faces stay
 * parallel to its centreline no matter how many times it is offset.
 */
export function offsetSegment(s: Segment, distance: Length): Segment {
  const delta = offsetVector(s, distance);
  return { a: addVec2(s.a, delta), b: addVec2(s.b, delta) };
}

/** The rounded perpendicular displacement `offsetSegment` applies. */
export function offsetVector(s: Segment, distance: Length): Vec2 {
  const v = segmentVector(s);
  const len = magnitude(v);
  if (len === 0) {
    throw new GeometryError(
      'geometry.offset-degenerate',
      'Cannot offset a zero-length segment: it has no direction.',
    );
  }
  return vec2(
    length(Math.round(((0 - v.y) / len) * distance)),
    length(Math.round((v.x / len) * distance)),
  );
}
