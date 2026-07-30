import {
  type Vec2,
  distanceToSegment,
  equalsVec2,
  feet,
  inches,
  isSimplePolygon,
  orientation,
  polygonArea,
  segmentLength,
  toSquareFeet,
  vec2,
} from '@basement/geometry';
import { describe, expect, it } from 'vitest';

import { joinedFootprint, resolveWallJoins } from './joins.js';
import type { Wall } from './schema.js';
import { createWall, wallFaces } from './walls.js';

const at = (xFeet: number, yFeet: number): Vec2 => vec2(feet(xFeet), feet(yFeet));

function wall(
  id: string,
  a: Vec2,
  b: Vec2,
  assembly: Wall['assembly'] = 'partition-2x4',
): Wall {
  return createWall({ id, start: a, end: b, assembly });
}

/** The four corners of a closed rectangle of walls, drawn head-to-tail. */
function rectangleWalls(assembly: Wall['assembly'] = 'foundation'): Wall[] {
  const corners = [at(0, 0), at(20, 0), at(20, 14), at(0, 14)];
  return corners.map((corner, i) =>
    wall(
      `W${String(i + 1)}`,
      corner,
      corners[(i + 1) % corners.length] ?? corner,
      assembly,
    ),
  );
}

describe('corner joins', () => {
  it('mitres an L so the two faces meet at one point', () => {
    // East then north. Untrimmed, these two rectangles overlap at the corner.
    const a = wall('A', at(0, 0), at(10, 0));
    const b = wall('B', at(10, 0), at(10, 8));
    const joins = resolveWallJoins([a, b]);

    const ja = joins.get('A');
    const jb = joins.get('B');
    expect(ja).toBeDefined();
    expect(jb).toBeDefined();
    if (ja === undefined || jb === undefined) throw new Error('unreachable');

    // A's far end and B's near end now share both corner points exactly — no gap to
    // close and no overlap to hide.
    expect(equalsVec2(ja.left.b, jb.left.a)).toBe(true);
    expect(equalsVec2(ja.right.b, jb.right.a)).toBe(true);
  });

  it('puts the inside corner inside and the outside corner outside', () => {
    const a = wall('A', at(0, 0), at(10, 0));
    const b = wall('B', at(10, 0), at(10, 8));
    const joins = resolveWallJoins([a, b]);
    const ja = joins.get('A');
    if (ja === undefined) throw new Error('unreachable');

    // A 4-1/2" partition running east, turning north. The inside of the turn is to the
    // north-west, so the inner corner pulls back 2-1/4" and the outer corner pushes out
    // 2-1/4" — 120" +/- 2.25" along x, 0" +/- 2.25" along y.
    expect(ja.left.b).toEqual(vec2(inches(117.75), inches(2.25)));
    expect(ja.right.b).toEqual(vec2(inches(122.25), inches(-2.25)));
  });

  it('leaves a straight run alone', () => {
    // Two collinear walls of equal thickness: the faces are parallel, so there is no
    // mitre to compute and the plain offsets are already correct.
    const a = wall('A', at(0, 0), at(10, 0));
    const b = wall('B', at(10, 0), at(20, 0));
    const joins = resolveWallJoins([a, b]);

    const ja = joins.get('A');
    const untrimmed = wallFaces(a);
    if (ja === undefined) throw new Error('unreachable');
    expect(ja.left).toEqual(untrimmed.left);
    expect(ja.right).toEqual(untrimmed.right);
  });

  it('closes a rectangle of four walls with no overlap and no gap', () => {
    const walls = rectangleWalls();
    const joins = resolveWallJoins(walls);
    expect(joins.size).toBe(4);

    for (let i = 0; i < walls.length; i += 1) {
      const current = walls[i];
      const next = walls[(i + 1) % walls.length];
      if (current === undefined || next === undefined) throw new Error('unreachable');
      const a = joins.get(current.id);
      const b = joins.get(next.id);
      if (a === undefined || b === undefined) throw new Error('unreachable');
      expect(equalsVec2(a.left.b, b.left.a)).toBe(true);
      expect(equalsVec2(a.right.b, b.right.a)).toBe(true);
    }
  });

  it('produces the exact area a mitred rectangle should have', () => {
    // Centrelines 20 x 14, walls 8" thick. A properly mitred ring of walls has area
    // equal to the centreline perimeter times the thickness — the corners contribute
    // exactly one thickness-squared each, no more and no less.
    const walls = rectangleWalls('foundation');
    const joins = resolveWallJoins(walls);

    let total = 0;
    for (const wallEntry of walls) {
      const join = joins.get(wallEntry.id);
      if (join === undefined) throw new Error('unreachable');
      total += toSquareFeet(polygonArea(join.footprint));
    }

    const perimeterFeet = 2 * (20 + 14);
    const thicknessFeet = 8 / 12;
    expect(total).toBeCloseTo(perimeterFeet * thicknessFeet, 4);
  });

  it('keeps every footprint a simple, counter-clockwise ring', () => {
    const joins = resolveWallJoins(rectangleWalls());
    for (const join of joins.values()) {
      expect(isSimplePolygon(join.footprint)).toBe(true);
      expect(orientation(join.footprint)).toBe('ccw');
    }
  });

  it('mitres walls of different thickness against each other', () => {
    const a = wall('A', at(0, 0), at(10, 0), 'foundation'); // 8"
    const b = wall('B', at(10, 0), at(10, 8), 'furring'); // 2"
    const joins = resolveWallJoins([a, b]);
    const ja = joins.get('A');
    const jb = joins.get('B');
    if (ja === undefined || jb === undefined) throw new Error('unreachable');
    expect(equalsVec2(ja.left.b, jb.left.a)).toBe(true);
    expect(equalsVec2(ja.right.b, jb.right.a)).toBe(true);
  });

  it('mitres an out-of-square corner, which is the normal case', () => {
    // 1-1/4" of fall across 26 feet. The mitre must follow the real geometry rather
    // than assume a right angle.
    const a = wall(
      'A',
      vec2(feet(0), feet(0)),
      vec2(feet(26), inches(1.25)),
      'foundation',
    );
    const b = wall(
      'B',
      vec2(feet(26), inches(1.25)),
      vec2(feet(26), feet(14)),
      'foundation',
    );
    const joins = resolveWallJoins([a, b]);
    const ja = joins.get('A');
    const jb = joins.get('B');
    if (ja === undefined || jb === undefined) throw new Error('unreachable');
    expect(equalsVec2(ja.left.b, jb.left.a)).toBe(true);
    expect(equalsVec2(ja.right.b, jb.right.a)).toBe(true);
    // And the wall is still its full thickness away from its own centreline.
    expect(segmentLength(ja.left)).toBeGreaterThan(0);
  });

  it('handles a T where three ends share a node', () => {
    const a = wall('A', at(10, 0), at(0, 0));
    const b = wall('B', at(10, 0), at(20, 0));
    const c = wall('C', at(10, 0), at(10, 8));
    const joins = resolveWallJoins([a, b, c]);
    expect(joins.size).toBe(3);
    for (const join of joins.values()) {
      expect(isSimplePolygon(join.footprint)).toBe(true);
    }
  });

  it('ignores a degenerate wall instead of dividing by its zero length', () => {
    const good = wall('A', at(0, 0), at(10, 0));
    const degenerate = { ...good, id: 'B', end: good.start };
    const joins = resolveWallJoins([good, degenerate]);
    expect(joins.has('A')).toBe(true);
    expect(joins.has('B')).toBe(false);
  });

  it('leaves a lone wall as a plain rectangle', () => {
    const lone = wall('A', at(0, 0), at(10, 0));
    const joins = resolveWallJoins([lone]);
    const join = joins.get('A');
    const plain = wallFaces(lone);
    if (join === undefined) throw new Error('unreachable');
    expect(join.left).toEqual(plain.left);
    expect(join.right).toEqual(plain.right);
  });
});

