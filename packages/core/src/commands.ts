import type { Length, Vec2 } from '@basement/geometry';

import { CoreError } from './errors.js';
import {
  getEquipment,
  getOpening,
  getWall,
  hasEntity,
  openingsOnWall,
  withEntity,
  withoutEntity,
} from './model.js';
import { clampPosition, openingFitsWall } from './openings.js';
import { EQUIPMENT_DEFAULTS } from './equipment.js';
import type {
  BasementModel,
  Equipment,
  EquipmentType,
  Opening,
  Wall,
  WallAssembly,
} from './schema.js';
import { ASSEMBLY_THICKNESS, endPointForLength, isDegenerateWall } from './walls.js';

/**
 * Every edit is a command. Undo/redo, revision diffing, and eventually collaborative
 * editing all depend on this being the only way the model changes.
 */
export type Command =
  | { readonly kind: 'add-wall'; readonly wall: Wall }
  | { readonly kind: 'remove-wall'; readonly wallId: string }
  | {
      readonly kind: 'move-wall';
      readonly wallId: string;
      readonly start: Vec2;
      readonly end: Vec2;
    }
  | {
      readonly kind: 'set-wall-thickness';
      readonly wallId: string;
      readonly thickness: Length;
    }
  | {
      readonly kind: 'set-wall-assembly';
      readonly wallId: string;
      readonly assembly: WallAssembly;
      readonly thickness: Length;
    }
  | { readonly kind: 'add-opening'; readonly opening: Opening }
  | { readonly kind: 'remove-opening'; readonly openingId: string }
  | {
      readonly kind: 'move-opening';
      readonly openingId: string;
      readonly position: Length;
    }
  | {
      readonly kind: 'resize-opening';
      readonly openingId: string;
      readonly width: Length;
      readonly height: Length;
    }
  | {
      readonly kind: 'set-net-clear';
      readonly openingId: string;
      readonly netClearWidth: Length | null;
      readonly netClearHeight: Length | null;
    }
  | { readonly kind: 'add-equipment'; readonly equipment: Equipment }
  | { readonly kind: 'remove-equipment'; readonly equipmentId: string }
  | {
      readonly kind: 'move-equipment';
      readonly equipmentId: string;
      readonly origin: Vec2;
    }
  | {
      readonly kind: 'rotate-equipment';
      readonly equipmentId: string;
      readonly rotation: number;
    };

export interface CommandResult {
  readonly model: BasementModel;
  /** The command that undoes this one exactly. */
  readonly inverse: Command;
}

function rejectDegenerate(wall: Wall): void {
  if (isDegenerateWall(wall)) {
    throw new CoreError(
      'core.wall-degenerate',
      'A wall must have two distinct endpoints.',
    );
  }
}

function requireAbsent(model: BasementModel, id: string): void {
  if (hasEntity(model, id)) {
    throw new CoreError(
      'core.duplicate-id',
      `An entity with id "${id}" is already in the model.`,
    );
  }
}

/**
 * Apply a command, returning the new model and the command that reverses it.
 *
 * The model is never mutated; the result shares every entity the command did not touch.
 */
