import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { GeometryError } from './errors.js';
import { offsetSegment, offsetVector } from './offset.js';
import {
  distanceToSegment,
  segment,
  segmentLength,
  segmentLengthSquared,
} from './segment.js';
import { feet, inches, length, negateLength } from './units.js';
import { type Vec2, equalsVec2, vec2 } from './vec2.js';

const at = (x: number, y: number): Vec2 => vec2(inches(x), inches(y));

const anySegment = fc
  .tuple(
    fc.integer({ min: -20_000, max: 20_000 }),
    fc.integer({ min: -20_000, max: 20_000 }),
    fc.integer({ min: -20_000, max: 20_000 }),
    fc.integer({ min: -20_000, max: 20_000 }),
  )
  .filter(([ax, ay, bx, by]) => ax !== bx || ay !== by)
  .map(([ax, ay, bx, by]) =>
    segment(vec2(length(ax), length(ay)), vec2(length(bx), length(by))),
  );

describe('offsetSegment', () => {
  it('offsets to the left of the direction of travel', () => {
    // Running east, the left side is north.
    const offset = offsetSegment(segment(at(0, 0), at(10, 0)), inches(2));
    expect(offset.a).toEqual(at(0, 2));
    expect(offset.b).toEqual(at(10, 2));
  });

  it('offsets right for a negative distance', () => {
    const offset = offsetSegment(segment(at(0, 0), at(10, 0)), inches(-2));
    expect(offset.a).toEqual(at(0, -2));
    expect(offset.b).toEqual(at(10, -2));
  });

  it('follows the direction of travel, not the axis', () => {
    // Running west, the left side is south.
    const offset = offsetSegment(segment(at(10, 0), at(0, 0)), inches(2));
    expect(offset.a).toEqual(at(10, -2));
    expect(offset.b).toEqual(at(0, -2));
  });

  it('rejects a zero-length segment, which has no direction', () => {
    expect(() => offsetSegment(segment(at(1, 1), at(1, 1)), inches(2))).toThrow(
      GeometryError,
    );
    expect(() => offsetVector(segment(at(1, 1), at(1, 1)), inches(2))).toThrow(
      GeometryError,
    );
  });

  it('preserves length exactly, however odd the angle', () => {
    fc.assert(
      fc.property(anySegment, fc.integer({ min: -2000, max: 2000 }), (s, d) => {
        const offset = offsetSegment(s, length(d));
        expect(segmentLengthSquared(offset)).toBe(segmentLengthSquared(s));
      }),
    );
  });

  it('stays parallel — the same displacement is applied to both ends', () => {
    fc.assert(
      fc.property(anySegment, fc.integer({ min: -2000, max: 2000 }), (s, d) => {
        const offset = offsetSegment(s, length(d));
        expect(offset.a.x - s.a.x).toBe(offset.b.x - s.b.x);
        expect(offset.a.y - s.a.y).toBe(offset.b.y - s.b.y);
      }),
    );
  });

  it('round-trips back to the original', () => {
    fc.assert(
      fc.property(anySegment, fc.integer({ min: -2000, max: 2000 }), (s, d) => {
        const there = offsetSegment(s, length(d));
        const back = offsetSegment(there, negateLength(length(d)));
        expect(equalsVec2(back.a, s.a)).toBe(true);
        expect(equalsVec2(back.b, s.b)).toBe(true);
      }),
    );
  });

  it('lands within half a unit of the requested distance', () => {
    fc.assert(
      fc.property(anySegment, fc.integer({ min: 1, max: 2000 }), (s, d) => {
        const offset = offsetSegment(s, length(d));
        // Rounding the displacement can cost at most half a unit on each axis.
        expect(Math.abs(distanceToSegment(s, offset.a) - d)).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('offsets a 3-1/2" stud wall to its two faces', () => {
    const centreline = segment(vec2(length(0), length(0)), vec2(feet(12), length(0)));
    const half = inches(1.75);
    const left = offsetSegment(centreline, half);
    const right = offsetSegment(centreline, negateLength(half));
    expect(left.a.y).toBe(inches(1.75));
    expect(right.a.y).toBe(inches(-1.75));
    expect(left.a.y - right.a.y).toBe(inches(3.5));
    expect(segmentLength(left)).toBe(segmentLength(centreline));
  });
});