describe('butt joins', () => {
  it('trims a partition back to the face of the wall it dies into', () => {
    // An 8" foundation wall running east, with a partition running north into its
    // middle. The partition must stop at the foundation's north face, not at its
    // centreline, or the two footprints overlap by half the foundation thickness.
    const host = wall('H', at(0, 0), at(20, 0), 'foundation');
    const butting = wall('P', at(10, 0), at(10, 8));
    const joins = resolveWallJoins([host, butting]);

    const join = joins.get('P');
    if (join === undefined) throw new Error('unreachable');
    // 8" foundation: its north face is 4" above the centreline.
    expect(join.left.a.y).toBe(inches(4));
    expect(join.right.a.y).toBe(inches(4));
  });

  it('trims toward whichever side the wall arrives from', () => {
    const host = wall('H', at(0, 0), at(20, 0), 'foundation');
    const fromBelow = wall('P', at(10, 0), at(10, -8));
    const joins = resolveWallJoins([host, fromBelow]);
    const join = joins.get('P');
    if (join === undefined) throw new Error('unreachable');
    expect(join.left.a.y).toBe(inches(-4));
    expect(join.right.a.y).toBe(inches(-4));
  });

  it('trims the far end too', () => {
    const host = wall('H', at(0, 12), at(20, 12), 'foundation');
    const butting = wall('P', at(10, 0), at(10, 12));
    const joins = resolveWallJoins([host, butting]);
    const join = joins.get('P');
    if (join === undefined) throw new Error('unreachable');
    expect(join.left.b.y).toBe(feet(12) - inches(4));
    expect(join.right.b.y).toBe(feet(12) - inches(4));
  });

  it('does not butt-trim an end that is already a mitred corner', () => {
    // This end shares a node, so it was mitred; running the butt pass over it again
    // would pull the corner back off the mitre.
    const a = wall('A', at(0, 0), at(10, 0));
    const b = wall('B', at(10, 0), at(10, 8));
    const joins = resolveWallJoins([a, b]);
    const ja = joins.get('A');
    const jb = joins.get('B');
    if (ja === undefined || jb === undefined) throw new Error('unreachable');
    expect(equalsVec2(ja.left.b, jb.left.a)).toBe(true);
  });

  it('leaves an end that lands beyond the host alone', () => {
    const host = wall('H', at(0, 0), at(10, 0), 'foundation');
    const past = wall('P', at(18, 0), at(18, 8));
    const joins = resolveWallJoins([host, past]);
    const join = joins.get('P');
    const plain = wallFaces(past);
    if (join === undefined) throw new Error('unreachable');
    expect(join.left).toEqual(plain.left);
  });

  it('leaves an end that lands nowhere near a wall alone', () => {
    const host = wall('H', at(0, 0), at(20, 0), 'foundation');
    const floating = wall('P', at(10, 5), at(10, 9));
    const joins = resolveWallJoins([host, floating]);
    const join = joins.get('P');
    const plain = wallFaces(floating);
    if (join === undefined) throw new Error('unreachable');
    expect(join.left).toEqual(plain.left);
  });
});

