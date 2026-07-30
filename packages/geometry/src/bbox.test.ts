import { describe, expect, it } from 'vitest';

import {
  bbox,
  bboxArea,
  bboxCenter,
  bboxContainsBbox,
  bboxContainsPoint,
  bboxCorners,
  bboxHeight,
  bboxIntersection,
  bboxIntersects,
  bboxOf,
  bboxUnion,
  bboxWidth,
  expandBbox,
  isDegenerateBbox,
  translateBbox,
} from './bbox.js';
import { GeometryError } from './errors.js';
import { feet, inches, length, toSquareFeet } from './units.js';
import { type Vec2, vec2 } from './vec2.js';

const at = (xFeet: number, yFeet: number): Vec2 => vec2(feet(xFeet), feet(yFeet));

describe('construction', () => {
  it('rejects an inverted box', () => {
    expect(() => bbox(at(5, 0), at(0, 5))).toThrow(GeometryError);
    expect(() => bbox(at(0, 5), at(5, 0))).toThrow(GeometryError);
  });

  it('bounds a point set', () => {
    expect(bboxOf([at(3, 4), at(-1, 9), at(5, 0)])).toEqual({
      min: at(-1, 0),
      max: at(5, 9),
    });
    expect(bboxOf([at(2, 2)])).toEqual({ min: at(2, 2), max: at(2, 2) });
    expect(bboxOf([])).toBeNull();
  });
});

describe('measurement', () => {
  const box = bbox(at(0, 0), at(12, 10));

  it('measures width, height, and area', () => {
    expect(bboxWidth(box)).toBe(feet(12));
    expect(bboxHeight(box)).toBe(feet(10));
    expect(toSquareFeet(bboxArea(box))).toBe(120);
  });

  it('centres, including on a half unit', () => {
    expect(bboxCenter(box)).toEqual(at(6, 5));
    const odd = bbox(vec2(length(0), length(0)), vec2(length(1), length(1)));
    expect(Number.isSafeInteger(bboxCenter(odd).x)).toBe(true);
  });

  it('lists corners counter-clockwise', () => {
    expect(bboxCorners(box)).toEqual([at(0, 0), at(12, 0), at(12, 10), at(0, 10)]);
  });

  it('spots a degenerate box', () => {
    expect(isDegenerateBbox(bbox(at(0, 0), at(0, 10)))).toBe(true);
    expect(isDegenerateBbox(box)).toBe(false);
  });
});

describe('relationships', () => {
  const box = bbox(at(0, 0), at(12, 10));

  it('contains points, boundary included', () => {
    expect(bboxContainsPoint(box, at(6, 5))).toBe(true);
    expect(bboxContainsPoint(box, at(0, 0))).toBe(true);
    expect(bboxContainsPoint(box, at(12, 10))).toBe(true);
    expect(bboxContainsPoint(box, at(13, 5))).toBe(false);
  });

  it('contains boxes', () => {
    expect(bboxContainsBbox(box, bbox(at(1, 1), at(2, 2)))).toBe(true);
    expect(bboxContainsBbox(box, bbox(at(1, 1), at(20, 2)))).toBe(false);
  });

  it('treats edge contact as intersection', () => {
    expect(bboxIntersects(box, bbox(at(12, 0), at(20, 10)))).toBe(true);
    expect(bboxIntersects(box, bbox(at(13, 0), at(20, 10)))).toBe(false);
  });

  it('unions and intersects', () => {
    expect(bboxUnion(box, bbox(at(-5, 2), at(3, 20)))).toEqual({
      min: at(-5, 0),
      max: at(12, 20),
    });
    expect(bboxIntersection(box, bbox(at(6, 5), at(20, 20)))).toEqual({
      min: at(6, 5),
      max: at(12, 10),
    });
    expect(bboxIntersection(box, bbox(at(20, 20), at(30, 30)))).toBeNull();
  });
});

describe('transformation', () => {
  const box = bbox(at(0, 0), at(12, 10));

  it('expands and shrinks', () => {
    expect(expandBbox(box, inches(6))).toEqual({
      min: vec2(inches(-6), inches(-6)),
      max: vec2(feet(12.5), feet(10.5)),
    });
    expect(expandBbox(box, feet(-1))).toEqual({ min: at(1, 1), max: at(11, 9) });
    expect(() => expandBbox(box, feet(-10))).toThrow(GeometryError);
  });

  it('translates', () => {
    expect(translateBbox(box, at(1, 2))).toEqual({ min: at(1, 2), max: at(13, 12) });
  });
});
