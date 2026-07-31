import { BasementModelSchema, SCHEMA_VERSION } from './schema.js';
import type { BasementModel, Entity, Equipment, Opening, Wall } from './schema.js';
import { EntityKindError, EntityNotFoundError, SchemaError } from './errors.js';

export function createModel(entities: readonly Entity[] = []): BasementModel {
  const map: Record<string, Entity> = {};
  for (const entity of entities) map[entity.id] = entity;
  return { schemaVersion: SCHEMA_VERSION, entities: map };
}

export function getEntity(model: BasementModel, id: string): Entity {
  const entity = model.entities[id];
  if (entity === undefined) throw new EntityNotFoundError(id);
  return entity;
}

export function hasEntity(model: BasementModel, id: string): boolean {
  return model.entities[id] !== undefined;
}

export function getWall(model: BasementModel, id: string): Wall {
  const entity = getEntity(model, id);
  if (entity.kind !== 'wall') {
    throw new EntityKindError(id, 'wall', entity.kind);
  }
  return entity;
}

/**
 * Walls in insertion order. `Object.values` on a string-keyed record preserves insertion
 * order, which keeps rendering and schedules stable between runs.
 */
export function listWalls(model: BasementModel): readonly Wall[] {
  return Object.values(model.entities).filter(
    (entity): entity is Wall => entity.kind === 'wall',
  );
}

export function getOpening(model: BasementModel, id: string): Opening {
  const entity = getEntity(model, id);
  if (entity.kind !== 'opening') throw new EntityKindError(id, 'opening', entity.kind);
  return entity;
}

export function getEquipment(model: BasementModel, id: string): Equipment {
  const entity = getEntity(model, id);
  if (entity.kind !== 'equipment')
    throw new EntityKindError(id, 'equipment', entity.kind);
  return entity;
}

export function listOpenings(model: BasementModel): readonly Opening[] {
  return Object.values(model.entities).filter(
    (entity): entity is Opening => entity.kind === 'opening',
  );
}

export function listEquipment(model: BasementModel): readonly Equipment[] {
  return Object.values(model.entities).filter(
    (entity): entity is Equipment => entity.kind === 'equipment',
  );
}

/** Openings hosted by a wall — the referents that must be resolved before it is cut. */
export function openingsOnWall(model: BasementModel, wallId: string): readonly Opening[] {
  return listOpenings(model).filter((opening) => opening.wallId === wallId);
}

export function entityCount(model: BasementModel): number {
  return Object.keys(model.entities).length;
}

/** Replace an entity, returning a new model. The model is never mutated in place. */
export function withEntity(model: BasementModel, entity: Entity): BasementModel {
  return {
    ...model,
    entities: { ...model.entities, [entity.id]: entity },
  };
}

/**
 * Remove an entity, returning a new model.
 *
 * This is the low-level removal and it does not chase references — openings name a
 * host wall, so callers resolve that themselves (see `removeWallCommands`).
 */
export function withoutEntity(model: BasementModel, id: string): BasementModel {
  if (!hasEntity(model, id)) throw new EntityNotFoundError(id);
  const entities = Object.fromEntries(
    Object.entries(model.entities).filter(([key]) => key !== id),
  );
  return { ...model, entities };
}

/** Parse a `.bsmt` document. Throws SchemaError with the first failure path. */
export function parseModel(document: unknown): BasementModel {
  const result = BasementModelSchema.safeParse(document);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first === undefined ? 'unknown' : first.path.join('.') || '(root)';
    const why = first === undefined ? 'unknown failure' : first.message;
    throw new SchemaError(`${where}: ${why}`);
  }
  return result.data;
}

export function serializeModel(model: BasementModel): string {
  return JSON.stringify(model, null, 2);
}
