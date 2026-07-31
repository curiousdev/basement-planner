import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  HALF_PI,
  TAU,
  angleBetween,
  angleDifference,
  degreesToRadians,
  isParallel,
  isPerpendicular,
  normalizeAngle,
  normalizeAngleSigned,
  radiansToDegrees,
  snapAngle,
} from './angle.js';

const anyAngle = fc.double({ min: -100, max: 100, noNaN: true });

describe('conversion', () => {
  it('round-trips degrees and radians', () => {
    expect(degreesToRadians(180)).toBeCloseTo(Math.PI, 12);
    expect(radiansToDegrees(Math.PI)).toBeCloseTo(180, 12);
    fc.assert(
      fc.property(fc.double({ min: -720, max: 720, noNaN: true }), (degrees) => {
        expect(radiansToDegrees(degreesToRadians(degrees))).toBeCloseTo(degrees, 9);
      }),
    );
  });
});

describe('normalisation', () => {
  it('wraps into [0, 2π)', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(TAU)).toBe(0);
    expect(normalizeAngle(-HALF_PI)).toBeCloseTo(1.5 * Math.PI, 12);
    fc.assert(
      fc.property(anyAngle, (a) => {
        const wrapped = normalizeAngle(a);
        expect(wrapped).toBeGreaterThanOrEqual(0);
        expect(wrapped).toBeLessThan(TAU);
      }),
    );
  });

  it('wraps into (-π, π]', () => {
    expect(normalizeAngleSigned(Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(normalizeAngleSigned(1.5 * Math.PI)).toBeCloseTo(-HALF_PI, 12);
    fc.assert(
      fc.property(anyAngle, (a) => {
        const wrapped = normalizeAngleSigned(a);
        expect(wrapped).toBeGreaterThan(-Math.PI - 1e-9);
        expect(wrapped).toBeLessThanOrEqual(Math.PI + 1e-9);
      }),
    );
  });
});

describe('comparison', () => {
  it('takes the short way round', () => {
    expect(angleDifference(0.1, TAU - 0.1)).toBeCloseTo(-0.2, 12);
    expect(angleBetween(0.1, TAU - 0.1)).toBeCloseTo(0.2, 12);
    fc.assert(
      fc.property(anyAngle, anyAngle, (a, b) => {
        expect(angleBetween(a, b)).toBeLessThanOrEqual(Math.PI + 1e-9);
      }),
    );
  });

  it('treats antiparallel walls as parallel', () => {
    expect(isParallel(0, Math.PI)).toBe(true);
    expect(isParallel(0, TAU)).toBe(true);
    expect(isParallel(0, HALF_PI)).toBe(false);
  });

  it('detects square corners', () => {
    expect(isPerpendicular(0, HALF_PI)).toBe(true);
    expect(isPerpendicular(0, -HALF_PI)).toBe(true);
    expect(isPerpendicular(0, Math.PI)).toBe(false);
    // 1/4" over 10 feet is not square, but it is within a loose tolerance.
    const skew = Math.atan2(0.25, 120);
    expect(isPerpendicular(0, HALF_PI + skew)).toBe(false);
    expect(isPerpendicular(0, HALF_PI + skew, 0.01)).toBe(true);
  });
});

describe('snapping', () => {
  it('snaps to the ortho and 45 degree constraints', () => {
    expect(snapAngle(degreesToRadians(44), degreesToRadians(45))).toBeCloseTo(
      degreesToRadians(45),
      12,
    );
    expect(snapAngle(degreesToRadians(4), degreesToRadians(90))).toBe(0);
    expect(snapAngle(1.234, 0)).toBe(1.234);
  });
});
