import {
  type Length,
  type Polygon,
  type Vec2,
  divideLength,
  inches,
  rotateVec2About,
  vec2,
  addVec2,
  subLengths,
  addLengths,
} from '@basement/geometry';

import { CoreError } from './errors.js';
import type { Equipment, EquipmentType } from './schema.js';

export interface EquipmentDefault {
  readonly width: Length;
  readonly depth: Length;
  /** How far it hangs below the joists, or null if it sits on the slab. */
  readonly dropBelowJoists: Length | null;
  readonly label: string;
  readonly discipline: 'mechanical' | 'plumbing' | 'electrical';
}

/**
 * Catalogue defaults in the sizes these components are actually made in.
 *
 * `dropBelowJoists` is the field that matters later: a 10" trunk under 7'-2" joists
 * leaves 6'-4" beneath it and full height beside it. Clear height is a field over the
 * floor plan, never a single number, and this is where that field gets its input.
 */
export const EQUIPMENT_DEFAULTS: Readonly<Record<EquipmentType, EquipmentDefault>> = {
  'supply-register': {
    width: inches(12),
    depth: inches(6),
    dropBelowJoists: null,
    label: 'Supply register',
    discipline: 'mechanical',
  },
  'return-grille': {
    width: inches(20),
    depth: inches(12),
    dropBelowJoists: null,
    label: 'Return grille',
    discipline: 'mechanical',
  },
  'duct-trunk': {
    width: inches(20),
    depth: inches(8),
    dropBelowJoists: inches(10),
    label: 'Duct trunk',
    discipline: 'mechanical',
  },
  furnace: {
    width: inches(24),
    depth: inches(30),
    dropBelowJoists: null,
    label: 'Furnace',
    discipline: 'mechanical',
  },
  'water-heater': {
    width: inches(20),
    depth: inches(20),
    dropBelowJoists: null,
    label: 'Water heater',
    discipline: 'plumbing',
  },
  'bath-exhaust': {
    width: inches(10),
    depth: inches(10),
    dropBelowJoists: inches(8),
    label: 'Bath exhaust fan',
    discipline: 'mechanical',
  },
  'dryer-vent': {
    width: inches(6),
    depth: inches(6),
    dropBelowJoists: null,
    label: 'Dryer vent',
    discipline: 'mechanical',
  },
  'sump-pump': {
    width: inches(24),
    depth: inches(24),
    dropBelowJoists: null,
    label: 'Sump pit',
    discipline: 'plumbing',
  },
  'electrical-panel': {
    width: inches(15),
    depth: inches(4),
    dropBelowJoists: null,
    label: 'Electrical panel',
    discipline: 'electrical',
  },
};

export interface CreateEquipmentOptions {
  readonly id: string;
  readonly equipmentType: EquipmentType;
  readonly origin: Vec2;
  readonly width?: Length;
  readonly depth?: Length;
  readonly rotation?: number;
  readonly dropBelowJoists?: Length | null;
}

export function createEquipment(options: CreateEquipmentOptions): Equipment {
  const defaults = EQUIPMENT_DEFAULTS[options.equipmentType];
  const width = options.width ?? defaults.width;
  const depth = options.depth ?? defaults.depth;
  if (width <= 0 || depth <= 0) {
    throw new CoreError(
      'core.equipment-size',
      'Equipment width and depth must be positive.',
    );
  }
  return {
    id: options.id,
    kind: 'equipment',
    equipmentType: options.equipmentType,
    origin: options.origin,
    width,
    depth,
    rotation: options.rotation ?? 0,
    dropBelowJoists:
      options.dropBelowJoists === undefined
        ? defaults.dropBelowJoists
        : options.dropBelowJoists,
  };
}

/** The footprint as a closed ring, wound counter-clockwise, rotation applied. */
export function equipmentFootprint(equipment: Equipment): Polygon {
  const halfWidth = divideLength(equipment.width, 2);
  const halfDepth = divideLength(equipment.depth, 2);
  const { origin } = equipment;

  const corners: Vec2[] = [
    vec2(subLengths(origin.x, halfWidth), subLengths(origin.y, halfDepth)),
    vec2(addLengths(origin.x, halfWidth), subLengths(origin.y, halfDepth)),
    vec2(addLengths(origin.x, halfWidth), addLengths(origin.y, halfDepth)),
    vec2(subLengths(origin.x, halfWidth), addLengths(origin.y, halfDepth)),
  ];

  if (equipment.rotation === 0) return corners;
  return corners.map((corner) => rotateVec2About(corner, origin, equipment.rotation));
}

/** True when the component hangs below the joists and so eats clear height under it. */
export function intrudesOnClearHeight(equipment: Equipment): boolean {
  return equipment.dropBelowJoists !== null && equipment.dropBelowJoists > 0;
}

export function equipmentLabel(equipment: Equipment): string {
  return EQUIPMENT_DEFAULTS[equipment.equipmentType].label;
}

export function equipmentDiscipline(
  equipment: Equipment,
): EquipmentDefault['discipline'] {
  return EQUIPMENT_DEFAULTS[equipment.equipmentType].discipline;
}

/** Move a component by a delta. */
export function translateEquipment(equipment: Equipment, delta: Vec2): Equipment {
  return { ...equipment, origin: addVec2(equipment.origin, delta) };
}
