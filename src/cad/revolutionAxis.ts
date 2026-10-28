import type { BodyReference, EdgeReference, PlaneFrame, RevolveFeature, SketchFeature, Vec3 } from './kernel.types';
import { frameDot, framePoint, frameYDirection } from './kernel.frames';
import { captureOwnDataRecord } from '../model/ownDataRecord';
import { isEdgeReferenceKeyV2 } from './kernel.semantic-references';

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

/** Build-local source geometry, never a saved coordinate witness. */
export interface RevolutionAxisSource {
  origin: Vec3;
  direction: Vec3;
  identity: readonly unknown[];
}
export interface RevolutionAxisSources {
  sketchLine(sketchId: string, entityId: string): RevolutionAxisSource;
  linearEdge(edge: EdgeReference, body: BodyReference | null): RevolutionAxisSource;
}

const COPLANAR_LENGTH = 1e-7;
const COPLANAR_ANGLE = 1e-8;
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('La referencia del eje de revolución no es válida.');
  }
  return value;
}
function sourceEdge(value: unknown): EdgeReference {
  const fields = captureOwnDataRecord(value, ['sourceFeatureId', 'key'], undefined, 'Arista del eje de revolución');
  const key = fields.get('key');
  if (typeof key !== 'string' || key.length > 4096 || /[\u0000-\u001f\u007f]/.test(key)
    || !(isEdgeReferenceKeyV2(key) || key.startsWith('edge-v1|') && key.length > 8)) {
    throw new Error('La referencia de arista del eje de revolución no es válida.');
  }
  return { sourceFeatureId: identifier(fields.get('sourceFeatureId')), key };
}
function sourceBody(value: unknown): BodyReference | null {
  if (value === null) return null;
  const fields = captureOwnDataRecord(value, ['bodyId', 'sourceFeatureId'], undefined, 'Cuerpo del eje de revolución');
  return { bodyId: identifier(fields.get('bodyId')), sourceFeatureId: identifier(fields.get('sourceFeatureId')) };
}

function worldAxisInProfile(source: RevolutionAxisSource, frame: PlaneFrame): {
  localOrigin: Point2; localDirection: Point2; origin: Vec3; direction: Vec3;
} {
  if ([frame.origin, frame.normal, frame.xDirection, source.origin, source.direction]
    .some(vector => !Array.isArray(vector) || vector.length !== 3 || ![0, 1, 2].every(index => Number.isFinite(vector[index])))) {
    throw new Error('El marco del eje de revolución no es válido.');
  }
  const y = frameYDirection(frame);
  if (![...frame.origin, ...frame.normal, ...frame.xDirection, ...y, ...source.origin, ...source.direction].every(Number.isFinite)
    || [frame.normal, frame.xDirection, y].some(vector => Math.abs(Math.hypot(...vector) - 1) > COPLANAR_ANGLE)
    || Math.abs(frameDot(frame.normal, frame.xDirection)) > COPLANAR_ANGLE) {
    throw new Error('El marco del eje de revolución no es válido.');
  }
  const length = Math.hypot(...source.direction);
  if (!Number.isFinite(length) || Math.abs(length - 1) > 1e-6) throw new Error('La dirección del eje de revolución no es unitaria.');
  const direction = source.direction.map(value => value / length) as Vec3;
  const delta = source.origin.map((value, index) => value - frame.origin[index]) as Vec3;
  if (!delta.every(Number.isFinite)) throw new Error('El origen del eje de revolución no es finito en el marco del perfil.');
  // Admission precedes the local coordinate calculation. The actual world line
  // is retained; an out-of-plane source is never replaced by its projection.
  if (Math.abs(frameDot(delta, frame.normal)) > COPLANAR_LENGTH
    || Math.abs(frameDot(direction, frame.normal)) > COPLANAR_ANGLE) {
    throw new Error('El eje de revolución debe estar contenido en el plano del perfil.');
  }
  const localDirection: Point2 = [frameDot(direction, frame.xDirection), frameDot(direction, y)];
  const projectedLength = Math.hypot(...localDirection);
  const localOrigin: Point2 = [frameDot(delta, frame.xDirection), frameDot(delta, y)];
  if (!localOrigin.every(Number.isFinite) || !Number.isFinite(projectedLength) || projectedLength < 1e-12) {
    throw new Error('El eje de revolución no tiene coordenadas válidas en el perfil.');
  }
  return { localOrigin,
    localDirection: [localDirection[0] / projectedLength, localDirection[1] / projectedLength],
    origin: [...source.origin], direction };
}

