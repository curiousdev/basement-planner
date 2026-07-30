import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { degreesToRadians } from './angle.js';
import { feet, inches, length } from './units.js';
import {
  ORIGIN,
  type Vec2,
  addVec2,
  angleOf,
  cross,
  direction,
  distance,
  distanceSquared,
  dot,
  equalsVec2,
  lerpVec2,
  magnitude,
  magnitudeSquared,
  manhattanDistance,
  midpoint,
  negateVec2,
  orient2d,
  perpendicularCcw,
  perpendicularCw,
  rotateVec2,
  rotateVec2About,
  scaleVec2,
  subVec2,
  vec2,
} from './vec2.js';

const anyPoint = fc
  .tuple(
    fc.integer({ min: -50_000, max: 50_000 }),
    fc.integer({ min: -50_000, max: 50_000 }),
  )
  .map(([x, y]): Vec2 => vec2(length(x), length(y)));

describe('vec2 arithmetic', () => {
  it('adds and subtracts as inverses', () => {
    fc.assert(
      fc.property(anyPoint, anyPoint, (a, b) => {
        expect(equalsVec2(subVec2(addVec2(a, b), b), a)).toBe(true);
      }),
    );
  });

  it('negates', () => {
    expect(negateVec2(vec2(inches(3), inches(-4)))).toEqual(vec2(inches(-3), inches(4)));
    expect(equalsVec2(addVec2(ORIGIN, ORIGIN), ORIGIN)).toBe(true);
  });

  it('scales with rounding', () => {
    expect(scaleVec2(vec2(inches(3), inches(4)), 2)).toEqual(vec2(inches(6), inches(8)));
    expect(scaleVec2(vec2(length(1), length(1)), 0.5)).toEqual(
      vec2(length(1), length(1)),
    );
  });
});

describe('exact predicates', () => {
  it('computes dot and cross exactly', () => {
    const a = vec2(inches(3), inches(0));
    const b = vec2(inches(0), inches(4));
    expect(dot(a, b)).toBe(0);
    expect(cross(a, b)).toBe(96 * 128);
    expect(cross(b, a)).toBe(-(96 * 128));
  });

  it('orients three points without floating point', () => {
    const a = vec2(length(0), length(0));
    const b = vec2(inches(10), length(0));
    expect(orient2d(a, b, vec2(inches(5), inches(1)))).toBeGreaterThan(0);
    expect(orient2d(a, b, vec2(inches(5), inches(-1)))).toBeLessThan(0);
    expect(orient2d(a, b, vec2(inches(5), length(0)))).toBe(0);
  });

  it('detects collinearity that a float kernel would miss', () => {
    // Points on a 1:3 slope, far apart. Exact integers make this unambiguous.
    const a = vec2(length(0), length(0));
    const b = vec2(length(30_000), length(10_000));
    const c = vec2(length(3), length(1));
    expect(orient2d(a, b, c)).toBe(0);
  });

  it('keeps squared magnitude and distance exact', () => {
    const a = vec2(inches(3), inches(4));
    expect(magnitudeSquared(a)).toBe(96 * 96 + 128 * 128);
    expect(magnitude(a)).toBeCloseTo(160, 10);
    expect(distanceSquared(ORIGIN, a)).toBe(magnitudeSquared(a));
    expect(distance(ORIGIN, a)).toBeCloseTo(160, 10);
  });

  it('measures manhattan distance exactly', () => {
    expect(manhattanDistance(ORIGIN, vec2(inches(3), inches(-4)))).toBe(inches(7));
  });
});

describe('perpendiculars and rotation', () => {
  it('rotates 90 degrees without rounding', () => {
    fc.assert(
      fc.property(anyPoint, (p) => {
        const ccw = perpendicularCcw(p);
        // Math.abs, not toBe(0): a vector like (-3, 0) makes both products negative
        // zero, and Object.is(-0, 0) is false even though the dot product is exact.
        expect(Math.abs(dot(p, ccw))).toBe(0);
        expect(magnitudeSquared(ccw)).toBe(magnitudeSquared(p));
        // Four quarter turns return exactly to the start.
        expect(
          equalsVec2(perpendicularCcw(perpendicularCcw(perpendicularCcw(ccw))), p),
        ).toBe(true);
        expect(equalsVec2(perpendicularCw(ccw), p)).toBe(true);
      }),
    );
  });

  it('rotates by an arbitrary angle, with rounding', () => {
    const p = vec2(feet(10), length(0));
    const turned = rotateVec2(p, degreesToRadians(90));
    expect(turned.x).toBe(0);
    expect(turned.y).toBe(feet(10));

    const about = rotateVec2About(
      vec2(feet(11), length(0)),
      vec2(feet(10), length(0)),
      Math.PI,
    );
    expect(about).toEqual(vec2(feet(9), length(0)));
  });

  it('reports direction and angle', () => {
    const east = direction(vec2(feet(5), length(0)));
    expect(east.x).toBeCloseTo(1, 12);
    expect(east.y).toBeCloseTo(0, 12);
    expect(direction(ORIGIN)).toEqual({ x: 0, y: 0 });
    expect(angleOf(vec2(length(0), feet(1)))).toBeCloseTo(Math.PI / 2, 12);
  });
});

describe('interpolation', () => {
  it('finds midpoints', () => {
    expect(midpoint(ORIGIN, vec2(inches(10), inches(6)))).toEqual(
      vec2(inches(5), inches(3)),
    );
  });

  it('lands on the endpoints at t = 0 and t = 1', () => {
    fc.assert(
      fc.property(anyPoint, anyPoint, (a, b) => {
        expect(equalsVec2(lerpVec2(a, b, 0), a)).toBe(true);
        expect(equalsVec2(lerpVec2(a, b, 1), b)).toBe(true);
      }),
    );
  });

  it('rounds a half-unit midpoint rather than drifting', () => {
    const mid = midpoint(ORIGIN, vec2(length(1), length(1)));
    expect(Number.isSafeInteger(mid.x)).toBe(true);
    expect(Number.isSafeInteger(mid.y)).toBe(true);
  });
});
