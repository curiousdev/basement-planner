import { type Bbox, bboxCenter, bboxOf } from './bbox.js';
import { GeometryError } from './errors.js';
import {
  type Segment,
  isPointOnSegment,
  segment,
  segmentIntersection,
} from './segment.js';
import { type Area, ZERO_AREA, area, length } from './units.js';
import {
  type Vec2,
  addVec2,
  cross,
  distance,
  equalsVec2,
  subVec2,
  vec2,
} from './vec2.js';

/**
 * A closed ring of vertices. The closing edge from the last vertex back to the first is
 * implicit — never repeat the first point at the end, because a duplicated vertex is
 * indistinguishable from a genuinely degenerate ring.
 */
export type Polygon = readonly Vec2[];

export type Orientation = 'ccw' | 'cw' | 'degenerate';

export type PointPosition = 'inside' | 'outside' | 'boundary';

function vertexAt(poly: Polygon, index: number): Vec2 {
  const v = poly[index];
  if (v === undefined) {
    throw new GeometryError(
      'geometry.polygon-index',
      `Vertex ${String(index)} is out of range for a polygon of ${String(poly.length)}.`,
    );
  }
  return v;
}

/** The edges of the ring, including the implicit closing edge. */
export function polygonEdges(poly: Polygon): readonly Segment[] {
  if (poly.length < 2) return [];
  const edges: Segment[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    edges.push(segment(vertexAt(poly, i), vertexAt(poly, (i + 1) % poly.length)));
  }
  return edges;
}

/**
 * Twice the signed area, by the shoelace formula. Exact: every term is a product of
 * integers. Positive for a counter-clockwise ring in a y-up world.
 */
export function signedDoubleArea(poly: Polygon): number {
  if (poly.length < 3) return 0;
  let total = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const current = vertexAt(poly, i);
    const next = vertexAt(poly, (i + 1) % poly.length);
    total += current.x * next.y - next.x * current.y;
  }
  return total;
}

/** Signed area in Length². Exactly representable — halving an integer is lossless. */
export function signedArea(poly: Polygon): Area {
  return area(signedDoubleArea(poly) / 2);
}

/** Unsigned area in Length². Convert with `toSquareFeet` for display. */
export function polygonArea(poly: Polygon): Area {
  return area(Math.abs(signedDoubleArea(poly)) / 2);
}

export function orientation(poly: Polygon): Orientation {
  const doubleArea = signedDoubleArea(poly);
  if (doubleArea > 0) return 'ccw';
  if (doubleArea < 0) return 'cw';
  return 'degenerate';
}

export function reversePolygon(poly: Polygon): Polygon {
  return [...poly].reverse();
}

/**
 * Return the ring wound the requested way. A degenerate ring is returned unchanged —
 * there is no correct winding for zero area, and silently "fixing" it hides the defect.
 */
export function ensureOrientation(poly: Polygon, want: 'ccw' | 'cw'): Polygon {
  const actual = orientation(poly);
  if (actual === 'degenerate' || actual === want) return poly;
  return reversePolygon(poly);
}

/** Perimeter in units. Irrational in general, so a float. */
export function polygonPerimeter(poly: Polygon): number {
  if (poly.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < poly.length; i += 1) {
    total += distance(vertexAt(poly, i), vertexAt(poly, (i + 1) % poly.length));
  }
  return total;
}

export function polygonBbox(poly: Polygon): Bbox | null {
  return bboxOf(poly);
}

/**
 * Area-weighted centroid, rounded to the nearest 1/32". Degenerate rings have no
 * centroid by this formula, so they fall back to the bounding-box centre.
 */
export function polygonCentroid(poly: Polygon): Vec2 | null {
  const box = bboxOf(poly);
  if (box === null) return null;

  const doubleArea = signedDoubleArea(poly);
  if (doubleArea === 0) return bboxCenter(box);

  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const current = vertexAt(poly, i);
    const next = vertexAt(poly, (i + 1) % poly.length);
    const term = current.x * next.y - next.x * current.y;
    cx += (current.x + next.x) * term;
    cy += (current.y + next.y) * term;
  }

  const factor = 3 * doubleArea;
  return vec2(length(Math.round(cx / factor)), length(Math.round(cy / factor)));
}

/**
 * Exact point-in-polygon by ray casting, with the boundary reported explicitly.
 *
 * The crossing test is written as a cross-multiplication rather than a division so it
 * stays in integers: a point exactly on a vertex or edge is `boundary`, never a coin
 * flip between inside and outside.
 */
export function pointInPolygon(poly: Polygon, p: Vec2): PointPosition {
  if (poly.length < 3) {
    for (const edge of polygonEdges(poly)) {
      if (isPointOnSegment(edge, p)) return 'boundary';
    }
    if (poly.length === 1 && equalsVec2(vertexAt(poly, 0), p)) return 'boundary';
    return 'outside';
  }

  let inside = false;
  for (let i = 0; i < poly.length; i += 1) {
    const current = vertexAt(poly, i);
    const next = vertexAt(poly, (i + 1) % poly.length);

    if (isPointOnSegment(segment(current, next), p)) return 'boundary';

    if (current.y > p.y !== next.y > p.y) {
      const dy = next.y - current.y;
      const left = (p.x - current.x) * dy;
      const right = (p.y - current.y) * (next.x - current.x);
      if (dy > 0 ? left < right : left > right) inside = !inside;
    }
  }

  return inside ? 'inside' : 'outside';
}

