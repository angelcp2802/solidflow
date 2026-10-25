import type { PlaneFrame, RevolveFeature, SketchFeature, Vec3 } from './kernel.types';
import { framePoint, frameYDirection } from './kernel.frames';

type Point2 = [number, number];
export interface ResolvedRevolutionAxis {
  localOrigin: Point2;
  localDirection: Point2;
  radialDirection: Point2;
  origin: Vec3;
  direction: Vec3;
  legacy: boolean;
  identity: readonly unknown[];
}

/** Resolves only current, already-solved sketch coordinates. No native objects. */
export function resolveRevolutionAxis(feature: Pick<RevolveFeature, 'axis' | 'reversed'>,
  sketch: SketchFeature, frame: PlaneFrame): ResolvedRevolutionAxis {
  if (Object.hasOwn(feature, 'reversed') && typeof feature.reversed !== 'boolean') {
    throw new Error('El sentido inverso de revolución debe ser booleano.');
  }
  const axis = feature.axis;
  let localOrigin: Point2 = [0, 0], localDirection: Point2 = [0, 1];
  if (Object.hasOwn(feature, 'axis')) {
    if (!axis || typeof axis !== 'object' || Array.isArray(axis)) throw new Error('El eje de revolución no es válido.');
    if (axis.kind === 'sketch-axis') {
      if (Object.keys(axis).some(key => !['kind', 'axis'].includes(key)) || !['x', 'y'].includes(axis.axis)) {
        throw new Error('Selecciona el eje X o Y del croquis para la revolución.');
      }
      localDirection = axis.axis === 'x' ? [1, 0] : [0, 1];
    } else if (axis.kind === 'sketch-line') {
      if (Object.keys(axis).some(key => !['kind', 'entityId'].includes(key)) || typeof axis.entityId !== 'string'
        || !axis.entityId.trim() || axis.entityId.length > 128 || /[\u0000-\u001f\u007f]/.test(axis.entityId) || sketch.profile.kind !== 'entities') {
        throw new Error('Selecciona una línea del mismo croquis como eje de revolución.');
      }
      const profile = sketch.profile;
      const matches = profile.entities.filter(entity => entity.id === axis.entityId);
      if (matches.length !== 1 || matches[0].type !== 'line') throw new Error('La línea del eje de revolución no existe o es ambigua.');
      const point = (id: string): Point2 => {
        const points = profile.points.filter(value => value.id === id);
        if (id === 'origin' && !points.length) return [0, 0];
        if (id === 'origin' || points.length !== 1 || !Number.isFinite(points[0].x) || !Number.isFinite(points[0].y)) {
          throw new Error('Los extremos de la línea del eje de revolución no son válidos.');
        }
        return [points[0].x, points[0].y];
      };
      localOrigin = point(matches[0].start);
      const end = point(matches[0].end), dx = end[0] - localOrigin[0], dy = end[1] - localOrigin[1];
      const length = Math.hypot(dx, dy);
      if (!Number.isFinite(length) || length <= 1e-5) throw new Error('La línea del eje de revolución tiene longitud nula o insuficiente.');
      localDirection = [dx / length, dy / length];
    } else throw new Error('El tipo de eje de revolución no es válido.');
  }
  const origin = framePoint(frame, ...localOrigin), y = frameYDirection(frame);
  const direction = frame.xDirection.map((value, index) =>
    (value * localDirection[0] + y[index] * localDirection[1]) * (feature.reversed ? -1 : 1)) as Vec3;
  if (![...origin, ...direction].every(Number.isFinite) || Math.abs(Math.hypot(...direction) - 1) > 1e-6) {
    throw new Error('El marco del eje de revolución no es válido.');
  }
  return { localOrigin, localDirection, radialDirection: [localDirection[1], -localDirection[0]], origin, direction,
    legacy: !Object.hasOwn(feature, 'axis') && !feature.reversed,
    identity: ['revolution-axis-v1', axis?.kind === 'sketch-line' ? ['sketch-line', axis.entityId]
      : ['sketch-axis', axis?.axis ?? 'y'], feature.reversed === true] };
}

export function revolutionRadialCoordinate(point: readonly number[], axis: ResolvedRevolutionAxis): number {
  return (point[0] - axis.localOrigin[0]) * axis.radialDirection[0]
    + (point[1] - axis.localOrigin[1]) * axis.radialDirection[1];
}
