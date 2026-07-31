import {
  feet,
  inches,
  multiplyLengths,
  orientation,
  polygonArea,
  toSquareFeet,
  vec2,
} from '@basement/geometry';
import { describe, expect, it } from 'vitest';

import {
  type Command,
  applyCommand,
  applyCommands,
  removeWallCommands,
  slideOpeningCommand,
} from './commands.js';
import { CoreError } from './errors.js';
import { createModel, getOpening, listOpenings, openingsOnWall } from './model.js';
import {
  OPENING_DEFAULTS,
  clampPosition,
  createOpening,
  defaultPosition,
  netClearArea,
  openingCenterline,
  openingEnd,
  openingFitsWall,
  openingFootprint,
  openingHeadHeight,
  openingStart,
  pointAlongWall,
} from './openings.js';
import type { BasementModel } from './schema.js';
import { createWall } from './walls.js';

const hostWall = createWall({
  id: 'W1',
  start: vec2(feet(0), feet(0)),
  end: vec2(feet(20), feet(0)),
  assembly: 'partition-2x4',
});

const door = createOpening({
  id: 'D1',
  wallId: 'W1',
  position: feet(5),
  openingType: 'door',
});

const egress = createOpening({
  id: 'E1',
  wallId: 'W1',
  position: feet(12),
  openingType: 'egress-window',
});

const seeded: BasementModel = createModel([hostWall, door, egress]);

function expectRoundTrip(model: BasementModel, command: Command): void {
  const applied = applyCommand(model, command);
  const restored = applyCommand(applied.model, applied.inverse);
  expect(restored.model).toEqual(model);
}

describe('net clear opening', () => {
  it('is not the window size', () => {
    // The single most repeated basement-permit mistake: R310 measures the openable
    // area with the sash fully open, which is smaller than the unit.
    const unitArea = toSquareFeet(multiplyLengths(egress.width, egress.height));
    const clear = netClearArea(egress);
    expect(clear).not.toBeNull();
    if (clear === null) throw new Error('unreachable');
    expect(toSquareFeet(clear)).toBeLessThan(unitArea);
  });

  it('reports the measured net clear area', () => {
    const clear = netClearArea(egress);
    if (clear === null) throw new Error('unreachable');
    // 34" x 44" = 1496 sq in.
    expect(toSquareFeet(clear)).toBeCloseTo(1496 / 144, 6);
  });

  it('is null when nobody measured it — unknown, not compliant', () => {
    expect(netClearArea(door)).toBeNull();
    expect(
      netClearArea(
        createOpening({
          id: 'X',
          wallId: 'W1',
          position: feet(3),
          openingType: 'window',
        }),
      ),
    ).toBeNull();
  });

  it('refuses a half-set pair', () => {
    expect(() =>
      applyCommand(seeded, {
        kind: 'set-net-clear',
        openingId: 'E1',
        netClearWidth: inches(30),
        netClearHeight: null,
      }),
    ).toThrow(CoreError);
  });

  it('round-trips through its inverse', () => {
    expectRoundTrip(seeded, {
      kind: 'set-net-clear',
      openingId: 'E1',
      netClearWidth: inches(30),
      netClearHeight: inches(40),
    });
    expectRoundTrip(seeded, {
      kind: 'set-net-clear',
      openingId: 'E1',
      netClearWidth: null,
      netClearHeight: null,
    });
  });
});

describe('positioning along the wall', () => {
  it('measures jambs from the wall start', () => {
    expect(openingStart(door)).toBe(feet(5) - inches(16));
    expect(openingEnd(door)).toBe(feet(5) + inches(16));
    expect(openingHeadHeight(door)).toBe(inches(80));
    expect(openingHeadHeight(egress)).toBe(inches(88));
  });

  it('locates a point along the centreline', () => {
    expect(pointAlongWall(hostWall, feet(5))).toEqual(vec2(feet(5), feet(0)));
    expect(pointAlongWall(hostWall, feet(0))).toEqual(vec2(feet(0), feet(0)));
  });

  it('builds a footprint across the wall thickness', () => {
    const footprint = openingFootprint(door, hostWall);
    expect(footprint).toHaveLength(4);
    expect(orientation(footprint)).toBe('ccw');
    // 32" wide x 4-1/2" thick.
    expect(toSquareFeet(polygonArea(footprint))).toBeCloseTo((32 * 4.5) / 144, 5);
  });

  it('spans exactly the opening width', () => {
    const centre = openingCenterline(door, hostWall);
    // A 32" door centred at 5'-0" runs from 3'-8" to 6'-4".
    expect(centre.a).toEqual(vec2(inches(44), feet(0)));
    expect(centre.b).toEqual(vec2(inches(76), feet(0)));
  });

  it('knows whether it fits', () => {
    expect(openingFitsWall(door, hostWall)).toBe(true);
    const overhanging = { ...door, position: feet(19.9) };
    expect(openingFitsWall(overhanging, hostWall)).toBe(false);
    const atZero = { ...door, position: inches(4) };
    expect(openingFitsWall(atZero, hostWall)).toBe(false);
  });

  it('clamps a proposed position to keep the opening on the wall', () => {
    expect(clampPosition(feet(0), door.width, hostWall)).toBe(inches(16));
    expect(clampPosition(feet(50), door.width, hostWall)).toBe(feet(20) - inches(16));
    expect(clampPosition(feet(5), door.width, hostWall)).toBe(feet(5));
    expect(defaultPosition(hostWall)).toBe(feet(10));
  });

  it('travels with its wall, because it is stored as a wall parameter', () => {
    // Moving the wall does not touch the opening record at all.
    const { model } = applyCommand(seeded, {
      kind: 'move-wall',
      wallId: 'W1',
      start: vec2(feet(0), feet(9)),
      end: vec2(feet(20), feet(9)),
    });
    const moved = getOpening(model, 'D1');
    expect(moved.position).toBe(door.position);
    const centre = openingCenterline(moved, {
      ...hostWall,
      start: vec2(feet(0), feet(9)),
      end: vec2(feet(20), feet(9)),
    });
    expect(centre.a.y).toBe(feet(9));
  });
});

