import { captureOwnDataRecord } from '../model/ownDataRecord';
import type { ExtrudeFeature } from './kernel.types';

export type SecondDirection = NonNullable<ExtrudeFeature['secondDirection']>;
const MIN_DEPTH = .01, MAX_DEPTH = 100_000;

export function validateSecondDirection(value: unknown, label = 'Segunda dirección'): SecondDirection {
  const fields = captureOwnDataRecord(value, ['enabled', 'depth'], ['enabled', 'depth'], label);
  const enabled = fields.get('enabled'), depth = fields.get('depth');
  if (typeof enabled !== 'boolean') throw new Error(`${label}: la activación debe ser booleana.`);
  if (typeof depth !== 'number' || !Number.isFinite(depth) || depth < MIN_DEPTH || depth > MAX_DEPTH) {
    throw new Error(`${label}: la profundidad debe estar entre 0.01 y 100000 mm.`);
  }
  return { enabled, depth };
}

function directionDescriptor(feature: object): PropertyDescriptor | undefined {
  const field = Object.getOwnPropertyDescriptor(feature, 'secondDirection');
  if (field && (!field.enumerable || !('value' in field))) {
    throw new Error('Segunda dirección: el campo debe ser un dato propio enumerable, sin funciones de acceso.');
  }
  return field;
}

/** Raw declarations permit absence only, never explicit undefined or null. */
export function readSecondDirection(feature: object, label?: string): SecondDirection | undefined {
  const field = directionDescriptor(feature);
  return field ? validateSecondDirection(field.value, label) : undefined;
}

/** Validate before the document editor spreads a patch; own undefined means clear. */
export function readSecondDirectionDraft(feature: object): SecondDirection | undefined {
  const field = directionDescriptor(feature);
  return field && field.value !== undefined ? validateSecondDirection(field.value) : undefined;
}

/** Validate active context before provisional automatic tools or absence witnesses. */
export function assertExtrusionDirectionContext(feature: object): void {
  const direction = readSecondDirection(feature);
  if (!direction) return;
  const type = Object.getOwnPropertyDescriptor(feature, 'type');
  if (type && (!('value' in type) || type.value !== 'extrude' && type.value !== 'cut')) {
    throw new Error('La segunda dirección solo corresponde a extrusiones lineales de material o corte.');
  }
  if (!direction.enabled) return;
  const symmetry = Object.getOwnPropertyDescriptor(feature, 'symmetric');
  const end = Object.getOwnPropertyDescriptor(feature, 'endCondition');
  if (!symmetry?.enumerable || !('value' in symmetry) || symmetry.value !== false
    || !end && 'endCondition' in feature
    || end && (!end.enumerable || !('value' in end) || end.value !== undefined)) {
    throw new Error('La segunda dirección requiere profundidad ciega y un solo sentido por rama; desactiva el plano medio y las condiciones automáticas.');
  }
}

export interface ResolvedExtrusionSpan {
  /** Signed shift along the incoming sketch normal, applied exactly once. */
  startShift: number;
  signedDepth: number;
  /** Null preserves legacy descriptors. No continuous dimension identifies topology. */
  identity: readonly unknown[] | null;
}

export function resolveExtrusionSpan(feature: Pick<ExtrudeFeature, 'depth' | 'symmetric' | 'secondDirection'> & { endCondition?: unknown },
  validatePrimary = true): ResolvedExtrusionSpan {
  assertExtrusionDirectionContext(feature);
  const direction = readSecondDirection(feature), depth = feature.depth;
  const minimum = validatePrimary ? MIN_DEPTH : 1e-7, maximum = validatePrimary ? MAX_DEPTH : 10_000_000;
  if (typeof depth !== 'number' || !Number.isFinite(depth) || Math.abs(depth) < minimum || Math.abs(depth) > maximum
    || typeof feature.symmetric !== 'boolean') throw new Error('La profundidad principal y el indicador de plano medio deben ser válidos.');
  if (!direction?.enabled) return { startShift: feature.symmetric ? -depth / 2 : 0, signedDepth: depth,
    identity: direction ? ['second-direction-v1', false] : null };
  const total = Math.abs(depth) + direction.depth;
  if (!Number.isFinite(total) || total > 2 * MAX_DEPTH) throw new Error('La profundidad total de ambas direcciones no puede superar 200000 mm.');
  return { startShift: -Math.sign(depth) * direction.depth, signedDepth: Math.sign(depth) * total,
    identity: ['second-direction-v1', true] };
}
