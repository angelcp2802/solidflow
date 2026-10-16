import type { EntityProfile, SketchConstraint, SketchEntity } from '../sketch/types';
import { SKETCH_LIMITS, validateEntityProfile } from '../sketch/validation';
import type { EdgeReference, FaceReference, Plane, PlaneSupport, SketchSupport } from './kernel.types';
import { namingDigest } from './kernel.naming';

/** Experimental pure identity only. No document parser, native producer or v1 resolver is enabled here. */
export const SEMANTIC_PRISM_LIMITS = Object.freeze({ maxHistory: 256, maxSupportKey: 4096 });
export type PrismEntityTypeV2 = SketchEntity['type'];
export interface PrismMaterialRegionV2 {
  readonly outer: readonly string[];
  readonly holes: readonly (readonly string[])[];
}
export type PrismFaceRoleV2 =
  | { readonly role: 'startCap' | 'endCap' }
  | { readonly role: 'side'; readonly entityId: string; readonly entityType: PrismEntityTypeV2 };
export interface PrismEdgeRoleV2 {
  readonly role: 'startRim' | 'endRim';
  readonly entityId: string;
  readonly entityType: PrismEntityTypeV2;
}
export type PrismDirectionV2 = 'positive' | 'negative';

/** Deliberately narrower than Feature: standalone finite entity extrusion, with plane/sketch ancestry. */
export type PrismHistoryEntryV2 =
  | { readonly id: string; readonly type: 'plane'; readonly suppressed: boolean;
      readonly support: PlaneSupport; readonly reversed: boolean }
  | { readonly id: string; readonly type: 'sketch'; readonly suppressed: boolean;
      readonly plane: Plane; readonly support?: SketchSupport }
  | { readonly id: string; readonly type: 'extrude'; readonly suppressed: boolean;
      readonly sketchId: string; readonly symmetric: boolean; readonly direction: PrismDirectionV2 };
export interface EntityPrismContextV2 {
  /** Historical generating solid feature; also the reference's sourceFeatureId. */
  readonly sourceFeatureId: string;
  readonly sketchFeatureId: string;
  readonly history: readonly PrismHistoryEntryV2[];
}

/** Only identities built from checked discrete inputs are accepted by the factories below. */
export interface EntityPrismIdentityV2 {
  readonly sourceFeatureId: string;
  readonly lineageDigest: string;
}
interface IdentityData {
  direction: PrismDirectionV2;
  region: PrismMaterialRegionV2;
  entities: ReadonlyMap<string, PrismEntityTypeV2>;
}
const identities = new WeakMap<EntityPrismIdentityV2, IdentityData>();
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
function fail(message: string): never { throw new Error(`Identidad de prisma v2: ${message}`); }
const FACE_KEY = /^face-v2\|[0-9a-f]{64}$/;
const EDGE_KEY = /^edge-v2\|[0-9a-f]{64}$/;
export const isFaceReferenceKeyV2 = (value: unknown): boolean => typeof value === 'string' && value.length === 72 && FACE_KEY.test(value);
export const isEdgeReferenceKeyV2 = (value: unknown): boolean => typeof value === 'string' && value.length === 72 && EDGE_KEY.test(value);

function record(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('se esperaba un objeto.');
  const object = value as Record<string, unknown>;
  if (Reflect.ownKeys(object).some(key => typeof key !== 'string' || ![...required, ...optional].includes(key))) fail('campo desconocido.');
  if (required.some(key => !Object.hasOwn(object, key))) fail('falta un campo obligatorio.');
  return object;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128 || /[\x00-\x1f\x7f]/.test(value)) fail('identificador no válido.');
  return value as string;
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') fail('se esperaba verdadero o falso.');
  return value as boolean;
}
function list(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) fail('lista fuera del límite.');
  for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) fail('lista con elementos ausentes.');
  return value;
}
function plane(value: unknown): Plane {
  if (value !== 'XY' && value !== 'XZ' && value !== 'YZ') fail('plano principal no válido.');
  return value as Plane;
}
function direction(value: unknown): PrismDirectionV2 {
  if (value !== 'positive' && value !== 'negative') fail('sentido de extrusión no válido.');
  return value as PrismDirectionV2;
}

