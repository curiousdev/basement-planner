import {
  feet,
  formatFeetInches,
  inches,
  polygonArea,
  orientation,
  segmentLength,
  toSquareFeet,
  vec2,
} from '@basement/geometry';
import { describe, expect, it } from 'vitest';

import { CoreError } from './errors.js';
import {
  ASSEMBLY_LABEL,
  ASSEMBLY_THICKNESS,
  createWall,
  endPointForLength,
  isDegenerateWall,
  translateWall,
  wallAngle,
  wallCenterline,
  wallFaces,
  wallFootprint,
  wallLength,
  wallMidpoint,
  wallVector,
} from './walls.js';

const eastWall = createWall({
  id: 'w1',
  start: vec2(feet(0), feet(0)),
  end: vec2(feet(12), feet(0)),
  assembly: 'partition-2x4',
});

describe('assemblies', () => {
  it('uses the thickness the assembly actually builds out to', () => {
    // 3-1/2" of stud plus 1/2" of gypsum a side.
    expect(ASSEMBLY_THICKNESS['partition-2x4']).toBe(inches(4.5));
    expect(ASSEMBLY_THICKNESS['partition-2x6']).toBe(inches(6.5));
    expect(ASSEMBLY_THICKNESS.foundation).toBe(inches(8));
    expect(ASSEMBLY_THICKNESS.furring).toBe(inches(2));
  });

  it('labels every assembly', () => {
    for (const key of Object.keys(ASSEMBLY_THICKNESS)) {
      expect(ASSEMBLY_LABEL[key as keyof typeof ASSEMBLY_LABEL]).toBeTruthy();
    }
  });

  it('defaults thickness from the assembly but lets it be overridden', () => {
    expect(
      createWall({ id: 'a', start: vec2(feet(0), feet(0)), end: vec2(feet(1), feet(0)) })
        .thickness,
    ).toBe(inches(4.5));
    const custom = createWall({
      id: 'b',
      start: vec2(feet(0), feet(0)),
      end: vec2(feet(1), feet(0)),
      thickness: inches(11.625),
    });
    expect(custom.thickness).toBe(inches(11.625));
  });

  it('refuses a non-positive thickness', () => {
    expect(() =>
      createWall({
        id: 'c',
        start: vec2(feet(0), feet(0)),
        end: vec2(feet(1), feet(0)),
        thickness: inches(0),
      }),
    ).toThrow(CoreError);
  });
});

describe('centreline and derived geometry', () => {
  it('measures length along the centreline', () => {
    expect(wallLength(eastWall)).toBe(feet(12));
    expect(formatFeetInches(wallLength(eastWall))).toBe(`12'-0"`);
  });

  it('reports midpoint, angle, and vector', () => {
    expect(wallMidpoint(eastWall)).toEqual(vec2(feet(6), feet(0)));
    expect(wallAngle(eastWall)).toBe(0);
    expect(wallVector(eastWall)).toEqual(vec2(feet(12), feet(0)));
    expect(segmentLength(wallCenterline(eastWall))).toBe(feet(12));
  });

  it('derives faces by offsetting the centreline half the thickness each way', () => {
    const { left, right } = wallFaces(eastWall);
    expect(left.a.y).toBe(inches(2.25));
    expect(right.a.y).toBe(inches(-2.25));
    expect(left.a.y - right.a.y).toBe(inches(4.5));
  });

  it('keeps both faces the same length as the centreline', () => {
    const diagonal = createWall({
      id: 'd',
      start: vec2(feet(0), feet(0)),
      end: vec2(feet(9), feet(7)),
    });
    const { left, right } = wallFaces(diagonal);
    expect(segmentLength(left)).toBe(segmentLength(wallCenterline(diagonal)));
    expect(segmentLength(right)).toBe(segmentLength(wallCenterline(diagonal)));
  });

  it('builds a footprint wound counter-clockwise, with the expected area', () => {
    const footprint = wallFootprint(eastWall);
    expect(footprint).toHaveLength(4);
    expect(orientation(footprint)).toBe('ccw');
    // 12'-0" x 4-1/2" = 4.5 sq ft.
    expect(toSquareFeet(polygonArea(footprint))).toBeCloseTo(4.5, 6);
  });

  it('spots a degenerate wall', () => {
    const point = { ...eastWall, end: eastWall.start };
    expect(isDegenerateWall(point)).toBe(true);
    expect(isDegenerateWall(eastWall)).toBe(false);
  });

  it('translates both endpoints together, so openings would travel with it', () => {
    const moved = translateWall(eastWall, vec2(feet(3), feet(2)));
    expect(moved.start).toEqual(vec2(feet(3), feet(2)));
    expect(moved.end).toEqual(vec2(feet(15), feet(2)));
    expect(wallLength(moved)).toBe(wallLength(eastWall));
  });
});

describe('endPointForLength', () => {
  it('extends and shortens along the existing direction', () => {
    expect(endPointForLength(eastWall, feet(10))).toEqual(vec2(feet(10), feet(0)));
    expect(endPointForLength(eastWall, feet(20))).toEqual(vec2(feet(20), feet(0)));
  });

  it('holds the start point fixed', () => {
    const wall = createWall({
      id: 'e',
      start: vec2(feet(4), feet(4)),
      end: vec2(feet(4), feet(14)),
    });
    expect(endPointForLength(wall, feet(6))).toEqual(vec2(feet(4), feet(10)));
  });

  it('rejects a non-positive target and a degenerate wall', () => {
    expect(() => endPointForLength(eastWall, feet(0))).toThrow(CoreError);
    expect(() =>
      endPointForLength({ ...eastWall, end: eastWall.start }, feet(5)),
    ).toThrow(CoreError);
  });
});
