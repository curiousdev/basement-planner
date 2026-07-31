import {
  type Polygon,
  type Segment,
  type Vec2,
  addVec2,
  angleOf,
  distanceToSegment,
  divideLength,
  equalsVec2,
  line,
  lineIntersection,
  negateLength,
  offsetSegment,
  parameterOnLine,
  segment,
  sideOfLine,
  subVec2,
} from '@basement/geometry';

import type { Wall } from './schema.js';
import { isDegenerateWall, wallCenterline, wallFaces, wallVector } from './walls.js';

/**
 * Wall joins.
 *
 * A wall's footprint on its own is a plain rectangle, and where two of them meet the
 * rectangles overlap and their outlines cross. That reads as a drafting error on a plan
 * — the corner of a foundation is a single mitred corner, not two rectangles piled on
 * each other — so the faces have to be trimmed against each other before they are drawn.
 *
 * Two cases are resolved here:
 *
 * 1. **Corner joins**, where wall ends share a node. The face lines are intersected
 *    pairwise in angular order, which mitres an L, a T, and an X alike.
 * 2. **Butt joins**, where a wall ends part-way along another wall rather than at its
 *    end. The butting wall is trimmed back to the face of the wall it lands on.
 *
 * Joins are derived, never stored. The model keeps centrelines and thicknesses; this is
 * a pure function of them, so moving a wall re-mitres its neighbours for free.
 */

export interface WallJoin {
  readonly wallId: string;
  readonly left: Segment;
  readonly right: Segment;
  readonly footprint: Polygon;
}

type EndName = 'start' | 'end';

interface WallEnd {
  readonly wallId: string;
  readonly end: EndName;
  /** Direction pointing away from the node, along the wall. */
  readonly away: Vec2;
  readonly angle: number;
}

interface MutableFaces {
  left: { a: Vec2; b: Vec2 };
  right: { a: Vec2; b: Vec2 };
}

function nodeKey(p: Vec2): string {
  return `${String(p.x)},${String(p.y)}`;
}

function endPoint(wall: Wall, end: EndName): Vec2 {
  return end === 'start' ? wall.start : wall.end;
}

/**
 * The face lying on the +perpendicular side of the away-direction.
 *
 * At a wall's start the away-direction is the wall's own direction, so the plus side is
 * the left face. At its end the away-direction is reversed, which flips handedness, and
 * the plus side becomes the right face.
 */
function plusFace(end: EndName): 'left' | 'right' {
  return end === 'start' ? 'left' : 'right';
}

function minusFace(end: EndName): 'left' | 'right' {
  return end === 'start' ? 'right' : 'left';
}

function setFaceEnd(
  faces: MutableFaces,
  side: 'left' | 'right',
  end: EndName,
  point: Vec2,
): void {
  if (end === 'start') faces[side].a = point;
  else faces[side].b = point;
}

function faceLine(faces: MutableFaces, side: 'left' | 'right', wall: Wall) {
  return line(faces[side].a, wallVector(wall));
}

/**
 * Resolve every join among `walls`, returning the trimmed faces and footprint for each.
 *
 * Walls whose ends touch nothing keep their plain rectangular footprint.
 */
export function resolveWallJoins(walls: readonly Wall[]): ReadonlyMap<string, WallJoin> {
  const usable = walls.filter((wall) => !isDegenerateWall(wall));
  const byId = new Map(usable.map((wall) => [wall.id, wall]));

  // Start from the untrimmed faces and move the endpoints as joins are resolved.
  const faces = new Map<string, MutableFaces>();
  for (const wall of usable) {
    const { left, right } = wallFaces(wall);
    faces.set(wall.id, {
      left: { a: left.a, b: left.b },
      right: { a: right.a, b: right.b },
    });
  }

  resolveCorners(usable, byId, faces);
  resolveButts(usable, byId, faces);

  const result = new Map<string, WallJoin>();
  for (const wall of usable) {
    const f = faces.get(wall.id);
    if (f === undefined) continue;
    const left = segment(f.left.a, f.left.b);
    const right = segment(f.right.a, f.right.b);
    result.set(wall.id, {
      wallId: wall.id,
      left,
      right,
      footprint: [right.a, right.b, left.b, left.a],
    });
  }
  return result;
}