export function applyCommand(model: BasementModel, command: Command): CommandResult {
  switch (command.kind) {
    case 'add-wall': {
      requireAbsent(model, command.wall.id);
      rejectDegenerate(command.wall);
      return {
        model: withEntity(model, command.wall),
        inverse: { kind: 'remove-wall', wallId: command.wall.id },
      };
    }

    case 'remove-wall': {
      const wall = getWall(model, command.wallId);
      // Invariant 3: deleting an entity requires resolving its referents explicitly.
      // Silently orphaning or cascading would both lose information the caller owns.
      const hosted = openingsOnWall(model, command.wallId);
      if (hosted.length > 0) {
        throw new CoreError(
          'core.wall-has-openings',
          `Wall "${command.wallId}" still hosts ${String(hosted.length)} opening(s). ` +
            'Remove them first, or use removeWallCommands to build the batch.',
        );
      }
      return {
        model: withoutEntity(model, command.wallId),
        inverse: { kind: 'add-wall', wall },
      };
    }

    case 'move-wall': {
      const wall = getWall(model, command.wallId);
      const moved: Wall = { ...wall, start: command.start, end: command.end };
      rejectDegenerate(moved);
      return {
        model: withEntity(model, moved),
        inverse: { kind: 'move-wall', wallId: wall.id, start: wall.start, end: wall.end },
      };
    }

    case 'set-wall-thickness': {
      const wall = getWall(model, command.wallId);
      if (command.thickness <= 0) {
        throw new CoreError('core.wall-thickness', 'Wall thickness must be positive.');
      }
      return {
        model: withEntity(model, { ...wall, thickness: command.thickness }),
        inverse: {
          kind: 'set-wall-thickness',
          wallId: wall.id,
          thickness: wall.thickness,
        },
      };
    }

    case 'set-wall-assembly': {
      const wall = getWall(model, command.wallId);
      if (command.thickness <= 0) {
        throw new CoreError('core.wall-thickness', 'Wall thickness must be positive.');
      }
      return {
        model: withEntity(model, {
          ...wall,
          assembly: command.assembly,
          thickness: command.thickness,
        }),
        inverse: {
          kind: 'set-wall-assembly',
          wallId: wall.id,
          assembly: wall.assembly,
          thickness: wall.thickness,
        },
      };
    }

    case 'add-opening': {
      requireAbsent(model, command.opening.id);
      const wall = getWall(model, command.opening.wallId);
      if (!openingFitsWall(command.opening, wall)) {
        throw new CoreError(
          'core.opening-does-not-fit',
          `Opening "${command.opening.id}" does not fit within wall "${wall.id}".`,
        );
      }
      return {
        model: withEntity(model, command.opening),
        inverse: { kind: 'remove-opening', openingId: command.opening.id },
      };
    }

    case 'remove-opening': {
      const opening = getOpening(model, command.openingId);
      return {
        model: withoutEntity(model, command.openingId),
        inverse: { kind: 'add-opening', opening },
      };
    }

    case 'move-opening': {
      const opening = getOpening(model, command.openingId);
      const wall = getWall(model, opening.wallId);
      const moved: Opening = { ...opening, position: command.position };
      if (!openingFitsWall(moved, wall)) {
        throw new CoreError(
          'core.opening-does-not-fit',
          `Position would push opening "${opening.id}" past the end of its wall.`,
        );
      }
      return {
        model: withEntity(model, moved),
        inverse: {
          kind: 'move-opening',
          openingId: opening.id,
          position: opening.position,
        },
      };
    }

    case 'resize-opening': {
      const opening = getOpening(model, command.openingId);
      const wall = getWall(model, opening.wallId);
      if (command.width <= 0 || command.height <= 0) {
        throw new CoreError(
          'core.opening-size',
          'Opening width and height must be positive.',
        );
      }
      const resized: Opening = {
        ...opening,
        width: command.width,
        height: command.height,
      };
      if (!openingFitsWall(resized, wall)) {
        throw new CoreError(
          'core.opening-does-not-fit',
          `Width ${String(command.width)} does not fit in wall "${wall.id}".`,
        );
      }
      return {
        model: withEntity(model, resized),
        inverse: {
          kind: 'resize-opening',
          openingId: opening.id,
          width: opening.width,
          height: opening.height,
        },
      };
    }

    case 'set-net-clear': {
      const opening = getOpening(model, command.openingId);
      const bothOrNeither =
        (command.netClearWidth === null) === (command.netClearHeight === null);
      if (!bothOrNeither) {
        throw new CoreError(
          'core.net-clear-partial',
          'Net clear width and height must be set together or not at all.',
        );
      }
      return {
        model: withEntity(model, {
          ...opening,
          netClearWidth: command.netClearWidth,
          netClearHeight: command.netClearHeight,
        }),
        inverse: {
          kind: 'set-net-clear',
          openingId: opening.id,
          netClearWidth: opening.netClearWidth,
          netClearHeight: opening.netClearHeight,
        },
      };
    }

    case 'add-equipment': {
      requireAbsent(model, command.equipment.id);
      return {
        model: withEntity(model, command.equipment),
        inverse: { kind: 'remove-equipment', equipmentId: command.equipment.id },
      };
    }

    case 'remove-equipment': {
      const equipment = getEquipment(model, command.equipmentId);
      return {
        model: withoutEntity(model, command.equipmentId),
        inverse: { kind: 'add-equipment', equipment },
      };
    }

    case 'move-equipment': {
      const equipment = getEquipment(model, command.equipmentId);
      return {
        model: withEntity(model, { ...equipment, origin: command.origin }),
        inverse: {
          kind: 'move-equipment',
          equipmentId: equipment.id,
          origin: equipment.origin,
        },
      };
    }

    case 'rotate-equipment': {
      const equipment = getEquipment(model, command.equipmentId);
      return {
        model: withEntity(model, { ...equipment, rotation: command.rotation }),
        inverse: {
          kind: 'rotate-equipment',
          equipmentId: equipment.id,
          rotation: equipment.rotation,
        },
      };
    }
  }
}

