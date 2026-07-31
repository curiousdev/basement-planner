import type { Length, Vec2 } from '@basement/geometry';
import { z } from 'zod';

/**
 * Zod is the single source of truth for persisted shapes; the TypeScript types below are
 * derived with `z.infer` rather than hand-written alongside.
 *
 * `Length` and `Vec2` are branded types from `geometry`, so they are declared with
 * `z.custom` — that validates the real invariant (a safe integer count of 1/32") and
 * yields the branded type directly, instead of zod's own brand, which would be a
 * different and incompatible type.
 */
export const LengthSchema = z.custom<Length>(
  (value) => typeof value === 'number' && Number.isSafeInteger(value),
  { message: 'Expected an integer count of 1/32 inch' },
);

export const Vec2Schema: z.ZodType<Vec2> = z.object({
  x: LengthSchema,
  y: LengthSchema,
});

/** The current `.bsmt` schema version. Bumping this requires a migration and a fixture. */
export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------

/**
 * Wall assemblies, with the thickness each one actually builds out to. A 2x4 partition
 * is 4-1/2" finished, not 3-1/2" — the studs are 3-1/2" and the gypsum adds 1/2" a side.
 * Thickness stays an explicit field so an unusual assembly is representable.
 */
export const WallAssemblySchema = z.enum([
  'foundation',
  'partition-2x4',
  'partition-2x6',
  'furring',
]);

export const WallSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('wall'),
  /** Centreline. Faces are derived — see `wallFaces`. */
  start: Vec2Schema,
  end: Vec2Schema,
  thickness: LengthSchema,
  assembly: WallAssemblySchema,
  /** Existing walls are drawn differently and are never silently regularised. */
  existing: z.boolean(),
});

// ---------------------------------------------------------------------------
// Openings
// ---------------------------------------------------------------------------

export const OpeningTypeSchema = z.enum([
  'door',
  'window',
  'egress-window',
  'cased-opening',
]);

export const SwingSchema = z.enum(['left', 'right', 'none']);

export const OpeningSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('opening'),
  /** The wall that hosts this opening. Deleting that wall must resolve this reference. */
  wallId: z.string().min(1),
  /**
   * Distance from the host wall's `start` to the centre of the opening, measured along
   * the centreline. Openings are positioned by wall parameter rather than in world
   * coordinates, so moving a wall carries its doors with it.
   */
  position: LengthSchema,
  width: LengthSchema,
  height: LengthSchema,
  /** Height of the sill above the finished floor. Zero for a door. */
  sillHeight: LengthSchema,
  openingType: OpeningTypeSchema,
  swing: SwingSchema,
  /**
   * R310 measures the actual openable area with the sash in its fully open position,
   * which is smaller than the window unit — a 36x48 window does not give a 36x48
   * opening. These are null for anything that is not an escape opening, and they are
   * stored rather than derived because only the manufacturer knows them.
   */
  netClearWidth: LengthSchema.nullable(),
  netClearHeight: LengthSchema.nullable(),
});

// ---------------------------------------------------------------------------
// Equipment (mechanical, plumbing, and the fixed things already down there)
// ---------------------------------------------------------------------------

export const EquipmentTypeSchema = z.enum([
  'supply-register',
  'return-grille',
  'duct-trunk',
  'furnace',
  'water-heater',
  'bath-exhaust',
  'dryer-vent',
  'sump-pump',
  'electrical-panel',
]);

export const EquipmentSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('equipment'),
  equipmentType: EquipmentTypeSchema,
  /** Centre of the footprint, in world coordinates. */
  origin: Vec2Schema,
  width: LengthSchema,
  depth: LengthSchema,
  /** Radians, counter-clockwise from +x. */
  rotation: z.number(),
  /**
   * How far the component hangs below the joists. Ducts and trunks eat clear height
   * under them and not beside them, which is why clear height is a field over the floor
   * plan rather than a single number. Null for anything that sits on the slab.
   */
  dropBelowJoists: LengthSchema.nullable(),
});

export const EntitySchema = z.discriminatedUnion('kind', [
  WallSchema,
  OpeningSchema,
  EquipmentSchema,
]);

export const BasementModelSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  entities: z.record(z.string(), EntitySchema),
});

export type WallAssembly = z.infer<typeof WallAssemblySchema>;
export type Wall = z.infer<typeof WallSchema>;
export type OpeningType = z.infer<typeof OpeningTypeSchema>;
export type Swing = z.infer<typeof SwingSchema>;
export type Opening = z.infer<typeof OpeningSchema>;
export type EquipmentType = z.infer<typeof EquipmentTypeSchema>;
export type Equipment = z.infer<typeof EquipmentSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type BasementModel = z.infer<typeof BasementModelSchema>;
export type EntityKind = Entity['kind'];