export function polygonContainsPoint(
  poly: Polygon,
  p: Vec2,
  includeBoundary = true,
): boolean {
  const position = pointInPolygon(poly, p);
  if (position === 'inside') return true;
  return includeBoundary && position === 'boundary';
}

/** Drop consecutive duplicate vertices, including a duplicate wrapping the close. */
export function removeDuplicatePoints(poly: Polygon): Polygon {
  const result: Vec2[] = [];
  for (const point of poly) {
    const last = result[result.length - 1];
    if (last !== undefined && equalsVec2(last, point)) continue;
    result.push(point);
  }
  const first = result[0];
  const last = result[result.length - 1];
  if (
    result.length > 1 &&
    first !== undefined &&
    last !== undefined &&
    equalsVec2(first, last)
  ) {
    result.pop();
  }
  return result;
}

/**
 * Drop vertices that lie exactly on the line between their neighbours. Exact, so this
 * only removes points that carry no shape information.
 */
export function removeCollinearPoints(poly: Polygon): Polygon {
  if (poly.length < 3) return poly;
  const result: Vec2[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const previous = vertexAt(poly, (i - 1 + poly.length) % poly.length);
    const current = vertexAt(poly, i);
    const next = vertexAt(poly, (i + 1) % poly.length);
    if (cross(subVec2(current, previous), subVec2(next, current)) !== 0) {
      result.push(current);
    }
  }
  return result.length >= 3 ? result : poly;
}

/** Dedup then de-collinear. The canonical form for comparing two rings. */
export function normalizePolygon(poly: Polygon): Polygon {
  return removeCollinearPoints(removeDuplicatePoints(poly));
}

export function translatePolygon(poly: Polygon, delta: Vec2): Polygon {
  return poly.map((point) => addVec2(point, delta));
}

/**
 * True when the ring has at least three vertices, no zero-length edges, and no two
 * edges that touch anywhere other than at a shared endpoint.
 */
export function isSimplePolygon(poly: Polygon): boolean {
  if (poly.length < 3) return false;

  const edges = polygonEdges(poly);
  const count = edges.length;

  for (let i = 0; i < count; i += 1) {
    const edge = edges[i];
    if (edge === undefined || equalsVec2(edge.a, edge.b)) return false;
  }

  for (let i = 0; i < count; i += 1) {
    const first = edges[i];
    if (first === undefined) continue;

    for (let j = i + 1; j < count; j += 1) {
      const second = edges[j];
      if (second === undefined) continue;

      const adjacent = j === i + 1 || (i === 0 && j === count - 1);
      const result = segmentIntersection(first, second);

      if (adjacent) {
        // Neighbouring edges must meet at their shared vertex and nowhere else.
        if (result.kind === 'collinear') return false;
        if (result.kind === 'point') {
          const shared = j === i + 1 ? first.b : first.a;
          if (!equalsVec2(result.point, shared)) return false;
        }
      } else if (result.kind !== 'none') {
        return false;
      }
    }
  }

  return true;
}

/** True when every turn goes the same way. Collinear vertices are tolerated. */
export function isConvexPolygon(poly: Polygon): boolean {
  if (poly.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const previous = vertexAt(poly, i);
    const current = vertexAt(poly, (i + 1) % poly.length);
    const next = vertexAt(poly, (i + 2) % poly.length);
    const turn = cross(subVec2(current, previous), subVec2(next, current));
    if (turn === 0) continue;
    const turnSign = turn > 0 ? 1 : -1;
    if (sign === 0) sign = turnSign;
    else if (sign !== turnSign) return false;
  }
  return sign !== 0;
}

/** The four corners of a box as a counter-clockwise ring. */
export function polygonFromBbox(box: Bbox): Polygon {
  return [box.min, vec2(box.max.x, box.min.y), box.max, vec2(box.min.x, box.max.y)];
}

export function polygonsEqual(a: Polygon, b: Polygon): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!equalsVec2(vertexAt(a, i), vertexAt(b, i))) return false;
  }
  return true;
}

/**
 * True when two rings describe the same closed shape, allowing a different starting
 * vertex and either winding. Compares normalised forms.
 */
export function polygonsCongruent(a: Polygon, b: Polygon): boolean {
  const left = normalizePolygon(a);
  const right = normalizePolygon(b);
  if (left.length !== right.length) return false;
  if (left.length === 0) return true;

  for (const candidate of [right, reversePolygon(right)]) {
    for (let offset = 0; offset < candidate.length; offset += 1) {
      let matches = true;
      for (let i = 0; i < left.length; i += 1) {
        const rotated = candidate[(i + offset) % candidate.length];
        if (rotated === undefined || !equalsVec2(vertexAt(left, i), rotated)) {
          matches = false;
          break;
        }
      }
      if (matches) return true;
    }
  }
  return false;
}

export const EMPTY_AREA = ZERO_AREA;
