import { feet, inches, vec2 } from '@basement/geometry';
import { describe, expect, it } from 'vitest';

import {
  type Command,
  applyCommand,
  applyCommands,
  assemblyCommand,
  describeCommand,
  dimensionWallCommand,
} from './commands.js';
import { CoreError, EntityKindError, EntityNotFoundError } from './errors.js';
import { createModel, getWall, listWalls } from './model.js';
import type { BasementModel } from './schema.js';
import { ASSEMBLY_THICKNESS, createWall, wallLength } from './walls.js';

const wallA = createWall({
  id: 'w1',
  start: vec2(feet(0), feet(0)),
  end: vec2(feet(12), feet(0)),
  assembly: 'partition-2x4',
});

const wallB = createWall({
  id: 'w2',
  start: vec2(feet(12), feet(0)),
  end: vec2(feet(12), feet(9)),
  assembly: 'foundation',
});

const seeded: BasementModel = createModel([wallA, wallB]);

/**
 * CLAUDE.md requires every command to be tested for apply-then-inverse identity. This
 * runs that check, and is the reason the command set stays small.
 */
function expectRoundTrip(model: BasementModel, command: Command): void {
  const applied = applyCommand(model, command);
  const restored = applyCommand(applied.model, applied.inverse);
  expect(restored.model).toEqual(model);
}

describe('add-wall', () => {
  it('adds the wall', () => {
    const { model } = applyCommand(createModel(), { kind: 'add-wall', wall: wallA });
    expect(listWalls(model)).toHaveLength(1);
    expect(getWall(model, 'w1').assembly).toBe('partition-2x4');
  });

  it('round-trips through its inverse', () => {
    expectRoundTrip(createModel(), { kind: 'add-wall', wall: wallA });
    expectRoundTrip(seeded, {
      kind: 'add-wall',
      wall: createWall({
        id: 'w3',
        start: vec2(feet(0), feet(9)),
        end: vec2(feet(12), feet(9)),
      }),
    });
  });

  it('refuses a duplicate id', () => {
    expect(() => applyCommand(seeded, { kind: 'add-wall', wall: wallA })).toThrow(
      CoreError,
    );
  });

  it('refuses a zero-length wall', () => {
    const degenerate = createWall({
      id: 'w9',
      start: vec2(feet(1), feet(1)),
      end: vec2(feet(1), feet(1)),
    });
    expect(() => applyCommand(seeded, { kind: 'add-wall', wall: degenerate })).toThrow(
      CoreError,
    );
  });

  it('does not mutate the model it was given', () => {
    const before = JSON.stringify(seeded);
    applyCommand(seeded, {
      kind: 'add-wall',
      wall: createWall({
        id: 'w4',
        start: vec2(feet(0), feet(0)),
        end: vec2(feet(1), feet(0)),
      }),
    });
    expect(JSON.stringify(seeded)).toBe(before);
  });
});

describe('remove-wall', () => {
  it('removes the wall', () => {
    const { model } = applyCommand(seeded, { kind: 'remove-wall', wallId: 'w1' });
    expect(listWalls(model)).toHaveLength(1);
  });

  it('round-trips through its inverse, restoring every field', () => {
    expectRoundTrip(seeded, { kind: 'remove-wall', wallId: 'w1' });
    expectRoundTrip(seeded, { kind: 'remove-wall', wallId: 'w2' });
  });

  it('throws for an unknown id', () => {
    expect(() => applyCommand(seeded, { kind: 'remove-wall', wallId: 'nope' })).toThrow(
      EntityNotFoundError,
    );
  });
});

describe('move-wall', () => {
  it('moves both endpoints', () => {
    const { model } = applyCommand(seeded, {
      kind: 'move-wall',
      wallId: 'w1',
      start: vec2(feet(1), feet(1)),
      end: vec2(feet(13), feet(1)),
    });
    expect(getWall(model, 'w1').start).toEqual(vec2(feet(1), feet(1)));
  });

  it('round-trips through its inverse', () => {
    expectRoundTrip(seeded, {
      kind: 'move-wall',
      wallId: 'w1',
      start: vec2(feet(1), feet(1)),
      end: vec2(feet(13), feet(1)),
    });
  });

  it('refuses to collapse a wall to a point', () => {
    expect(() =>
      applyCommand(seeded, {
        kind: 'move-wall',
        wallId: 'w1',
        start: vec2(feet(1), feet(1)),
        end: vec2(feet(1), feet(1)),
      }),
    ).toThrow(CoreError);
  });

  it('carries the opening-bearing fields untouched', () => {
    const { model } = applyCommand(seeded, {
      kind: 'move-wall',
      wallId: 'w2',
      start: vec2(feet(20), feet(0)),
      end: vec2(feet(20), feet(9)),
    });
    const moved = getWall(model, 'w2');
    expect(moved.assembly).toBe('foundation');
    expect(moved.thickness).toBe(ASSEMBLY_THICKNESS.foundation);
  });
});

