import { captureOwnDataRecord } from '../model/ownDataRecord';
import { isFaceReferenceKeyV2 } from './kernel.semantic-references';
import type { BodyReference, ExtrudeEndCondition, PlaneSupport, SurfaceOffset, Vec3 } from './kernel.types';

function identifier(value: unknown, label: string, controls = true): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128 || controls && /[\x00-\x1f\x7f]/.test(value)) {
    throw Error(`${label}: identificador no válido.`);
  }
  return value;
}
function bodyReference(value: unknown, label: string): BodyReference {
  const fields = captureOwnDataRecord(value, ['bodyId', 'sourceFeatureId'], ['bodyId', 'sourceFeatureId'], label);
  return { bodyId: identifier(fields.get('bodyId'), `${label}.bodyId`), sourceFeatureId: identifier(fields.get('sourceFeatureId'), `${label}.sourceFeatureId`) };
}
function target(value: unknown, label: string): PlaneSupport {
  const fields = captureOwnDataRecord(value, ['kind', 'plane', 'planeId', 'face'], ['kind'], label);
  if (fields.get('kind') === 'principal' && fields.size === 2 && ['XY', 'XZ', 'YZ'].includes(fields.get('plane') as string)) {
    return { kind: 'principal', plane: fields.get('plane') as 'XY' | 'XZ' | 'YZ' };
  }
  if (fields.get('kind') === 'plane' && fields.size === 2 && fields.has('planeId')) {
    return { kind: 'plane', planeId: identifier(fields.get('planeId'), `${label}.planeId`, false) };
  }
  if (fields.get('kind') === 'face' && fields.size === 2 && fields.has('face')) {
    const face = captureOwnDataRecord(fields.get('face'), ['sourceFeatureId', 'key'], ['sourceFeatureId', 'key'], `${label}.face`);
    const key = face.get('key');
    if (typeof key !== 'string' || key.length > 4096 || /[\x00-\x1f\x7f]/.test(key)
      || !isFaceReferenceKeyV2(key) && (!key.startsWith('face-v1|') || key.length <= 8)) throw Error(`${label}.face.key: referencia no compatible.`);
    return { kind: 'face', face: { sourceFeatureId: identifier(face.get('sourceFeatureId'), `${label}.face.sourceFeatureId`, isFaceReferenceKeyV2(key)), key } };
  }
  throw Error(`${label}: soporte no válido.`);
}

/** Offsets use document millimetres. Read only declared own data on both branches. */
export function validateSurfaceOffset(value: unknown, label: string): SurfaceOffset {
  const fields = captureOwnDataRecord(value, ['construction', 'signedDistanceMm', 'translationWorldMm'], ['construction'], label);
  const scalar = (raw: unknown): number => {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || Math.abs(raw) > 1_000_000) throw Error(label + ': desplazamiento fuera de rango.');
    return raw;
  };
  if (fields.size === 2 && fields.get('construction') === 'normal' && fields.has('signedDistanceMm')) {
    return { construction: 'normal', signedDistanceMm: scalar(fields.get('signedDistanceMm')) };
  }
  if (fields.size === 2 && fields.get('construction') === 'translation') {
    const raw = fields.get('translationWorldMm');
    if (Array.isArray(raw) && Object.getPrototypeOf(raw) === Array.prototype && raw.length === 3 && Reflect.ownKeys(raw).length === 4) {
      const components = [0, 1, 2].map(index => {
        const d = Object.getOwnPropertyDescriptor(raw, index);
        if (!d?.enumerable || !('value' in d)) throw Error(label + ': componente de vector no válida.');
        return scalar(d.value);
      }) as Vec3;
      return { construction: 'translation', translationWorldMm: components };
    }
  }
  throw Error(label + ': construcción de desplazamiento no válida.');
}

/** Strict detached end data, including retained inactive references. No native resolution. */
export function validateExtrusionEndCondition(value: unknown, label = 'Condición final'): ExtrudeEndCondition {
  const fields = captureOwnDataRecord(value, ['kind', 'baseFeatureId', 'bothDirections', 'baseBody', 'target', 'offset'], ['kind'], label);
  const kind = fields.get('kind');
  if (kind === 'upToSurface' && fields.size === (fields.has('offset') ? 3 : 2) && fields.has('target')) {
    return { kind, target: target(fields.get('target'), label + '.target'),
      ...(fields.has('offset') ? { offset: validateSurfaceOffset(fields.get('offset'), label + '.offset') } : {}) };
  }
  if (fields.has('offset')) throw Error(label + ': desplazamiento incompatible con esta condición.');
  if (kind !== 'throughAll' && kind !== 'untilNext') throw Error(`${label}: condición final desconocida.`);
  if (!fields.has('baseFeatureId') || fields.has('target') || kind === 'untilNext' && fields.has('bothDirections')
    || kind === 'throughAll' && typeof fields.get('bothDirections') !== 'boolean') throw Error(`${label}: campos de límite no válidos.`);
  const baseFeatureId = identifier(fields.get('baseFeatureId'), `${label}.baseFeatureId`);
  const base = fields.has('baseBody') ? { baseBody: bodyReference(fields.get('baseBody'), `${label}.baseBody`) } : {};
  return kind === 'throughAll' ? { kind, baseFeatureId, bothDirections: fields.get('bothDirections') as boolean, ...base }
    : { kind, baseFeatureId, ...base };
}