/** Admit build-local solved sources and map their axis into the profile. No native objects. */
export function resolveRevolutionAxis(feature: Pick<RevolveFeature, 'axis' | 'reversed'>,
  sketch: SketchFeature, frame: PlaneFrame, sources?: RevolutionAxisSources): ResolvedRevolutionAxis {
  const reverseField = Object.getOwnPropertyDescriptor(feature, 'reversed');
  if (reverseField && (!('value' in reverseField) || typeof reverseField.value !== 'boolean')) {
    throw new Error('El sentido inverso de revolución debe ser booleano.');
  }
  const reversed = reverseField?.value === true;
  const axisField = Object.getOwnPropertyDescriptor(feature, 'axis');
  if (axisField && (!('value' in axisField) || !axisField.enumerable)) throw new Error('El eje de revolución no es un campo de datos válido.');
  const axis = axisField ? captureOwnDataRecord(axisField.value, ['kind', 'axis', 'entityId', 'sketchId', 'edge', 'body'], ['kind'], 'Eje de revolución') : null;
  const kind = axis?.get('kind');
  const exact = (keys: readonly string[]) => {
    if (!axis || axis.size !== keys.length || keys.some(key => !axis.has(key))) throw new Error('El eje de revolución contiene campos incompatibles.');
  };
  let localOrigin: Point2 = [0, 0], localDirection: Point2 = [0, 1];
  let worldSource: RevolutionAxisSource | undefined;
  if (axis) {
    if (kind === 'sketch-axis') {
      exact(['kind', 'axis']);
      if (!['x', 'y'].includes(axis.get('axis') as string)) {
        throw new Error('Selecciona el eje X o Y del croquis para la revolución.');
      }
      localDirection = axis.get('axis') === 'x' ? [1, 0] : [0, 1];
    } else if (kind === 'sketch-line') {
      exact(['kind', 'entityId']);
      const entityId = identifier(axis.get('entityId'));
      if (sketch.profile.kind !== 'entities') {
        throw new Error('Selecciona una línea del mismo croquis como eje de revolución.');
      }
      const profile = sketch.profile;
      const matches = profile.entities.filter(entity => entity.id === entityId);
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
    } else if (kind === 'principal-axis') {
      exact(['kind', 'axis']);
      const name = axis.get('axis');
      if (name !== 'X' && name !== 'Y' && name !== 'Z') throw new Error('Selecciona un eje principal X, Y o Z.');
      worldSource = { origin: [0, 0, 0], direction: name === 'X' ? [1, 0, 0] : name === 'Y' ? [0, 1, 0] : [0, 0, 1],
        identity: ['principal-axis', name] };
    } else if (kind === 'external-sketch-line') {
      exact(['kind', 'sketchId', 'entityId']);
      const sketchId = identifier(axis.get('sketchId')), entityId = identifier(axis.get('entityId'));
      if (!sources) throw new Error('No se encuentra el croquis resuelto anterior del eje de revolución.');
      worldSource = sources.sketchLine(sketchId, entityId);
    } else if (kind === 'linear-edge') {
      exact(['kind', 'edge', 'body']);
      const edge = sourceEdge(axis.get('edge')), body = sourceBody(axis.get('body'));
      if (!sources) throw new Error('No se encuentra la arista nativa anterior del eje de revolución.');
      worldSource = sources.linearEdge(edge, body);
    } else throw new Error('El tipo de eje de revolución no es válido.');
  }
  if (worldSource) {
    const resolved = worldAxisInProfile(worldSource, frame);
    return { ...resolved, direction: resolved.direction.map(value => value * (reversed ? -1 : 1)) as Vec3,
      radialDirection: [resolved.localDirection[1], -resolved.localDirection[0]], legacy: false,
      identity: ['revolution-axis-v2', structuredClone(worldSource.identity), reversed] };
  }
  const origin = framePoint(frame, ...localOrigin), y = frameYDirection(frame);
  const direction = frame.xDirection.map((value, index) =>
    (value * localDirection[0] + y[index] * localDirection[1]) * (reversed ? -1 : 1)) as Vec3;
  if (![...origin, ...direction].every(Number.isFinite) || Math.abs(Math.hypot(...direction) - 1) > 1e-6) {
    throw new Error('El marco del eje de revolución no es válido.');
  }
  return { localOrigin, localDirection, radialDirection: [localDirection[1], -localDirection[0]], origin, direction,
    legacy: !axisField && !reversed,
    identity: ['revolution-axis-v1', kind === 'sketch-line' ? ['sketch-line', axis!.get('entityId')]
      : ['sketch-axis', axis?.get('axis') ?? 'y'], reversed] };
}

export function revolutionRadialCoordinate(point: readonly number[], axis: ResolvedRevolutionAxis): number {
  return (point[0] - axis.localOrigin[0]) * axis.radialDirection[0]
    + (point[1] - axis.localOrigin[1]) * axis.radialDirection[1];
}
