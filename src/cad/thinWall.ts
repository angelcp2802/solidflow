import type { ThinWallDefinition } from './kernel.types';
import { captureOwnDataRecord } from '../model/ownDataRecord';

export const MIN_THIN_WALL_THICKNESS = 1e-7;
export const MAX_THIN_WALL_THICKNESS = 100_000;

function thickness(value: unknown, label: string, noun = 'el espesor'): number {
  if (typeof value !== 'number' || !Number.isFinite(value)
    || value <= MIN_THIN_WALL_THICKNESS || value > MAX_THIN_WALL_THICKNESS) {
    throw new Error(`${label}: ${noun} debe ser mayor que ${MIN_THIN_WALL_THICKNESS} mm y como máximo ${MAX_THIN_WALL_THICKNESS} mm.`);
  }
  return value;
}

/** Strict detached declaration; no property access or numeric coercion is used. */
export function validateThinWallDefinition(value: unknown, label = 'Operación de pared delgada'): ThinWallDefinition {
  const fields = captureOwnDataRecord(value, ['kind', 'thickness', 'reversed', 'firstThickness', 'secondThickness', 'autoCorners'], ['kind'], label);
  let options: Pick<ThinWallDefinition, 'autoCorners'> = {};
  if (fields.has('autoCorners')) {
    const corner = captureOwnDataRecord(fields.get('autoCorners'), ['enabled', 'radius'], ['enabled', 'radius'], `${label}.autoCorners`);
    if (typeof corner.get('enabled') !== 'boolean') throw new Error(`${label}.autoCorners: la activación debe ser booleana.`);
    options = { autoCorners: { enabled: corner.get('enabled') as boolean,
      radius: thickness(corner.get('radius'), `${label}.autoCorners.radius`, 'el radio') } };
  }
  const count = fields.size - (fields.has('autoCorners') ? 1 : 0);
  const kind = fields.get('kind');
  if (kind === 'one-side') {
    if (count !== 3 || !fields.has('thickness') || !fields.has('reversed') || typeof fields.get('reversed') !== 'boolean') {
      throw new Error(`${label}: un lado requiere solo espesor y sentido inverso booleano.`);
    }
    return { kind, thickness: thickness(fields.get('thickness'), `${label}.thickness`), reversed: fields.get('reversed') as boolean, ...options };
  }
  if (kind === 'mid-plane') {
    if (count !== 2 || !fields.has('thickness')) throw new Error(`${label}: plano medio requiere solo el espesor total.`);
    return { kind, thickness: thickness(fields.get('thickness'), `${label}.thickness`), ...options };
  }
  if (kind === 'two-sides') {
    if (count !== 3 || !fields.has('firstThickness') || !fields.has('secondThickness')) {
      throw new Error(`${label}: dos lados requiere los dos espesores.`);
    }
    const firstThickness = thickness(fields.get('firstThickness'), `${label}.firstThickness`);
    const secondThickness = thickness(fields.get('secondThickness'), `${label}.secondThickness`);
    if (firstThickness + secondThickness > MAX_THIN_WALL_THICKNESS) {
      throw new Error(`${label}: el espesor total no puede superar ${MAX_THIN_WALL_THICKNESS} mm.`);
    }
    return { kind, firstThickness, secondThickness, ...options };
  }
  throw new Error(`${label}: modo de pared delgada desconocido.`);
}

function thinWallDescriptor(feature: object): PropertyDescriptor | undefined {
  const field = Object.getOwnPropertyDescriptor(feature, 'thinWall');
  if (field && (!field.enumerable || !('value' in field))) {
    throw new Error('Pared delgada: el campo debe ser un dato propio enumerable, sin funciones de acceso.');
  }
  return field;
}

/** Only absence disables the wall. Explicit undefined/null is invalid raw input. */
export function readThinWall(feature: object, label?: string): ThinWallDefinition | undefined {
  const field = thinWallDescriptor(feature);
  return field ? validateThinWallDefinition(field.value, label) : undefined;
}

export interface ResolvedThinWall {
  definition: ThinWallDefinition;
  /** Abstract offsets from the builder's canonical directed planar chain. */
  positive: number;
  negative: number;
  /** Continuous thicknesses do not identify topology. */
  identity: readonly unknown[];
}

export function resolveThinWall(feature: object): ResolvedThinWall | undefined {
  const definition = readThinWall(feature);
  if (!definition) return undefined;
  const cornerIdentity = definition.autoCorners ? [['auto-corners-v1', definition.autoCorners.enabled]] : [];
  if (definition.kind === 'one-side') return {
    definition,
    positive: definition.reversed ? 0 : definition.thickness,
    negative: definition.reversed ? definition.thickness : 0,
    identity: ['thin-wall-v1', definition.kind, definition.reversed, ...cornerIdentity],
  };
  if (definition.kind === 'mid-plane') return {
    definition, positive: definition.thickness / 2, negative: definition.thickness / 2,
    identity: ['thin-wall-v1', definition.kind, ...cornerIdentity],
  };
  return {
    definition, positive: definition.firstThickness, negative: definition.secondThickness,
    identity: ['thin-wall-v1', definition.kind, 'first-positive', 'second-negative', ...cornerIdentity],
  };
}

/** Draft clearing deletes the optional field instead of persisting own undefined. */
export function mergeThinWallDraft<T extends object>(feature: T, patch: Partial<T> & { thinWall?: ThinWallDefinition }): T {
  readThinWall(feature);
  const field = thinWallDescriptor(patch);
  const definition = field && field.value !== undefined ? validateThinWallDefinition(field.value) : undefined;
  const merged = { ...feature, ...patch };
  if (field) {
    if (definition) Object.assign(merged, { thinWall: definition });
    else delete (merged as { thinWall?: ThinWallDefinition }).thinWall;
  }
  return merged;
}
