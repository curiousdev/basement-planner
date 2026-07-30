import { feet, inches, vec2 } from '@basement/geometry';
import { describe, expect, it } from 'vitest';

import { EntityNotFoundError, SchemaError } from './errors.js';
import {
  createModel,
  entityCount,
  getEntity,
  getWall,
  hasEntity,
  listWalls,
  parseModel,
  serializeModel,
  withEntity,
  withoutEntity,
} from './model.js';
import { SCHEMA_VERSION } from './schema.js';
import { createWall } from './walls.js';

const wallA = createWall({
  id: 'w1',
  start: vec2(feet(0), feet(0)),
  end: vec2(feet(12), feet(0)),
});
const wallB = createWall({
  id: 'w2',
  start: vec2(feet(12), feet(0)),
  end: vec2(feet(12), feet(9)),
  assembly: 'foundation',
  existing: true,
});

describe('model', () => {
  it('stores entities in a flat id-keyed map', () => {
    const model = createModel([wallA, wallB]);
    expect(model.schemaVersion).toBe(SCHEMA_VERSION);
    expect(Object.keys(model.entities)).toEqual(['w1', 'w2']);
    expect(entityCount(model)).toBe(2);
  });

  it('looks entities up by id', () => {
    const model = createModel([wallA]);
    expect(getEntity(model, 'w1').id).toBe('w1');
    expect(getWall(model, 'w1').thickness).toBe(inches(4.5));
    expect(hasEntity(model, 'w1')).toBe(true);
    expect(hasEntity(model, 'nope')).toBe(false);
    expect(() => getEntity(model, 'nope')).toThrow(EntityNotFoundError);
  });

  it('lists walls in insertion order', () => {
    const model = createModel([wallA, wallB]);
    expect(listWalls(model).map((w) => w.id)).toEqual(['w1', 'w2']);
  });

  it('replaces and removes without mutating', () => {
    const model = createModel([wallA]);
    const snapshot = JSON.stringify(model);

    const updated = withEntity(model, { ...wallA, thickness: inches(8) });
    expect(getWall(updated, 'w1').thickness).toBe(inches(8));
    expect(JSON.stringify(model)).toBe(snapshot);

    const removed = withoutEntity(model, 'w1');
    expect(entityCount(removed)).toBe(0);
    expect(JSON.stringify(model)).toBe(snapshot);
    expect(() => withoutEntity(model, 'nope')).toThrow(EntityNotFoundError);
  });
});

describe('serialisation', () => {
  it('round-trips through JSON', () => {
    const model = createModel([wallA, wallB]);
    const parsed = parseModel(JSON.parse(serializeModel(model)));
    expect(parsed).toEqual(model);
  });

  it('preserves the existing-conditions flag', () => {
    const model = createModel([wallB]);
    const parsed = parseModel(JSON.parse(serializeModel(model)));
    expect(getWall(parsed, 'w2').existing).toBe(true);
  });

  it('rejects a document with the wrong schema version', () => {
    expect(() => parseModel({ schemaVersion: 99, entities: {} })).toThrow(SchemaError);
  });

  it('rejects a length that is not an integer count of 1/32 inch', () => {
    const bad = {
      schemaVersion: SCHEMA_VERSION,
      entities: {
        w1: {
          id: 'w1',
          kind: 'wall',
          start: { x: 0, y: 0 },
          end: { x: 12.5, y: 0 },
          thickness: 144,
          assembly: 'partition-2x4',
          existing: false,
        },
      },
    };
    expect(() => parseModel(bad)).toThrow(SchemaError);
  });

  it('rejects an unknown assembly', () => {
    const bad = {
      schemaVersion: SCHEMA_VERSION,
      entities: {
        w1: {
          id: 'w1',
          kind: 'wall',
          start: { x: 0, y: 0 },
          end: { x: 384, y: 0 },
          thickness: 144,
          assembly: 'straw-bale',
          existing: false,
        },
      },
    };
    expect(() => parseModel(bad)).toThrow(SchemaError);
  });

  it('names where the document failed', () => {
    expect(() => parseModel({ schemaVersion: SCHEMA_VERSION })).toThrow(/entities/);
    expect(() => parseModel(null)).toThrow(SchemaError);
  });
});
