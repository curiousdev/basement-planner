import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  closestPointOnSegment,
  distanceToSegment,
  isDegenerateSegment,
  isPointOnSegment,
  parameterOfProjection,
  pointAtParameter,
  reverseSegment,
  segment,
  segmentAngle,
  segmentBbox,
  segmentIntersection,
  segmentLength,
  segmentLengthRounded,
  segmentLengthSquared,
  segmentMidpoint,
  segmentsIntersect,
  translateSegment,
} from './segment.js';
import { feet, inches, length } from './units.js';
import { type Vec2, equalsVec2, vec2 } from './vec2.js';

const point = (x: number, y: number): Vec2 => vec2(inches(x), inches(y));

const anyPoint = fc
  .tuple(
    fc.integer({ min: -10_000, max: 10_000 }),
    fc.integer({ min: -10_000, max: 10_000 }),
  )
  .map(([x, y]): Vec2 => vec2(length(x), length(y)));

describe('segment basics', () => {
  it('measures length', () => {
    const s = segment(point(0, 0), point(3, 4));
    expect(segmentLength(s)).toBeCloseTo(160, 10);
    expect(segmentLengthRounded(s)).toBe(inches(5));
    expect(segmentLengthSquared(s)).toBe(96 * 96 + 128 * 128);
  });

  it('recognises a degenerate segment', () => {
    expect(isDegenerateSegment(segment(point(1, 1), point(1, 1)))).toBe(true);
    expect(isDegenerateSegment(segment(point(1, 1), point(1, 2)))).toBe(false);
    expect(segmentLength(segment(point(1, 1), point(1, 1)))).toBe(0);
  });

  it('reverses, translates, and bounds', () => {
    const s = segment(point(0, 0), point(10, 4));
    expect(equalsVec2(reverseSegment(s).a, s.b)).toBe(true);
    expect(translateSegment(s, point(1, 1)).a).toEqual(point(1, 1));
    expect(segmentBbox(segment(point(10, 4), point(0, 0)))).toEqual({
      min: point(0, 0),
      max: point(10, 4),
    });
    expect(segmentMidpoint(s)).toEqual(point(5, 2));
    expect(segmentAngle(segment(point(0, 0), point(0, 5)))).toBeCloseTo(Math.PI / 2, 12);
  });
});

describe('projection and distance', () => {
  it('projects onto the infinite line', () => {
    const s = segment(point(0, 0), point(10, 0));
    expect(parameterOfProjection(s, point(5, 3))).toBeCloseTo(0.5, 12);
    expect(parameterOfProjection(s, point(-5, 0))).toBeCloseTo(-0.5, 12);
    expect(parameterOfProjection(segment(point(1, 1), point(1, 1)), point(9, 9))).toBe(0);
  });

  it('clamps the closest point to the segment', () => {
    const s = segment(point(0, 0), point(10, 0));
    expect(closestPointOnSegment(s, point(5, 3))).toEqual(point(5, 0));
    expect(closestPointOnSegment(s, point(-5, 3))).toEqual(point(0, 0));
    expect(closestPointOnSegment(s, point(50, 3))).toEqual(point(10, 0));
  });

  it('measures perpendicular distance', () => {
    const s = segment(point(0, 0), point(10, 0));
    expect(distanceToSegment(s, point(5, 3))).toBeCloseTo(96, 10);
    expect(distanceToSegment(s, point(-3, 0))).toBeCloseTo(96, 10);
    expect(distanceToSegment(segment(point(2, 2), point(2, 2)), point(2, 5))).toBeCloseTo(
      96,
      10,
    );
  });

  it('never reports a distance beyond the nearer endpoint', () => {
    fc.assert(
      fc.property(anyPoint, anyPoint, anyPoint, (a, b, p) => {
        const s = segment(a, b);
        const d = distanceToSegment(s, p);
        expect(d).toBeLessThanOrEqual(Math.hypot(p.x - a.x, p.y - a.y) + 1e-6);
        expect(d).toBeLessThanOrEqual(Math.hypot(p.x - b.x, p.y - b.y) + 1e-6);
      }),
    );
  });

  it('tests membership exactly', () => {
    const s = segment(point(0, 0), point(10, 0));
    expect(isPointOnSegment(s, point(5, 0))).toBe(true);
    expect(isPointOnSegment(s, point(0, 0))).toBe(true);
    expect(isPointOnSegment(s, point(10, 0))).toBe(true);
    expect(isPointOnSegment(s, point(11, 0))).toBe(false);
    expect(isPointOnSegment(s, vec2(inches(5), length(1)))).toBe(false);
  });

  it('puts pointAtParameter on the segment for t in [0, 1]', () => {
    fc.assert(
      fc.property(
        anyPoint,
        anyPoint,
        fc.double({ min: 0, max: 1, noNaN: true }),
        (a, b, t) => {
          const s = segment(a, b);
          // Rounding can move the point off the exact line by up to half a unit, so the
          // check is a distance bound rather than exact membership.
          expect(distanceToSegment(s, pointAtParameter(s, t))).toBeLessThan(1);
        },
      ),
    );
  });
});