describe('opening commands', () => {
  it('adds and removes', () => {
    const fresh = createModel([hostWall]);
    const { model } = applyCommand(fresh, { kind: 'add-opening', opening: door });
    expect(listOpenings(model)).toHaveLength(1);
    expectRoundTrip(fresh, { kind: 'add-opening', opening: door });
    expectRoundTrip(seeded, { kind: 'remove-opening', openingId: 'D1' });
  });

  it('refuses an opening that does not fit its wall', () => {
    const tooWide = createOpening({
      id: 'X1',
      wallId: 'W1',
      position: feet(10),
      openingType: 'cased-opening',
      width: feet(30),
    });
    expect(() => applyCommand(seeded, { kind: 'add-opening', opening: tooWide })).toThrow(
      CoreError,
    );
  });

  it('refuses a move that pushes it off the end', () => {
    expect(() =>
      applyCommand(seeded, { kind: 'move-opening', openingId: 'D1', position: feet(20) }),
    ).toThrow(CoreError);
  });

  it('slides with clamping instead of throwing', () => {
    const { model } = applyCommand(seeded, slideOpeningCommand(seeded, 'D1', feet(-5)));
    expect(getOpening(model, 'D1').position).toBe(inches(16));
  });

  it('resizes, and refuses a resize that would not fit', () => {
    expectRoundTrip(seeded, {
      kind: 'resize-opening',
      openingId: 'D1',
      width: inches(36),
      height: inches(80),
    });
    expect(() =>
      applyCommand(seeded, {
        kind: 'resize-opening',
        openingId: 'D1',
        width: feet(30),
        height: inches(80),
      }),
    ).toThrow(CoreError);
    expect(() =>
      applyCommand(seeded, {
        kind: 'resize-opening',
        openingId: 'D1',
        width: inches(0),
        height: inches(80),
      }),
    ).toThrow(CoreError);
  });

  it('round-trips a move', () => {
    expectRoundTrip(seeded, { kind: 'move-opening', openingId: 'D1', position: feet(8) });
  });
});

describe('removing a wall that hosts openings', () => {
  it('refuses the bare command rather than orphaning them', () => {
    expect(() => applyCommand(seeded, { kind: 'remove-wall', wallId: 'W1' })).toThrow(
      CoreError,
    );
    expect(openingsOnWall(seeded, 'W1')).toHaveLength(2);
  });

  it('removes them explicitly as a batch', () => {
    const commands = removeWallCommands(seeded, 'W1');
    expect(commands).toHaveLength(3);
    const { model, inverses } = applyCommands(seeded, commands);
    expect(Object.keys(model.entities)).toHaveLength(0);

    // And the whole batch undoes as a unit, bringing the openings back with the wall.
    const restored = applyCommands(model, inverses);
    expect(restored.model).toEqual(seeded);
  });

  it('is a plain removal when the wall hosts nothing', () => {
    const bare = createModel([hostWall]);
    expect(removeWallCommands(bare, 'W1')).toHaveLength(1);
  });
});

describe('catalogue defaults', () => {
  it('gives every opening type a real size', () => {
    expect(OPENING_DEFAULTS.door.width).toBe(inches(32));
    expect(OPENING_DEFAULTS.door.sillHeight).toBe(0);
    expect(OPENING_DEFAULTS['egress-window'].netClearWidth).toBe(inches(34));
    expect(OPENING_DEFAULTS.window.netClearWidth).toBeNull();
  });

  it('defaults a door to a swing and a window to none', () => {
    expect(door.swing).toBe('left');
    expect(egress.swing).toBe('none');
  });
});
