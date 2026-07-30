import {
  type Area,
  type Length,
  type Polygon,
  type Segment,
  type Vec2,
  addVec2,
  clampLength,
  divideLength,
  feet,
  inches,
  length,
  magnitude,
  multiplyLengths,
  negateLength,
  offsetSegment,
  segment,
  segmentVector,
  vec2,
  ZERO_LENGTH,
} from '@basement/geometry';

import { CoreError } from './errors.js';
import type { Opening, OpeningType, Wall } from './schema.js';
import { wallLength, wallVector } from './walls.js';

export interface OpeningDefault {
  readonly width: Length;
  readonly height: Length;
  readonly sillHeight: Length;
  readonly netClearWidth: Length | null;
  readonly netClearHeight: Length | null;
  readonly label: string;
}

/**
 * Catalogue defaults, in the sizes these things are actually ordered in.
 *
 * The egress entry is the important one: the unit is 36" x 48", but the net clear
 * opening of a casement with the sash fully open is smaller than the unit, and that
 * smaller number is what R310 measures. Storing both is the only way to keep the
 * distinction — deriving net clear from the unit size would bake in a lie.
 */
export const OPENING_DEFAULTS: Readonly<Record<OpeningType, OpeningDefault>> = {
  door: {
    width: inches(32),
    height: inches(80),
    sillHeight: ZERO_LENGTH,
    netClearWidth: null,
    netClearHeight: null,
    label: 'Door 2\'-8"',
  },
  window: {
    width: inches(36),
    height: inches(36),
    sillHeight: inches(44),
    netClearWidth: null,
    netClearHeight: null,
    label: 'Window 3\'-0"',
  },
  'egress-window': {
    width: inches(36),
    height: inches(48),
    sillHeight: inches(40),
    netClearWidth: inches(34),
    netClearHeight: inches(44),
    label: 'Egress casement',
  },
  'cased-opening': {
    width: inches(48),
    height: inches(84),
    sillHeight: ZERO_LENGTH,
    netClearWidth: null,
    netClearHeight: null,
    label: 'Cased opening',
  },
};

export interface CreateOpeningOptions {
  readonly id: string;
  readonly wallId: string;
  readonly position: Length;
  readonly openingType: OpeningType;
  readonly width?: Length;
  readonly height?: Length;
  readonly sillHeight?: Length;
  readonly swing?: Opening['swing'];
  readonly netClearWidth?: Length | null;
  readonly netClearHeight?: Length | null;
}

export function createOpening(options: CreateOpeningOptions): Opening {
  const defaults = OPENING_DEFAULTS[options.openingType];
  const width = options.width ?? defaults.width;
  const height = options.height ?? defaults.height;
  if (width <= 0 || height <= 0) {
    throw new CoreError(
      'core.opening-size',
      'Opening width and height must be positive.',
    );
  }
  return {
    id: options.id,
    kind: 'opening',
    wallId: options.wallId,
    position: options.position,
    width,
    height,
    sillHeight: options.sillHeight ?? defaults.sillHeight,
    openingType: options.openingType,
    swing: options.swing ?? (options.openingType === 'door' ? 'left' : 'none'),
    netClearWidth: options.netClearWidth ?? defaults.netClearWidth,
    netClearHeight: options.netClearHeight ?? defaults.netClearHeight,
  };
}

/**
 * The net clear opening area, or null when the opening does not carry one.
 *
 * Never fall back to width x height here. An escape opening without measured net clear
 * dimensions is unknown, not compliant.
 */
export function netClearArea(opening: Opening): Area | null {
  if (opening.netClearWidth === null || opening.netClearHeight === null) return null;
  return multiplyLengths(opening.netClearWidth, opening.netClearHeight);
}

/** Distance from the wall's start to the near jamb. */
export function openingStart(opening: Opening): Length {
  return length(opening.position - divideLength(opening.width, 2));
}

/** Distance from the wall's start to the far jamb. */
export function openingEnd(opening: Opening): Length {
  return length(opening.position + divideLength(opening.width, 2));
}

/** True when the opening fits between the ends of its host wall. */
export function openingFitsWall(opening: Opening, wall: Wall): boolean {
  return openingStart(opening) >= 0 && openingEnd(opening) <= wallLength(wall);
}

/** Clamp a proposed centre position so the opening stays within the wall. */
export function clampPosition(position: Length, width: Length, wall: Wall): Length {
  const half = divideLength(width, 2);
  const limit = length(wallLength(wall) - half);
  if (limit < half) return divideLength(wallLength(wall), 2);
  return clampLength(position, half, limit);
}

/** Convert a distance along the wall centreline into a world point. */
export function pointAlongWall(wall: Wall, along: Length): Vec2 {
  const v = wallVector(wall);
  const total = magnitude(v);
  if (total === 0) {
    throw new CoreError(
      'core.wall-degenerate',
      'A zero-length wall has no direction to measure along.',
    );
  }
  const t = along / total;
  return addVec2(
    wall.start,
    vec2(length(Math.round(v.x * t)), length(Math.round(v.y * t))),
  );
}

/** The opening's span, as a segment on the wall centreline. */
export function openingCenterline(opening: Opening, wall: Wall): Segment {
  return segment(
    pointAlongWall(wall, openingStart(opening)),
    pointAlongWall(wall, openingEnd(opening)),
  );
}

/** The rectangle the opening cuts through the wall, wound counter-clockwise. */
export function openingFootprint(opening: Opening, wall: Wall): Polygon {
  const centre = openingCenterline(opening, wall);
  const half = divideLength(wall.thickness, 2);
  const left = offsetSegment(centre, half);
  const right = offsetSegment(centre, negateLength(half));
  return [right.a, right.b, left.b, left.a];
}

/** Unit direction of the host wall, for drawing swings and sill lines. */
export function openingDirection(wall: Wall): { readonly x: number; readonly y: number } {
  const v = segmentVector(segment(wall.start, wall.end));
  const m = magnitude(v);
  if (m === 0) return { x: 0, y: 0 };
  return { x: v.x / m, y: v.y / m };
}

/** Head height above the finished floor. */
export function openingHeadHeight(opening: Opening): Length {
  return length(opening.sillHeight + opening.height);
}

export const OPENING_LABEL: Readonly<Record<OpeningType, string>> = {
  door: 'Door',
  window: 'Window',
  'egress-window': 'Egress window',
  'cased-opening': 'Cased opening',
};

/** A sensible default position: the middle of the wall. */
export function defaultPosition(wall: Wall): Length {
  return divideLength(wallLength(wall), 2);
}

/** Widest opening that will fit in a wall, leaving nothing for jambs. */
export function maximumWidth(wall: Wall): Length {
  return wallLength(wall) > 0 ? wallLength(wall) : feet(0);
}