describe('segment intersection', () => {
  it('finds a clean crossing', () => {
    const result = segmentIntersection(
      segment(point(0, 0), point(10, 0)),
      segment(point(5, -5), point(5, 5)),
    );
    expect(result.kind).toBe('point');
    if (result.kind !== 'point') throw new Error('unreachable');
    expect(result.point).toEqual(point(5, 0));
    expect(result.t).toBeCloseTo(0.5, 12);
    expect(result.u).toBeCloseTo(0.5, 12);
    expect(result.exact).toBe(true);
  });

  it('reports misses', () => {
    expect(
      segmentIntersection(
        segment(point(0, 0), point(10, 0)),
        segment(point(20, -5), point(20, 5)),
      ).kind,
    ).toBe('none');
    // Parallel but offset.
    expect(
      segmentIntersection(
        segment(point(0, 0), point(10, 0)),
        segment(point(0, 1), point(10, 1)),
      ).kind,
    ).toBe('none');
    // Collinear but disjoint.
    expect(
      segmentIntersection(
        segment(point(0, 0), point(10, 0)),
        segment(point(20, 0), point(30, 0)),
      ).kind,
    ).toBe('none');
  });

  it('counts an endpoint touch as an intersection', () => {
    const result = segmentIntersection(
      segment(point(0, 0), point(10, 0)),
      segment(point(10, 0), point(10, 10)),
    );
    expect(result.kind).toBe('point');
    if (result.kind !== 'point') throw new Error('unreachable');
    expect(result.point).toEqual(point(10, 0));
    expect(
      segmentsIntersect(
        segment(point(0, 0), point(1, 0)),
        segment(point(1, 0), point(2, 0)),
      ),
    ).toBe(true);
  });

  it('reports a collinear overlap as an overlap, not a point', () => {
    const result = segmentIntersection(
      segment(point(0, 0), point(10, 0)),
      segment(point(4, 0), point(20, 0)),
    );
    expect(result.kind).toBe('collinear');
    if (result.kind !== 'collinear') throw new Error('unreachable');
    expect(result.overlap.a).toEqual(point(4, 0));
    expect(result.overlap.b).toEqual(point(10, 0));
  });

  it('collapses a collinear touch at a single shared endpoint to a point', () => {
    const result = segmentIntersection(
      segment(point(0, 0), point(10, 0)),
      segment(point(10, 0), point(20, 0)),
    );
    expect(result.kind).toBe('point');
    if (result.kind !== 'point') throw new Error('unreachable');
    expect(result.point).toEqual(point(10, 0));
  });

  it('handles a fully contained collinear segment in either order', () => {
    const outer = segment(point(0, 0), point(20, 0));
    const inner = segment(point(5, 0), point(15, 0));
    for (const [first, second] of [
      [outer, inner],
      [inner, outer],
    ] as const) {
      const result = segmentIntersection(first, second);
      expect(result.kind).toBe('collinear');
      if (result.kind !== 'collinear') throw new Error('unreachable');
      const xs = [result.overlap.a.x, result.overlap.b.x].sort((l, r) => l - r);
      expect(xs).toEqual([inches(5), inches(15)]);
    }
  });

  it('flags an intersection that had to be rounded onto the grid', () => {
    // These cross at x = 1/3 of a unit — not representable on the 1/32" grid.
    const result = segmentIntersection(
      segment(vec2(length(0), length(0)), vec2(length(1), length(3))),
      segment(vec2(length(0), length(1)), vec2(length(1), length(0))),
    );
    expect(result.kind).toBe('point');
    if (result.kind !== 'point') throw new Error('unreachable');
    expect(result.exact).toBe(false);
  });

  it('handles degenerate segments', () => {
    const dot = segment(point(5, 0), point(5, 0));
    const line = segment(point(0, 0), point(10, 0));
    expect(segmentIntersection(dot, line).kind).toBe('point');
    expect(segmentIntersection(line, dot).kind).toBe('point');
    expect(segmentIntersection(dot, dot).kind).toBe('point');
    expect(segmentIntersection(dot, segment(point(9, 9), point(9, 9))).kind).toBe('none');
    expect(segmentIntersection(segment(point(0, 5), point(0, 5)), line).kind).toBe(
      'none',
    );
  });

  it('is symmetric in its arguments', () => {
    fc.assert(
      fc.property(anyPoint, anyPoint, anyPoint, anyPoint, (a, b, c, d) => {
        const forward = segmentIntersection(segment(a, b), segment(c, d));
        const backward = segmentIntersection(segment(c, d), segment(a, b));
        expect(forward.kind).toBe(backward.kind);
      }),
    );
  });

  it('agrees with the orientation test on whether a crossing exists', () => {
    fc.assert(
      fc.property(anyPoint, anyPoint, anyPoint, anyPoint, (a, b, c, d) => {
        const s1 = segment(a, b);
        const s2 = segment(c, d);
        if (segmentsIntersect(s1, s2)) return;
        // No intersection means no endpoint of either lies on the other.
        expect(isPointOnSegment(s1, c)).toBe(false);
        expect(isPointOnSegment(s1, d)).toBe(false);
        expect(isPointOnSegment(s2, a)).toBe(false);
        expect(isPointOnSegment(s2, b)).toBe(false);
      }),
    );
  });

  it('is exact for the intersection of two walls meeting at a corner', () => {
    // A 12'-6" x 9'-3" room: the centrelines cross exactly on the grid.
    const result = segmentIntersection(
      segment(vec2(length(0), feet(9)), vec2(feet(20), feet(9))),
      segment(vec2(feet(12), length(0)), vec2(feet(12), feet(20))),
    );
    expect(result.kind).toBe('point');
    if (result.kind !== 'point') throw new Error('unreachable');
    expect(result.exact).toBe(true);
    expect(result.point).toEqual(vec2(feet(12), feet(9)));
  });
});