/** Exact support references are discrete ancestry. Frames/offsets/positions are never accepted. */
function supportDescriptor(value: unknown, seen: Map<string, PrismHistoryEntryV2>, active: boolean, sketchOnly: boolean): unknown[] {
  const initial = record(value, ['kind'], ['plane', 'planeId', 'face']);
  if (initial.kind === 'principal' && !sketchOnly) {
    const source = record(value, ['kind', 'plane']);
    return ['principal', plane(source.plane)];
  }
  if (initial.kind === 'plane') {
    const source = record(value, ['kind', 'planeId']);
    const id = identifier(source.planeId), owner = seen.get(id);
    if (!owner || owner.type !== 'plane' || (active && owner.suppressed)) fail('el soporte no es un plano histórico disponible.');
    return ['plane', id];
  }
  if (initial.kind === 'face') {
    const source = record(value, ['kind', 'face']), face = record(source.face, ['sourceFeatureId', 'key']);
    const id = identifier(face.sourceFeatureId), owner = seen.get(id), key = face.key;
    if (!owner || owner.type !== 'extrude' || (active && owner.suppressed)) fail('la cara no pertenece a una operación histórica disponible.');
    if (typeof key !== 'string' || key.length > SEMANTIC_PRISM_LIMITS.maxSupportKey || /[\x00-\x1f\x7f]/.test(key)
      || !(isFaceReferenceKeyV2(key) || (key.startsWith('face-v1|') && key.length > 8))) fail('clave de soporte de cara no válida.');
    return ['face', id, key];
  }
  return fail('tipo de soporte no compatible.');
}

function contextDescriptor(input: EntityPrismContextV2): { descriptor: unknown[]; direction: PrismDirectionV2; sourceFeatureId: string } {
  const source = record(input, ['sourceFeatureId', 'sketchFeatureId', 'history']);
  const sourceFeatureId = identifier(source.sourceFeatureId), sketchFeatureId = identifier(source.sketchFeatureId);
  const history = list(source.history, SEMANTIC_PRISM_LIMITS.maxHistory);
  if (!history.length || sourceFeatureId === sketchFeatureId) fail('ámbito histórico vacío o duplicado.');
  const seen = new Map<string, PrismHistoryEntryV2>(), descriptor: unknown[] = [];
  let operationDirection: PrismDirectionV2 | undefined;
  for (const [index, value] of history.entries()) {
    const entry = record(value, ['id', 'type', 'suppressed'], ['support', 'reversed', 'plane', 'sketchId', 'symmetric', 'direction']);
    const id = identifier(entry.id), suppressed = bool(entry.suppressed);
    if (seen.has(id)) fail('identificador histórico duplicado.');
    if (entry.type === 'plane') {
      record(value, ['id', 'type', 'suppressed', 'support', 'reversed']);
      descriptor.push([id, 'plane', suppressed, supportDescriptor(entry.support, seen, !suppressed, false), bool(entry.reversed)]);
    } else if (entry.type === 'sketch') {
      record(value, ['id', 'type', 'suppressed', 'plane'], ['support']);
      const principal = plane(entry.plane);
      const support = Object.hasOwn(entry, 'support') ? supportDescriptor(entry.support, seen, !suppressed, true) : ['principal', principal];
      descriptor.push([id, 'sketch', suppressed, principal, support]);
    } else if (entry.type === 'extrude') {
      record(value, ['id', 'type', 'suppressed', 'sketchId', 'symmetric', 'direction']);
      const sketchId = identifier(entry.sketchId), owner = seen.get(sketchId), signed = direction(entry.direction);
      if (!owner || owner.type !== 'sketch' || (!suppressed && owner.suppressed)) fail('croquis de origen histórico no disponible.');
      if (!suppressed && (id !== sourceFeatureId || index !== history.length - 1)) fail('sólo se admite una extrusión autónoma final, sin booleanos previos.');
      if (id === sourceFeatureId) {
        if (suppressed || sketchId !== sketchFeatureId || index !== history.length - 1) fail('la operación histórica no coincide con el origen.');
        operationDirection = signed;
      }
      descriptor.push([id, 'extrude', suppressed, sketchId, bool(entry.symmetric), signed]);
    } else fail('tipo de historia no compatible con una extrusión autónoma.');
    seen.set(id, value as PrismHistoryEntryV2);
  }
  if (!operationDirection || seen.get(sketchFeatureId)?.type !== 'sketch') fail('falta la extrusión histórica o su croquis de origen.');
  return { descriptor: [sourceFeatureId, sketchFeatureId, descriptor], direction: operationDirection, sourceFeatureId };
}