/** Miter every node where two or more wall ends coincide. */
function resolveCorners(
  walls: readonly Wall[],
  byId: ReadonlyMap<string, Wall>,
  faces: Map<string, MutableFaces>,
): void {
  const nodes = new Map<string, WallEnd[]>();

  for (const wall of walls) {
    const direction = wallVector(wall);
    for (const end of ['start', 'end'] as const) {
      const away = end === 'start' ? direction : subVec2(wall.start, wall.end);
      const key = nodeKey(endPoint(wall, end));
      const list = nodes.get(key) ?? [];
      list.push({ wallId: wall.id, end, away, angle: angleOf(away) });
      nodes.set(key, list);
    }
  }

  for (const ends of nodes.values()) {
    if (ends.length < 2) continue;

    // Angular order around the node. Consecutive pairs bound one wedge each, and the
    // wedge between them is closed by one face from each wall.
    const ordered = [...ends].sort((a, b) => a.angle - b.angle);

    for (let i = 0; i < ordered.length; i += 1) {
      const current = ordered[i];
      const next = ordered[(i + 1) % ordered.length];
      if (current === undefined || next === undefined) continue;

      const currentWall = byId.get(current.wallId);
      const nextWall = byId.get(next.wallId);
      const currentFaces = faces.get(current.wallId);
      const nextFaces = faces.get(next.wallId);
      if (
        currentWall === undefined ||
        nextWall === undefined ||
        currentFaces === undefined ||
        nextFaces === undefined
      ) {
        continue;
      }

      const currentSide = plusFace(current.end);
      const nextSide = minusFace(next.end);

      const corner = lineIntersection(
        faceLine(currentFaces, currentSide, currentWall),
        faceLine(nextFaces, nextSide, nextWall),
      );
      // Parallel faces mean a straight run or a doubled-back wall; leaving the plain
      // offset endpoints in place is the right answer for both.
      if (corner === null) continue;

      setFaceEnd(currentFaces, currentSide, current.end, corner);
      setFaceEnd(nextFaces, nextSide, next.end, corner);
    }
  }
}

/**
 * Trim a wall that dies part-way along another wall back to that wall's near face.
 *
 * Only ends that are not already part of a corner node are considered — a shared node
 * has been mitred already and must not be trimmed a second time.
 */
function resolveButts(
  walls: readonly Wall[],
  byId: ReadonlyMap<string, Wall>,
  faces: Map<string, MutableFaces>,
): void {
  const nodeCounts = new Map<string, number>();
  for (const wall of walls) {
    for (const end of ['start', 'end'] as const) {
      const key = nodeKey(endPoint(wall, end));
      nodeCounts.set(key, (nodeCounts.get(key) ?? 0) + 1);
    }
  }

  for (const wall of walls) {
    const wallFacesEntry = faces.get(wall.id);
    if (wallFacesEntry === undefined) continue;

    for (const end of ['start', 'end'] as const) {
      const point = endPoint(wall, end);
      if ((nodeCounts.get(nodeKey(point)) ?? 0) > 1) continue;

      const host = findHostWall(wall, point, walls, byId);
      if (host === null) continue;

      const hostCentre = line(host.start, wallVector(host));
      const half = divideLength(host.thickness, 2);

      // Which side of the host does this wall arrive from? Look a little way back along
      // the butting wall, so a point sitting exactly on the host centreline still
      // resolves to the side the wall actually comes from.
      const back =
        end === 'start' ? subVec2(wall.end, wall.start) : subVec2(wall.start, wall.end);
      const side = sideOfLine(hostCentre, addVec2(point, back));
      if (side === 0) continue;

      const hostFace = offsetSegment(
        wallCenterline(host),
        side > 0 ? half : negateLength(half),
      );
      const hostFaceLine = line(hostFace.a, wallVector(host));

      for (const faceSide of ['left', 'right'] as const) {
        const trimmed = lineIntersection(
          faceLine(wallFacesEntry, faceSide, wall),
          hostFaceLine,
        );
        if (trimmed !== null) setFaceEnd(wallFacesEntry, faceSide, end, trimmed);
      }
    }
  }
}

/** The wall whose body this endpoint lands in, if any. */
function findHostWall(
  wall: Wall,
  point: Vec2,
  walls: readonly Wall[],
  byId: ReadonlyMap<string, Wall>,
): Wall | null {
  let best: Wall | null = null;
  let bestDistance = Infinity;

  for (const candidate of walls) {
    if (candidate.id === wall.id) continue;
    if (byId.get(candidate.id) === undefined) continue;

    const centre = wallCenterline(candidate);
    const distance = distanceToSegment(centre, point);
    // Must land within the host's own thickness to count as butting into it.
    if (distance > candidate.thickness / 2) continue;

    // And it must land along the host's run, not off either end.
    const t = parameterOnLine(line(candidate.start, wallVector(candidate)), point);
    if (t <= 0 || t >= 1) continue;

    // A wall running parallel to its host has no meaningful butt join.
    if (equalsVec2(point, candidate.start) || equalsVec2(point, candidate.end)) {
      continue;
    }

    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
}

/** Convenience: the joined footprint for one wall, falling back to the plain rectangle. */
export function joinedFootprint(
  joins: ReadonlyMap<string, WallJoin>,
  wall: Wall,
): Polygon {
  const join = joins.get(wall.id);
  if (join !== undefined) return join.footprint;
  const { left, right } = wallFaces(wall);
  return [right.a, right.b, left.b, left.a];
}