describe('joinedFootprint', () => {
  it('returns the joined ring when there is one', () => {
    const a = wall('A', at(0, 0), at(10, 0));
    const b = wall('B', at(10, 0), at(10, 8));
    const joins = resolveWallJoins([a, b]);
    expect(joinedFootprint(joins, a)).toEqual(joins.get('A')?.footprint);
  });

  it('falls back to the plain rectangle for an unknown wall', () => {
    const lone = wall('A', at(0, 0), at(10, 0));
    const footprint = joinedFootprint(new Map(), lone);
    expect(footprint).toHaveLength(4);
    expect(orientation(footprint)).toBe('ccw');
  });
});

describe('the whole ring stays watertight', () => {
  it('leaves no wall face further than a rounding unit from its neighbour', () => {
    const walls = rectangleWalls();
    const joins = resolveWallJoins(walls);

    for (let i = 0; i < walls.length; i += 1) {
      const current = walls[i];
      const next = walls[(i + 1) % walls.length];
      if (current === undefined || next === undefined) throw new Error('unreachable');
      const a = joins.get(current.id);
      const b = joins.get(next.id);
      if (a === undefined || b === undefined) throw new Error('unreachable');
      // Each corner point of one wall lies on the neighbouring wall's footprint edge.
      expect(distanceToSegment(b.left, a.left.b)).toBeLessThanOrEqual(1);
      expect(distanceToSegment(b.right, a.right.b)).toBeLessThanOrEqual(1);
    }
  });
});
