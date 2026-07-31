import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { bbox } from './bbox.js';
import {
  type Polygon,
  ensureOrientation,
  isConvexPolygon,
  isSimplePolygon,
  normalizePolygon,
  orientation,
  pointInPolygon,
  polygonArea,
  polygonBbox,
  polygonCentroid,
  polygonContainsPoint,
  polygonEdges,
  polygonFromBbox,
  polygonPerimeter,
  polygonsCongruent,
  polygonsEqual,
  removeCollinearPoints,
  removeDuplicatePoints,
  reversePolygon,
  signedArea,
  signedDoubleArea,
  translatePolygon,
} from './polygon.js';
import { feet, inches, length, toSquareFeet } from './units.js';
import { type Vec2, vec2 } from './vec2.js';

const at = (xFeet: number, yFeet: number): Vec2 => vec2(feet(xFeet), feet(yFeet));

/** A 12' x 10' rectangle, counter-clockwise in a y-up world. */
const rectangle: Polygon = [at(0, 0), at(12, 0), at(12, 10), at(0, 10)];

/** An L-shaped room — the shape a basement actually is. */
const lShape: Polygon = [
  at(0, 0),
  at(20, 0),
  at(20, 8),
  at(12, 8),
  at(12, 14),
  at(0, 14),
];

const anyPoint = fc
  .tuple(fc.integer({ min: -5_000, max: 5_000 }), fc.integer({ min: -5_000, max: 5_000 }))
  .map(([x, y]): Vec2 => vec2(length(x), length(y)));

describe('area and orientation', () => {
  it('computes area exactly', () => {
    expect(toSquareFeet(polygonArea(rectangle))).toBe(120);
    expect(toSquareFeet(polygonArea(lShape))).toBe(20 * 8 + 12 * 6);
  });

  it('keeps the shoelace sum an exact integer', () => {
    expect(Number.isSafeInteger(signedDoubleArea(rectangle))).toBe(true);
    expect(signedArea(rectangle)).toBe(signedDoubleArea(rectangle) / 2);
  });

  it('signs the area by winding', () => {
    expect(orientation(rectangle)).toBe('ccw');
    expect(orientation(reversePolygon(rectangle))).toBe('cw');
    expect(signedArea(reversePolygon(rectangle))).toBe(0 - signedArea(rectangle));
  });

  it('calls a zero-area ring degenerate', () => {
    expect(orientation([at(0, 0), at(5, 0), at(10, 0)])).toBe('degenerate');
    expect(orientation([at(0, 0), at(5, 0)])).toBe('degenerate');
    expect(orientation([])).toBe('degenerate');
    expect(polygonArea([])).toBe(0);
  });

  it('leaves a degenerate ring alone rather than inventing a winding', () => {
    const flat: Polygon = [at(0, 0), at(5, 0), at(10, 0)];
    expect(ensureOrientation(flat, 'ccw')).toBe(flat);
    expect(ensureOrientation(rectangle, 'ccw')).toBe(rectangle);
    expect(orientation(ensureOrientation(rectangle, 'cw'))).toBe('cw');
  });

  it('is invariant to translation and to where the ring starts', () => {
    fc.assert(
      fc.property(anyPoint, fc.nat({ max: 5 }), (delta, rotation) => {
        const moved = translatePolygon(lShape, delta);
        expect(polygonArea(moved)).toBe(polygonArea(lShape));

        const rotated = [...lShape.slice(rotation), ...lShape.slice(0, rotation)];
        expect(signedDoubleArea(rotated)).toBe(signedDoubleArea(lShape));
      }),
    );
  });

  it('measures perimeter', () => {
    expect(polygonPerimeter(rectangle)).toBeCloseTo(feet(44), 6);
    expect(polygonPerimeter([])).toBe(0);
  });
});

describe('edges and bounds', () => {
  it('closes the ring implicitly', () => {
    const edges = polygonEdges(rectangle);
    expect(edges).toHaveLength(4);
    expect(edges[3]?.a).toEqual(at(0, 10));
    expect(edges[3]?.b).toEqual(at(0, 0));
    expect(polygonEdges([at(0, 0)])).toHaveLength(0);
  });

  it('bounds the ring', () => {
    expect(polygonBbox(rectangle)).toEqual({ min: at(0, 0), max: at(12, 10) });
    expect(polygonBbox([])).toBeNull();
  });

  it('round-trips a box through a ring', () => {
    const box = bbox(at(1, 2), at(5, 9));
    const ring = polygonFromBbox(box);
    expect(orientation(ring)).toBe('ccw');
    expect(polygonBbox(ring)).toEqual(box);
  });
});