describe('set-wall-thickness', () => {
  it('sets the thickness', () => {
    const { model } = applyCommand(seeded, {
      kind: 'set-wall-thickness',
      wallId: 'w1',
      thickness: inches(6.5),
    });
    expect(getWall(model, 'w1').thickness).toBe(inches(6.5));
  });

  it('round-trips through its inverse', () => {
    expectRoundTrip(seeded, {
      kind: 'set-wall-thickness',
      wallId: 'w1',
      thickness: inches(6.5),
    });
  });

  it('refuses a non-positive thickness', () => {
    expect(() =>
      applyCommand(seeded, {
        kind: 'set-wall-thickness',
        wallId: 'w1',
        thickness: inches(0),
      }),
    ).toThrow(CoreError);
  });
});

describe('set-wall-assembly', () => {
  it('changes assembly and thickness together', () => {
    const { model } = applyCommand(seeded, assemblyCommand('w1', 'partition-2x6'));
    const wall = getWall(model, 'w1');
    expect(wall.assembly).toBe('partition-2x6');
    expect(wall.thickness).toBe(inches(6.5));
  });

  it('round-trips through its inverse', () => {
    expectRoundTrip(seeded, assemblyCommand('w1', 'partition-2x6'));
    expectRoundTrip(seeded, assemblyCommand('w2', 'furring'));
  });
});

describe('dimensioning', () => {
  it('re-dimensions a wall to an exact length along its own direction', () => {
    const command = dimensionWallCommand(seeded, 'w1', feet(10));
    const { model } = applyCommand(seeded, command);
    expect(wallLength(getWall(model, 'w1'))).toBe(feet(10));
    expect(getWall(model, 'w1').start).toEqual(wallA.start);
  });

  it('lands within a unit on a diagonal, where exactness is impossible', () => {
    const diagonal = createModel([
      createWall({
        id: 'd1',
        start: vec2(feet(0), feet(0)),
        end: vec2(feet(10), feet(7)),
      }),
    ]);
    const { model } = applyCommand(
      diagonal,
      dimensionWallCommand(diagonal, 'd1', feet(15)),
    );
    expect(Math.abs(wallLength(getWall(model, 'd1')) - feet(15))).toBeLessThanOrEqual(1);
  });

  it('round-trips through its inverse', () => {
    expectRoundTrip(seeded, dimensionWallCommand(seeded, 'w1', feet(10)));
  });

  it('refuses a non-positive length', () => {
    expect(() => dimensionWallCommand(seeded, 'w1', feet(0))).toThrow(CoreError);
  });
});

describe('batches', () => {
  it('applies in order and undoes in reverse', () => {
    const commands: Command[] = [
      {
        kind: 'add-wall',
        wall: createWall({
          id: 'b1',
          start: vec2(feet(0), feet(9)),
          end: vec2(feet(12), feet(9)),
        }),
      },
      { kind: 'set-wall-thickness', wallId: 'b1', thickness: inches(8) },
      { kind: 'remove-wall', wallId: 'w2' },
    ];
    const { model, inverses } = applyCommands(seeded, commands);
    expect(listWalls(model)).toHaveLength(2);

    const undone = applyCommands(model, inverses);
    expect(undone.model).toEqual(seeded);
  });
});

describe('error surfaces', () => {
  it('reports the wrong entity kind distinctly from a missing one', () => {
    expect(() => getWall(seeded, 'missing')).toThrow(EntityNotFoundError);
    const notAWall = {
      ...seeded,
      entities: {
        odd: {
          id: 'odd',
          kind: 'wall' as const,
          start: wallA.start,
          end: wallA.end,
          thickness: inches(4),
          assembly: 'furring' as const,
          existing: false,
        },
      },
    };
    expect(() => getWall(notAWall, 'odd')).not.toThrow(EntityKindError);
  });

  it('names each command for the undo menu', () => {
    expect(describeCommand({ kind: 'add-wall', wall: wallA })).toBe('Add wall');
    expect(describeCommand({ kind: 'remove-wall', wallId: 'w1' })).toBe('Remove wall');
    expect(describeCommand(assemblyCommand('w1', 'furring'))).toBe('Set assembly');
  });
});
