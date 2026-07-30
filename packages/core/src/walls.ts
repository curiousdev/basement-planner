import {
  type Length,
  type Polygon,
  type Segment,
  type Vec2,
  divideLength,
  inches,
  negateLength,
  offsetSegment,
  segment,
  segmentAngle,
  segmentLengthRounded,
  lerpVec2,
  addVec2,
  subVec2,
  vec2,
  length,
  magnitude,
  segmentVector,
} from '@basement/geometry';

import { CoreError } from './errors.js';
import type { Wall, WallAssembly } from './schema.js';

/** Finished thickness of each assembly, as it actually builds out. */
export const ASSEMBLY_THICKNESS: Readonly<Record<WallAssembly, Length>> = {
  foundation: inches(8),
  'partition-2x4': inches(4.5),
  'partition-2x6': inches(6.5),
  furring: inches(2),
};

export const ASSEMBLY_LABEL: Readonly<Record<WallAssembly, string>> = {
  foundation: '8" foundation',
  'partition-2x4': '2x4 partition',
  'partition-2x6': '2x6 partition',
  furring: 'Furred wall',
};

export interface CreateWallOptions {
  readonly id: string;
  readonly start: Vec2;
  readonly end: Vec2;
  readonly assembly?: WallAssembly;
  readonly thickness?: Length;
  readonly existing?: boolean;
}

export function createWall(options: CreateWallOptions): Wall {
  const assembly = options.assembly ?? 'partition-2x4';
  const thickness = options.thickness ?? ASSEMBLY_THICKNESS[assembly];
  if (thickness <= 0) {
    throw new CoreError('core.wall-thickness', 'Wall thickness must be positive.');
  }
  return {
    id: options.id,
    kind: 'wall',
    start: options.start,
    end: options.end,
    thickness,
    assembly,
    existing: options.existing ?? false,
  };
}

/** The wall's centreline. Everything else about its geometry derives from this. */
export function wallCenterline(wall: Wall): Segment {
  return segment(wall.start, wall.end);
}

/** Centreline length, rounded to the nearest 1/32". */
export function wallLength(wall: Wall): Length {
  return segmentLengthRounded(wallCenterline(wall));
}

export function wallAngle(wall: Wall): number {
  return segmentAngle(wallCenterline(wall));
}

export function isDegenerateWall(wall: Wall): boolean {
  return wall.start.x === wall.end.x && wall.start.y === wall.end.y;
}

/**
 * The two faces, derived by offsetting the centreline half the thickness each way.
 * `left` is to the left of the direction start → end in a y-up world.
 */
export function wallFaces(wall: Wall): {
  readonly left: Segment;
  readonly right: Segment;
} {
  const half = divideLength(wall.thickness, 2);
  const centre = wallCenterline(wall);
  return {
    left: offsetSegment(centre, half),
    right: offsetSegment(centre, negateLength(half)),
  };
}

/**
 * The wall's footprint as a closed ring, wound counter-clockwise. Untrimmed — where two
 * walls meet, their footprints overlap until a join is resolved. Joins are a later
 * concern; nothing here pretends to have solved them.
 */
export function wallFootprint(wall: Wall): Polygon {
  const { left, right } = wallFaces(wall);
  return [right.a, right.b, left.b, left.a];
}

/** Midpoint of the centreline — where a wall tag or dimension string hangs. */
export function wallMidpoint(wall: Wall): Vec2 {
  return lerpVec2(wall.start, wall.end, 0.5);
}

/**
 * Move the wall's end so the centreline measures `target`, keeping `start` and the
 * direction fixed. Returns the new end point.
 *
 * Rounding is unavoidable here — a length of 10'-0" along a non-axis-aligned direction
 * generally has no exact endpoint on the 1/32" grid — so the caller should re-read
 * `wallLength` rather than assume it got exactly what it asked for.
 */
export function endPointForLength(wall: Wall, target: Length): Vec2 {
  if (target <= 0) {
    throw new CoreError('core.wall-length', 'Wall length must be positive.');
  }
  if (isDegenerateWall(wall)) {
    throw new CoreError(
      'core.wall-degenerate',
      'A zero-length wall has no direction to extend along.',
    );
  }
  const v = segmentVector(wallCenterline(wall));
  const current = magnitude(v);
  const scale = target / current;
  return addVec2(
    wall.start,
    vec2(length(Math.round(v.x * scale)), length(Math.round(v.y * scale))),
  );
}

/** Translate a wall by a delta, carrying both endpoints. */
export function translateWall(wall: Wall, delta: Vec2): Wall {
  return { ...wall, start: addVec2(wall.start, delta), end: addVec2(wall.end, delta) };
}

/** Vector from start to end. Exposed because callers snap along it. */
export function wallVector(wall: Wall): Vec2 {
  return subVec2(wall.end, wall.start);
}
