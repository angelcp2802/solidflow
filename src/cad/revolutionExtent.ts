import type { RevolveFeature } from './kernel.types';
import { captureOwnDataRecord } from '../model/ownDataRecord';

export interface ResolvedRevolutionExtent {
  kind: 'one-direction' | 'two-directions' | 'mid-plane';
  /** Angular interval relative to the resolved directed axis, in degrees. */
  startAngle: number;
  sweepAngle: number;
  /** Mid-plane deliberately ignores the stored reverse flag. */
  reversed: boolean;
  /** Null preserves the exact existing descriptor; dimensions do not identify topology. */
  identity: readonly unknown[] | null;
}

/** Pure admission shared by geometry and its structural reference descriptor. */
export function resolveRevolutionExtent(feature: Pick<RevolveFeature, 'angle' | 'extent' | 'reversed'>): ResolvedRevolutionExtent {
  const angle = feature.angle;
  if (!Number.isFinite(angle) || angle < 0 || angle > 360) throw new Error(Object.hasOwn(feature, 'extent')
    ? 'El ángulo de revolución debe estar entre 0° y 360°.'
    : 'El ángulo de revolución debe ser mayor que 0° y como máximo 360°.');
  if (Object.hasOwn(feature, 'reversed') && typeof feature.reversed !== 'boolean') throw new Error('El sentido inverso de revolución debe ser booleano.');
  if (!Object.hasOwn(feature, 'extent')) {
    if (angle === 0) throw new Error('El ángulo de revolución debe ser mayor que 0° y como máximo 360°.');
    return { kind: 'one-direction', startAngle: 0, sweepAngle: angle, reversed: feature.reversed === true, identity: null };
  }
  const raw = captureOwnDataRecord(feature.extent, ['kind', 'secondAngle'], ['kind'], 'Extensión de revolución');
  if (raw.get('kind') === 'mid-plane') {
    if (raw.has('secondAngle') || angle === 0) throw new Error('Plano medio requiere un ángulo total mayor que 0° y como máximo 360°, sin segundo ángulo.');
    return { kind: 'mid-plane', startAngle: -angle / 2, sweepAngle: angle, reversed: false,
      identity: ['revolution-extent-v1', 'mid-plane', angle === 360] };
  }
  if (raw.get('kind') !== 'two-directions') throw new Error('La extensión de revolución no es válida.');
  const secondAngle = raw.get('secondAngle');
  if (typeof secondAngle !== 'number' || !Number.isFinite(secondAngle) || secondAngle < 0 || secondAngle > 360
    || angle + secondAngle <= 0 || angle + secondAngle > 360) {
    throw new Error('Los ángulos de ambas direcciones deben estar entre 0° y 360° y sumar más de 0° y como máximo 360°.');
  }
  return { kind: 'two-directions', startAngle: secondAngle === 0 ? 0 : -secondAngle,
    sweepAngle: angle + secondAngle, reversed: feature.reversed === true,
    identity: ['revolution-extent-v1', 'two-directions', angle + secondAngle === 360] };
}
