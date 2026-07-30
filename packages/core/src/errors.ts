import { AppError } from '@basement/geometry';

export { AppError };

/** A model or command invariant was violated. */
export class CoreError extends AppError {}

/** A command referenced an entity that is not in the model. */
export class EntityNotFoundError extends CoreError {
  readonly entityId: string;

  constructor(entityId: string) {
    super('core.entity-not-found', `No entity with id "${entityId}" is in the model.`);
    this.entityId = entityId;
  }
}

/** A command referenced an entity of the wrong kind. */
export class EntityKindError extends CoreError {
  constructor(entityId: string, expected: string, actual: string) {
    super(
      'core.entity-kind',
      `Entity "${entityId}" is a ${actual}, but a ${expected} was expected.`,
    );
  }
}

/** A persisted document failed schema validation. */
export class SchemaError extends CoreError {
  constructor(detail: string) {
    super('core.schema', `Document does not match the .bsmt schema: ${detail}`);
  }
}