describe('centroid', () => {
  it('centres a rectangle', () => {
    expect(polygonCentroid(rectangle)).toEqual(at(6, 5));
  });

  it('pulls toward the heavy side of an L', () => {
    const centroid = polygonCentroid(lShape);
    expect(centroid).not.toBeNull();
    if (centroid === null) throw new Error('unreachable');
    expect(centroid.x).toBeLessThan(feet(10));
    expect(centroid.y).toBeLessThan(feet(7));
  });

  it('falls back to the bbox centre for a degenerate ring', () => {
    expect(polygonCentroid([at(0, 0), at(10, 0)])).toEqual(at(5, 0));
    expect(polygonCentroid([])).toBeNull();
  });
});

describe('point containment', () => {
  it('separates inside, outside, and boundary', () => {
    expect(pointInPolygon(rectangle, at(6, 5))).toBe('inside');
    expect(pointInPolygon(rectangle, at(20, 5))).toBe('outside');
    expect(pointInPolygon(rectangle, at(0, 5))).toBe('boundary');
    expect(pointInPolygon(rectangle, at(0, 0))).toBe('boundary');
    expect(pointInPolygon(rectangle, at(12, 10))).toBe('boundary');
  });

  it('handles the notch of an L correctly', () => {
    expect(pointInPolygon(lShape, at(6, 12))).toBe('inside');
    expect(pointInPolygon(lShape, at(16, 12))).toBe('outside');
    expect(pointInPolygon(lShape, at(16, 4))).toBe('inside');
    expect(pointInPolygon(lShape, at(12, 8))).toBe('boundary');
  });

  it('does not flip on a ray that grazes a vertex', () => {
    // A horizontal ray from (-∞, 8') passes exactly through two vertices of the L.
    expect(pointInPolygon(lShape, vec2(feet(-1), feet(8)))).toBe('outside');
    expect(pointInPolygon(lShape, vec2(feet(6), feet(8)))).toBe('inside');
    expect(pointInPolygon(lShape, vec2(feet(30), feet(8)))).toBe('outside');
  });

  it('reports boundary for every vertex and edge midpoint', () => {
    for (const edge of polygonEdges(lShape)) {
      expect(pointInPolygon(lShape, edge.a)).toBe('boundary');
      const mid = vec2(
        length((edge.a.x + edge.b.x) / 2),
        length((edge.a.y + edge.b.y) / 2),
      );
      expect(pointInPolygon(lShape, mid)).toBe('boundary');
    }
  });

  it('is unchanged by reversing the winding', () => {
    fc.assert(
      fc.property(anyPoint, (p) => {
        expect(pointInPolygon(lShape, p)).toBe(pointInPolygon(reversePolygon(lShape), p));
      }),
    );
  });

  it('agrees with the bounding box for points outside it', () => {
    fc.assert(
      fc.property(anyPoint, (p) => {
        const box = polygonBbox(lShape);
        if (box === null) return;
        const outsideBox =
          p.x < box.min.x || p.x > box.max.x || p.y < box.min.y || p.y > box.max.y;
        if (outsideBox) expect(pointInPolygon(lShape, p)).toBe('outside');
      }),
    );
  });

  it('offers a boolean convenience that respects the boundary flag', () => {
    expect(polygonContainsPoint(rectangle, at(0, 5))).toBe(true);
    expect(polygonContainsPoint(rectangle, at(0, 5), false)).toBe(false);
    expect(polygonContainsPoint(rectangle, at(6, 5), false)).toBe(true);
  });

  it('degrades gracefully below three vertices', () => {
    expect(pointInPolygon([], at(0, 0))).toBe('outside');
    expect(pointInPolygon([at(1, 1)], at(1, 1))).toBe('boundary');
    expect(pointInPolygon([at(0, 0), at(10, 0)], at(5, 0))).toBe('boundary');
    expect(pointInPolygon([at(0, 0), at(10, 0)], at(5, 5))).toBe('outside');
  });
});