/** Smallest-ID rotation, then reversed traversal; no geometry or enumeration ordinal identifies a cycle. */
function canonicalCycle(ids: string[]): string[] {
  const smallest = ids.reduce((a, b) => compare(a, b) <= 0 ? a : b), index = ids.indexOf(smallest);
  const forward = [...ids.slice(index), ...ids.slice(0, index)];
  const reverse = [forward[0], ...forward.slice(1).reverse()];
  return compare(JSON.stringify(forward), JSON.stringify(reverse)) <= 0 ? forward : reverse;
}

function regionDescriptor(profile: EntityProfile, value: PrismMaterialRegionV2): PrismMaterialRegionV2 {
  const source = record(value, ['outer', 'holes']), entities = new Map(profile.entities.map(entity => [entity.id, entity]));
  const used = new Set<string>(), usedNodes = new Set<string>();
  const parent = new Map<string, string>([['origin', 'origin'], ...profile.points.map(point => [point.id, point.id] as [string, string])]);
  const root = (id: string): string => {
    let current = id;
    while (parent.get(current) !== current) current = parent.get(current)!;
    return current;
  };
  for (const constraint of profile.constraints) if (constraint.type === 'coincident') {
    const a = root(constraint.a), b = root(constraint.b);
    parent.set(compare(a, b) < 0 ? b : a, compare(a, b) < 0 ? a : b);
  }
  const boundary = (input: unknown): string[] => {
    const ids = list(input, SKETCH_LIMITS.maxEntities).map(identifier);
    if (!ids.length) fail('contorno vacío.');
    const boundaryEntities = ids.map(id => {
      const entity = entities.get(id);
      if (!entity || entity.construction || used.has(id)) fail('entidad material ausente, repetida o de construcción.');
      used.add(id); return entity;
    });
    if (boundaryEntities.some(entity => entity.type === 'circle')) {
      if (ids.length !== 1) fail('un círculo completo debe ser un contorno independiente.');
      return ids;
    }
    const graph = new Map<string, number>();
    const endpoints = boundaryEntities.map(entity => {
      if (entity.type === 'circle') return fail('círculo inesperado.');
      const a = root(entity.start), b = root(entity.end);
      if (a === b) fail('extremos de entidad degenerados.');
      graph.set(a, (graph.get(a) ?? 0) + 1); graph.set(b, (graph.get(b) ?? 0) + 1);
      return [a, b] as const;
    });
    if ([...graph.values()].some(degree => degree !== 2) || [...graph.keys()].some(node => usedNodes.has(node))) fail('contorno abierto, ramificado o conectado a otro contorno.');
    const follows = (reversed: boolean): boolean => {
      const start = endpoints[0][reversed ? 1 : 0];
      let end = endpoints[0][reversed ? 0 : 1];
      for (const pair of endpoints.slice(1)) {
        if (pair[0] === end) end = pair[1]; else if (pair[1] === end) end = pair[0]; else return false;
      }
      return end === start;
    };
    if (!follows(false) && !follows(true)) fail('las entidades no forman el ciclo declarado por IDs.');
    graph.forEach((_, node) => usedNodes.add(node));
    return canonicalCycle(ids);
  };
  const outer = boundary(source.outer);
  const holes = list(source.holes, SKETCH_LIMITS.maxEntities - 1).map(boundary).sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)));
  if (profile.entities.some(entity => !entity.construction && !used.has(entity.id))) fail('la región no cubre todas las entidades materiales.');
  return { outer, holes };
}

