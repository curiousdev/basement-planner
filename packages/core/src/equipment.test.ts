import {
  degreesToRadians,
  feet,
  inches,
  orientation,
  polygonArea,
  toSquareFeet,
  vec2,
} from '@basement/geometry';
import { describe, expect, it } from 'vitest';

import { type Command, applyCommand } from './commands.js';
import {
  EQUIPMENT_DEFAULTS,
  createEquipment,
  equipmentDiscipline,
  equipmentFootprint,
  equipmentLabel,
  intrudesOnClearHeight,
  translateEquipment,
} from './equipment.js';
import { CoreError } from './errors.js';
import { createModel, getEquipment, listEquipment } from './model.js';
import type { BasementModel } from './schema.js';

const trunk = createEquipment({
  id: 'M1',
  equipmentType: 'duct-trunk',
  origin: vec2(feet(10), feet(6)),
});

const furnace = createEquipment({
  id: 'M2',
  equipmentType: 'furnace',
  origin: vec2(feet(2), feet(2)),
});

const seeded: BasementModel = createModel([trunk, furnace]);

function expectRoundTrip(model: BasementModel, command: Command): void {
  const applied = applyCommand(model, command);
  const restored = applyCommand(applied.model, applied.inverse);
  expect(restored.model).toEqual(model);
}

describe('catalogue', () => {
  it('sizes components the way they are actually made', () => {
    expect(EQUIPMENT_DEFAULTS['supply-register'].width).toBe(inches(12));
    expect(EQUIPMENT_DEFAULTS['duct-trunk'].width).toBe(inches(20));
    expect(EQUIPMENT_DEFAULTS.furnace.depth).toBe(inches(30));
  });

  it('labels and files each component under a discipline', () => {
    expect(equipmentLabel(trunk)).toBe('Duct trunk');
    expect(equipmentDiscipline(trunk)).toBe('mechanical');
    expect(
      equipmentDiscipline(
        createEquipment({
          id: 'P',
          equipmentType: 'sump-pump',
          origin: vec2(feet(0), feet(0)),
        }),
      ),
    ).toBe('plumbing');
    expect(
      equipmentDiscipline(
        createEquipment({
          id: 'E',
          equipmentType: 'electrical-panel',
          origin: vec2(feet(0), feet(0)),
        }),
      ),
    ).toBe('electrical');
  });

  it('refuses a non-positive footprint', () => {
    expect(() =>
      createEquipment({
        id: 'bad',
        equipmentType: 'furnace',
        origin: vec2(feet(0), feet(0)),
        width: inches(0),
      }),
    ).toThrow(CoreError);
  });
});

describe('clear height', () => {
  it('knows which components hang below the joists', () => {
    // A 10" trunk leaves reduced height under it and full height beside it. That is
    // why clear height is a field over the plan, not a single number.
    expect(intrudesOnClearHeight(trunk)).toBe(true);
    expect(trunk.dropBelowJoists).toBe(inches(10));
    expect(intrudesOnClearHeight(furnace)).toBe(false);
    expect(furnace.dropBelowJoists).toBeNull();
  });

  it('lets an unusual drop be recorded', () => {
    const deep = createEquipment({
      id: 'M9',
      equipmentType: 'duct-trunk',
      origin: vec2(feet(4), feet(4)),
      dropBelowJoists: inches(16),
    });
    expect(deep.dropBelowJoists).toBe(inches(16));
  });
});

describe('footprint', () => {
  it('builds a counter-clockwise ring centred on the origin', () => {
    const footprint = equipmentFootprint(furnace);
    expect(footprint).toHaveLength(4);
    expect(orientation(footprint)).toBe('ccw');
    expect(toSquareFeet(polygonArea(footprint))).toBeCloseTo((24 * 30) / 144, 5);
  });

  it('rotates about its own origin, preserving area', () => {
    const turned = createEquipment({
      id: 'M3',
      equipmentType: 'furnace',
      origin: vec2(feet(2), feet(2)),
      rotation: degreesToRadians(90),
    });
    const straight = equipmentFootprint(furnace);
    const rotated = equipmentFootprint(turned);
    expect(polygonArea(rotated)).toBe(polygonArea(straight));
    expect(orientation(rotated)).toBe('ccw');
  });

  it('translates without changing size', () => {
    const moved = translateEquipment(furnace, vec2(feet(5), feet(0)));
    expect(moved.origin).toEqual(vec2(feet(7), feet(2)));
    expect(polygonArea(equipmentFootprint(moved))).toBe(
      polygonArea(equipmentFootprint(furnace)),
    );
  });
});

describe('equipment commands', () => {
  it('adds, moves, rotates, and removes', () => {
    const fresh = createModel([]);
    const { model } = applyCommand(fresh, { kind: 'add-equipment', equipment: trunk });
    expect(listEquipment(model)).toHaveLength(1);

    const { model: moved } = applyCommand(seeded, {
      kind: 'move-equipment',
      equipmentId: 'M1',
      origin: vec2(feet(12), feet(8)),
    });
    expect(getEquipment(moved, 'M1').origin).toEqual(vec2(feet(12), feet(8)));

    const { model: turned } = applyCommand(seeded, {
      kind: 'rotate-equipment',
      equipmentId: 'M2',
      rotation: Math.PI / 2,
    });
    expect(getEquipment(turned, 'M2').rotation).toBeCloseTo(Math.PI / 2, 12);
  });

  it('round-trips every command through its inverse', () => {
    expectRoundTrip(createModel([]), { kind: 'add-equipment', equipment: trunk });
    expectRoundTrip(seeded, { kind: 'remove-equipment', equipmentId: 'M1' });
    expectRoundTrip(seeded, {
      kind: 'move-equipment',
      equipmentId: 'M1',
      origin: vec2(feet(12), feet(8)),
    });
    expectRoundTrip(seeded, {
      kind: 'rotate-equipment',
      equipmentId: 'M2',
      rotation: Math.PI / 4,
    });
  });

  it('refuses a duplicate id', () => {
    expect(() =>
      applyCommand(seeded, { kind: 'add-equipment', equipment: trunk }),
    ).toThrow(CoreError);
  });
});