describe('cleanup', () => {
  it('drops duplicate vertices, including across the close', () => {
    expect(
      removeDuplicatePoints([at(0, 0), at(0, 0), at(12, 0), at(12, 10), at(0, 0)]),
    ).toEqual([at(0, 0), at(12, 0), at(12, 10)]);
    expect(removeDuplicatePoints([])).toEqual([]);
  });

  it('drops exactly-collinear vertices', () => {
    const withMidpoints: Polygon = [at(0, 0), at(6, 0), at(12, 0), at(12, 10), at(0, 10)];
    expect(removeCollinearPoints(withMidpoints)).toEqual(rectangle);
  });

  it('keeps a real corner', () => {
    expect(removeCollinearPoints(lShape)).toEqual(lShape);
  });

  it('refuses to collapse a ring below three vertices', () => {
    const flat: Polygon = [at(0, 0), at(5, 0), at(10, 0)];
    expect(removeCollinearPoints(flat)).toEqual(flat);
  });

  it('normalises without changing area', () => {
    const noisy: Polygon = [
      at(0, 0),
      at(0, 0),
      at(6, 0),
      at(12, 0),
      at(12, 10),
      at(0, 10),
    ];
    expect(polygonArea(normalizePolygon(noisy))).toBe(polygonArea(rectangle));
    expect(polygonsEqual(normalizePolygon(noisy), rectangle)).toBe(true);
  });
});

describe('shape predicates', () => {
  it('accepts simple rings', () => {
    expect(isSimplePolygon(rectangle)).toBe(true);
    expect(isSimplePolygon(lShape)).toBe(true);
    expect(isSimplePolygon(reversePolygon(lShape))).toBe(true);
  });

  it('rejects a self-crossing bowtie', () => {
    expect(isSimplePolygon([at(0, 0), at(10, 10), at(10, 0), at(0, 10)])).toBe(false);
  });

  it('rejects a ring that touches itself at a vertex', () => {
    expect(
      isSimplePolygon([at(0, 0), at(10, 0), at(5, 5), at(10, 10), at(0, 10), at(5, 5)]),
    ).toBe(false);
  });

  it('rejects zero-length edges and short rings', () => {
    expect(isSimplePolygon([at(0, 0), at(0, 0), at(10, 0), at(10, 10)])).toBe(false);
    expect(isSimplePolygon([at(0, 0), at(10, 0)])).toBe(false);
    expect(isSimplePolygon([])).toBe(false);
  });

  it('rejects a ring with a doubled-back spike', () => {
    expect(isSimplePolygon([at(0, 0), at(10, 0), at(5, 0), at(5, 10)])).toBe(false);
  });

  it('identifies convexity', () => {
    expect(isConvexPolygon(rectangle)).toBe(true);
    expect(isConvexPolygon(lShape)).toBe(false);
    expect(isConvexPolygon([at(0, 0), at(6, 0), at(12, 0), at(12, 10), at(0, 10)])).toBe(
      true,
    );
    expect(isConvexPolygon([at(0, 0), at(5, 0), at(10, 0)])).toBe(false);
  });
});

describe('comparison', () => {
  it('compares vertex-for-vertex', () => {
    expect(polygonsEqual(rectangle, [...rectangle])).toBe(true);
    expect(polygonsEqual(rectangle, reversePolygon(rectangle))).toBe(false);
    expect(polygonsEqual(rectangle, lShape)).toBe(false);
  });

  it('sees through winding and starting vertex', () => {
    expect(polygonsCongruent(rectangle, reversePolygon(rectangle))).toBe(true);
    expect(
      polygonsCongruent(rectangle, [at(12, 0), at(12, 10), at(0, 10), at(0, 0)]),
    ).toBe(true);
    expect(polygonsCongruent(rectangle, lShape)).toBe(false);
    expect(polygonsCongruent([], [])).toBe(true);
  });

  it('sees through redundant collinear vertices', () => {
    expect(
      polygonsCongruent(rectangle, [
        at(0, 0),
        at(6, 0),
        at(12, 0),
        at(12, 10),
        at(0, 10),
      ]),
    ).toBe(true);
  });
});

describe('a basement is not a rectangle', () => {
  it('measures an out-of-square foundation without squaring it up', () => {
    // 1-1/4" out of square over 24 feet — ordinary for a poured foundation, and the
    // kind of thing that must survive into the drawing rather than be cleaned away.
    const outOfSquare: Polygon = [
      vec2(length(0), length(0)),
      vec2(feet(24), inches(1.25)),
      vec2(feet(24), feet(16)),
      vec2(length(0), feet(16)),
    ];
    expect(isSimplePolygon(outOfSquare)).toBe(true);
    expect(orientation(outOfSquare)).toBe('ccw');
    expect(removeCollinearPoints(outOfSquare)).toEqual(outOfSquare);
    // 24' x 16' less the triangle the skew cuts off: 384 - (24 x 1.25/12)/2.
    expect(toSquareFeet(polygonArea(outOfSquare))).toBe(382.75);
  });
});