/** Apply several commands in order, collecting inverses that undo the whole batch. */
export function applyCommands(
  model: BasementModel,
  commands: readonly Command[],
): { model: BasementModel; inverses: readonly Command[] } {
  let current = model;
  const inverses: Command[] = [];
  for (const command of commands) {
    const result = applyCommand(current, command);
    current = result.model;
    // Undoing a batch means undoing its members in reverse order.
    inverses.unshift(result.inverse);
  }
  return { model: current, inverses };
}

// ---------------------------------------------------------------------------
// Command builders — these compute arguments, they do not apply anything.
// ---------------------------------------------------------------------------

/**
 * Re-dimension a wall to an exact length, holding `start` and the direction fixed.
 * Expressed as a move, so there is exactly one command that changes wall geometry.
 */
export function dimensionWallCommand(
  model: BasementModel,
  wallId: string,
  target: Length,
): Command {
  const wall = getWall(model, wallId);
  return {
    kind: 'move-wall',
    wallId,
    start: wall.start,
    end: endPointForLength(wall, target),
  };
}

/** Switch assembly and take that assembly's standard thickness with it. */
export function assemblyCommand(wallId: string, assembly: WallAssembly): Command {
  return {
    kind: 'set-wall-assembly',
    wallId,
    assembly,
    thickness: ASSEMBLY_THICKNESS[assembly],
  };
}

/**
 * The batch that removes a wall along with everything hosted on it. Explicit, ordered,
 * and undoable as a unit — the openings come back when the wall does.
 */
export function removeWallCommands(
  model: BasementModel,
  wallId: string,
): readonly Command[] {
  const openings = openingsOnWall(model, wallId);
  return [
    ...openings.map((opening): Command => ({
      kind: 'remove-opening',
      openingId: opening.id,
    })),
    { kind: 'remove-wall', wallId },
  ];
}

/** Slide an opening along its wall, clamped so it cannot leave the wall. */
export function slideOpeningCommand(
  model: BasementModel,
  openingId: string,
  position: Length,
): Command {
  const opening = getOpening(model, openingId);
  const wall = getWall(model, opening.wallId);
  return {
    kind: 'move-opening',
    openingId,
    position: clampPosition(position, opening.width, wall),
  };
}

export function equipmentDefaultsFor(
  type: EquipmentType,
): (typeof EQUIPMENT_DEFAULTS)[EquipmentType] {
  return EQUIPMENT_DEFAULTS[type];
}

export function describeCommand(command: Command): string {
  switch (command.kind) {
    case 'add-wall':
      return 'Add wall';
    case 'remove-wall':
      return 'Remove wall';
    case 'move-wall':
      return 'Move wall';
    case 'set-wall-thickness':
      return 'Set thickness';
    case 'set-wall-assembly':
      return 'Set assembly';
    case 'add-opening':
      return 'Add opening';
    case 'remove-opening':
      return 'Remove opening';
    case 'move-opening':
      return 'Move opening';
    case 'resize-opening':
      return 'Resize opening';
    case 'set-net-clear':
      return 'Set net clear opening';
    case 'add-equipment':
      return 'Add equipment';
    case 'remove-equipment':
      return 'Remove equipment';
    case 'move-equipment':
      return 'Move equipment';
    case 'rotate-equipment':
      return 'Rotate equipment';
  }
}
