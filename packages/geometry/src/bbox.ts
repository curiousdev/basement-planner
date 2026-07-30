import { GeometryError } from './errors.js';
import {
  type Area,
  type Length,
  addLengths,
  length,
  multiplyLengths,
  subLengths,
} from './units.js';
import { type Vec2, vec2 } from './vec2.js';

/** An axis-aligned bounding box. `min` is the low corner in a y-up world. */
export interface Bbox {
  readonly min: Vec2;
  readonly max: Vec2;
}

export function bbox(min: Vec2, max: Vec2): Bbox {
  if (min.x > max.x || min.y > max.y) {
    throw new GeometryError(
      'geometry.inverted-bbox',
      'Bbox min must be component-wise less than or equal to max.',
    );
  }
  return { min, max };
}

/** Bounding box of a point set. Returns null for an empty set — there is no empty box. */
export function bboxOf(points: readonly Vec2[]): Bbox | null {
  const first = points[0];
  if (first === undefined) return null;

  let minX: number = first.x;
  let minY: number = first.y;
  let maxX: number = first.x;
  let maxY: number = first.y;

  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    if (p === undefined) continue;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    min: vec2(length(minX), length(minY)),
    max: vec2(length(maxX), length(maxY)),
  };
}

export function bboxWidth(b: Bbox): Length {
  return subLengths(b.max.x, b.min.x);
}

export function bboxHeight(b: Bbox): Length {
  return subLengths(b.max.y, b.min.y);
}

export function bboxArea(b: Bbox): Area {
  return multiplyLengths(bboxWidth(b), bboxHeight(b));
}

export function bboxCenter(b: Bbox): Vec2 {
  return vec2(
    length(Math.round((b.min.x + b.max.x) / 2)),
    length(Math.round((b.min.y + b.max.y) / 2)),
  );
}

export function bboxCorners(b: Bbox): readonly [Vec2, Vec2, Vec2, Vec2] {
  return [b.min, vec2(b.max.x, b.min.y), b.max, vec2(b.min.x, b.max.y)];
}

/** Closed containment — a point on the boundary is contained. */
export function bboxContainsPoint(b: Bbox, p: Vec2): boolean {
  return p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y;
}

export function bboxContainsBbox(outer: Bbox, inner: Bbox): boolean {
  return bboxContainsPoint(outer, inner.min) && bboxContainsPoint(outer, inner.max);
}

/** Closed intersection — boxes that share only an edge do intersect. */
export function bboxIntersects(a: Bbox, b: Bbox): boolean {
  return (
    a.min.x <= b.max.x && a.max.x >= b.min.x && a.min.y <= b.max.y && a.max.y >= b.min.y
  );
}

export function bboxUnion(a: Bbox, b: Bbox): Bbox {
  return {
    min: vec2(length(Math.min(a.min.x, b.min.x)), length(Math.min(a.min.y, b.min.y))),
    max: vec2(length(Math.max(a.max.x, b.max.x)), length(Math.max(a.max.y, b.max.y))),
  };
}

export function bboxIntersection(a: Bbox, b: Bbox): Bbox | null {
  if (!bboxIntersects(a, b)) return null;
  return {
    min: vec2(length(Math.max(a.min.x, b.min.x)), length(Math.max(a.min.y, b.min.y))),
    max: vec2(length(Math.min(a.max.x, b.max.x)), length(Math.min(a.max.y, b.max.y))),
  };
}

/** Grow (or, with a negative margin, shrink) a box on all four sides. */
export function expandBbox(b: Bbox, margin: Length): Bbox {
  const min = vec2(subLengths(b.min.x, margin), subLengths(b.min.y, margin));
  const max = vec2(addLengths(b.max.x, margin), addLengths(b.max.y, margin));
  if (min.x > max.x || min.y > max.y) {
    throw new GeometryError(
      'geometry.over-shrunk-bbox',
      'expandBbox shrank the box past inversion.',
    );
  }
  return { min, max };
}

export function translateBbox(b: Bbox, delta: Vec2): Bbox {
  return {
    min: vec2(addLengths(b.min.x, delta.x), addLengths(b.min.y, delta.y)),
    max: vec2(addLengths(b.max.x, delta.x), addLengths(b.max.y, delta.y)),
  };
}

/** A box with zero width or height — legal, and worth testing for before dividing. */
export function isDegenerateBbox(b: Bbox): boolean {
  return b.min.x === b.max.x || b.min.y === b.max.y;
}
