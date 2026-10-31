import { captureOwnDataRecord } from '../model/ownDataRecord';
import { isFaceReferenceKeyV2 } from './kernel.semantic-references';
import type { BodyReference, ExtrudeEndCondition, PlaneSupport } from './kernel.types';

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

/** Strict detached end data, including retained inactive references. No native resolution. */
export function validateExtrusionEndCondition(value: unknown, label = 'Condición final'): ExtrudeEndCondition {
  const fields = captureOwnDataRecord(value, ['kind', 'baseFeatureId', 'bothDirections', 'baseBody', 'target'], ['kind'], label);
  const kind = fields.get('kind');
  if (kind === 'upToSurface' && fields.size === 2 && fields.has('target')) return { kind, target: target(fields.get('target'), `${label}.target`) };
  if (kind !== 'throughAll' && kind !== 'untilNext') throw Error(`${label}: condición final desconocida.`);
  if (!fields.has('baseFeatureId') || fields.has('target') || kind === 'untilNext' && fields.has('bothDirections')
    || kind === 'throughAll' && typeof fields.get('bothDirections') !== 'boolean') throw Error(`${label}: campos de límite no válidos.`);
  const baseFeatureId = identifier(fields.get('baseFeatureId'), `${label}.baseFeatureId`);
  const base = fields.has('baseBody') ? { baseBody: bodyReference(fields.get('baseBody'), `${label}.baseBody`) } : {};
  return kind === 'throughAll' ? { kind, baseFeatureId, bothDirections: fields.get('bothDirections') as boolean, ...base }
    : { kind, baseFeatureId, ...base };
}