function structuralConstraint(constraint: SketchConstraint): unknown {
  if (constraint.type === 'offset') return {
    id: constraint.id, type: constraint.type, sources: constraint.sources, closed: constraint.closed, cap: constraint.cap,
    capEntityIds: constraint.capEntityIds,
    images: constraint.images.map(image => ({ side: image.side, entityIds: image.entityIds, joins: image.joins,
      ...(image.lineEndpointMode === 'aligned' ? { lineEndpointMode: 'aligned' } : {}),
      ...(image.lineEndpointFollowing?.some(Boolean) ? { lineEndpointFollowing: image.lineEndpointFollowing } : {}),
    })).sort((a, b) => compare(a.side, b.side)),
  };
  if (constraint.type === 'equalOffsetDistance') return { id: constraint.id, type: constraint.type,
    members: [...constraint.members].sort((a, b) => compare(a.offsetId, b.offsetId) || compare(a.side, b.side)) };
  return Object.fromEntries(Object.entries(constraint).filter(([key]) => !['value', 'x', 'y', 'driven', 'referenceRole'].includes(key)));
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => compare(a, b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

/**
 * Source type/connectivity, whole region nesting and discrete generating branches identify material.
 * Coordinates, radii, dimension values, fixed positions and geometric ordinal groups never do.
 * Closure is by IDs/explicit coincident relations only. Native validity/nesting is a separate producer gate.
 * Same-ID identical JSON recreation cannot be detected here; normal creation needs the UUID prerequisite.
 */
export function createEntityPrismIdentityV2(input: EntityProfile, context: EntityPrismContextV2, materialRegion: PrismMaterialRegionV2): EntityPrismIdentityV2 {
  const profile = validateEntityProfile(input), history = contextDescriptor(context), region = regionDescriptor(profile, materialRegion);
  const entities = profile.entities.map(entity => entity.type === 'line'
    ? [entity.id, entity.type, entity.construction, entity.start, entity.end]
    : entity.type === 'circle' ? [entity.id, entity.type, entity.construction, entity.center]
      : [entity.id, entity.type, entity.construction, entity.center, entity.start, entity.end, entity.clockwise]).sort((a, b) => compare(String(a[0]), String(b[0])));
  const constraints = profile.constraints.filter(constraint => !('value' in constraint)
    || (constraint.referenceRole ?? (constraint.driven ? 'annotation' : 'constraint')) !== 'annotation')
    .sort((a, b) => compare(a.id, b.id)).map(structuralConstraint);
  const descriptor = ['entity-prism-v2', history.descriptor, profile.points.map(point => point.id).sort(compare), entities, constraints, region];
  const identity = Object.freeze({ sourceFeatureId: history.sourceFeatureId, lineageDigest: namingDigest(JSON.stringify(canonical(descriptor))) });
  identities.set(identity, { direction: history.direction, region,
    entities: new Map(profile.entities.filter(entity => !entity.construction).map(entity => [entity.id, entity.type])) });
  return identity;
}

function identityData(identity: EntityPrismIdentityV2): IdentityData {
  const data = identities.get(identity);
  return data ?? fail('identidad no construida por el módulo.');
}
function faceRole(identity: EntityPrismIdentityV2, value: PrismFaceRoleV2): unknown[] {
  const data = identityData(identity), source = record(value, ['role'], ['entityId', 'entityType']);
  if (source.role === 'startCap' || source.role === 'endCap') { record(value, ['role']); return [source.role]; }
  if (source.role !== 'side') fail('rol de cara no válido.');
  record(value, ['role', 'entityId', 'entityType']);
  const id = identifier(source.entityId);
  if (!data.entities.has(id) || data.entities.get(id) !== source.entityType) fail('tipo o entidad de cara no coincide con el material de origen.');
  return ['side', id, source.entityType];
}
function edgeRole(identity: EntityPrismIdentityV2, value: PrismEdgeRoleV2): unknown[] {
  const data = identityData(identity), source = record(value, ['role', 'entityId', 'entityType']);
  if (source.role !== 'startRim' && source.role !== 'endRim') fail('rol de arista no válido.');
  const id = identifier(source.entityId);
  if (!data.entities.has(id) || data.entities.get(id) !== source.entityType) fail('tipo o entidad de arista no coincide con el material de origen.');
  return [source.role, id, source.entityType];
}
export function prismFaceReferenceV2(identity: EntityPrismIdentityV2, role: PrismFaceRoleV2): FaceReference {
  return { sourceFeatureId: identity.sourceFeatureId, key: 'face-v2|' + namingDigest(JSON.stringify(['face-v2', identity.lineageDigest, faceRole(identity, role)])) };
}
export function prismEdgeReferenceV2(identity: EntityPrismIdentityV2, role: PrismEdgeRoleV2): EdgeReference {
  return { sourceFeatureId: identity.sourceFeatureId, key: 'edge-v2|' + namingDigest(JSON.stringify(['edge-v2', identity.lineageDigest, edgeRole(identity, role)])) };
}

export interface PrismVerifiedWitnessV2<F, E> {
  readonly status: 'verified';
  readonly direction: PrismDirectionV2;
  readonly materialRegion: PrismMaterialRegionV2;
  readonly faces: readonly { readonly role: PrismFaceRoleV2; readonly target: F }[];
  readonly edges: readonly { readonly role: PrismEdgeRoleV2; readonly target: E }[];
  readonly bodyFaces: readonly F[];
  readonly bodyEdges: readonly E[];
}
export interface PrismTargetEqualityV2<F, E> {
  sameFace(a: F, b: F): boolean;
  sameEdge(a: E, b: E): boolean;
}
export interface EntityPrismReferenceCatalogV2<F, E> {
  readonly sourceFeatureId: string;
  readonly faces: readonly { readonly ref: FaceReference; readonly role: PrismFaceRoleV2; readonly target: F }[];
  readonly edges: readonly { readonly ref: EdgeReference; readonly role: PrismEdgeRoleV2; readonly target: E }[];
}

/**
 * Native-free verification of an upstream witness, using its supplied exact topology equality.
 * It does not prove geometry, nesting, cap membership, lifetime or the correctness of that equality.
 * Target handles/tokens, body enumeration order and native hashes never enter persisted keys.
 * Vertical edges/seams are deliberately unnamed; all body faces and the requested rim subset must be unique.
 */
export function createEntityPrismReferenceCatalogV2<F, E>(identity: EntityPrismIdentityV2, witness: PrismVerifiedWitnessV2<F, E>, equality: PrismTargetEqualityV2<F, E>): EntityPrismReferenceCatalogV2<F, E> {
  const data = identityData(identity);
  if (witness.status !== 'verified' || witness.direction !== data.direction) fail('proveniencia no disponible o sentido diferente.');
  list(witness.faces, SKETCH_LIMITS.maxEntities + 2); list(witness.edges, SKETCH_LIMITS.maxEntities * 2);
  list(witness.bodyFaces, SKETCH_LIMITS.maxEntities + 2); list(witness.bodyEdges, SKETCH_LIMITS.maxEntities * 4 + 2);
  if (typeof equality.sameFace !== 'function' || typeof equality.sameEdge !== 'function') fail('falta la igualdad topológica exacta.');
  const normalizeRegion = (region: PrismMaterialRegionV2): PrismMaterialRegionV2 => {
    const source = record(region, ['outer', 'holes']);
    const cycle = (value: unknown): string[] => {
      const ids = list(value, SKETCH_LIMITS.maxEntities).map(identifier);
      if (!ids.length || new Set(ids).size !== ids.length) fail('contorno de proveniencia vacío o duplicado.');
      return canonicalCycle(ids);
    };
    return { outer: cycle(source.outer), holes: list(source.holes, SKETCH_LIMITS.maxEntities - 1).map(cycle).sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b))) };
  };
  if (JSON.stringify(normalizeRegion(witness.materialRegion)) !== JSON.stringify(data.region)) fail('la región de la proveniencia no coincide.');
  const verify = <T>(entries: readonly { target: T; ref: FaceReference | EdgeReference }[], pool: readonly T[], same: (a: T, b: T) => boolean, expected: number, complete: boolean): void => {
    if (entries.length !== expected || pool.length > SKETCH_LIMITS.maxEntities * 4 + 2 || (complete && pool.length !== expected)) fail('inventario topológico incompleto o fuera del límite.');
    if (new Set(entries.map(entry => entry.ref.key)).size !== expected) fail('rol de proveniencia duplicado.');
    for (const [index, entry] of entries.entries()) {
      if (entry.target == null || pool.filter(target => same(entry.target, target)).length !== 1
        || entries.some((other, otherIndex) => otherIndex !== index && same(entry.target, other.target))) fail('target ausente, dividido, fusionado o ambiguo.');
    }
  };
  const faces = witness.faces.map(entry => ({ ref: prismFaceReferenceV2(identity, entry.role), role: Object.freeze({ ...entry.role }), target: entry.target }));
  const edges = witness.edges.map(entry => ({ ref: prismEdgeReferenceV2(identity, entry.role), role: Object.freeze({ ...entry.role }), target: entry.target }));
  verify(faces, witness.bodyFaces, (a, b) => equality.sameFace(a, b), data.entities.size + 2, true);
  verify(edges, witness.bodyEdges, (a, b) => equality.sameEdge(a, b), data.entities.size * 2, false);
  return Object.freeze({ sourceFeatureId: identity.sourceFeatureId,
    faces: Object.freeze(faces.map(entry => Object.freeze({ ...entry, ref: Object.freeze(entry.ref) }))),
    edges: Object.freeze(edges.map(entry => Object.freeze({ ...entry, ref: Object.freeze(entry.ref) }))) });
}

function resolve<T>(sourceFeatureId: string, entries: readonly { ref: FaceReference | EdgeReference; target: T }[], reference: FaceReference | EdgeReference, isKey: (key: unknown) => boolean): T {
  record(reference, ['sourceFeatureId', 'key']);
  if (reference.sourceFeatureId !== sourceFeatureId || !isKey(reference.key)) fail('versión o ámbito histórico de referencia diferente.');
  const matches = entries.filter(entry => entry.ref.sourceFeatureId === sourceFeatureId && entry.ref.key === reference.key);
  if (matches.length !== 1) fail('referencia desaparecida o ambigua; recupera la selección.');
  return matches[0].target;
}
export function resolvePrismFaceReferenceV2<F, E>(catalog: EntityPrismReferenceCatalogV2<F, E>, reference: FaceReference): F {
  return resolve(catalog.sourceFeatureId, catalog.faces, reference, isFaceReferenceKeyV2);
}
export function resolvePrismEdgeReferenceV2<F, E>(catalog: EntityPrismReferenceCatalogV2<F, E>, reference: EdgeReference): E {
  return resolve(catalog.sourceFeatureId, catalog.edges, reference, isEdgeReferenceKeyV2);
}
