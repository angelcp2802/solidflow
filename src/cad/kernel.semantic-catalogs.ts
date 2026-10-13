import type { Edge, Face, Shape3D } from 'replicad';
import { createEdgeCatalog } from './kernel.edges';
import { createFaceCatalog, type FaceDescriptor } from './kernel.faces';
import { clonePlaneFrame } from './kernel.frames';
import {
  createEntityPrismIdentityV2, createEntityPrismReferenceCatalogV2,
  isEdgeReferenceKeyV2, isFaceReferenceKeyV2,
  type EntityPrismContextV2, type EntityPrismReferenceCatalogV2, type PrismFaceRoleV2,
} from './kernel.semantic-references';
import type { PrismProvenance } from './kernel.provenance';
import type { EntityProfile } from '../sketch/types';
import type { EdgeReference, FaceReference, PickableEdge, PickableFace, PlaneFrame } from './kernel.types';

/** Opt-in overlay only. The active engine and legacy catalogs do not call this module. */
type PrismReferences = EntityPrismReferenceCatalogV2<Face, Edge>;
export type PreparedPrismReferencesV2 =
  | { readonly status: 'verified'; readonly references: PrismReferences }
  | { readonly status: 'unavailable'; readonly diagnostic: string };

/** Returned targets are borrowed from the producer; no geometry is rebuilt on failure. */
export function preparePrismReferencesV2(
  profile: EntityProfile, context: EntityPrismContextV2, provenance: PrismProvenance,
): PreparedPrismReferencesV2 {
  if (provenance.status !== 'verified') return { status: 'unavailable', diagnostic: 'La procedencia nativa no está verificada.' };
  try {
    const identity = createEntityPrismIdentityV2(profile, context, provenance.materialRegion);
    const references = createEntityPrismReferenceCatalogV2(identity, {
      status: 'verified', direction: provenance.direction, materialRegion: provenance.materialRegion,
      faces: provenance.faces.map((binding): { role: PrismFaceRoleV2; target: Face } => ({
        role: binding.role === 'side'
          ? { role: binding.role, entityId: binding.entityId, entityType: binding.entityType }
          : { role: binding.role },
        target: binding.target,
      })),
      edges: provenance.edges.map(binding => ({
        role: { role: binding.role, entityId: binding.entityId, entityType: binding.entityType }, target: binding.target,
      })),
      bodyFaces: provenance.bodyFaces, bodyEdges: provenance.bodyEdges,
    }, { sameFace: (a, b) => a.isSame(b), sameEdge: (a, b) => a.isSame(b) });
    return { status: 'verified', references };
  } catch (error) {
    return { status: 'unavailable', diagnostic: error instanceof Error ? error.message : 'No se pudo verificar la identidad del prisma.' };
  }
}
type OverlayStatus = 'absent' | 'applied' | 'unavailable';
interface OverlayResult {
  /** "applied" covers the provided verified roles, not every possible BRep role. */
  readonly semanticStatus: OverlayStatus;
  readonly semanticDiagnostic?: string;
  dispose(): void;
}
export interface SemanticFaceDescriptor extends FaceDescriptor {
  /** Internal exact v1 aliases; only the primary ref is exposed for picking. */
  readonly aliases: readonly FaceReference[];
}
export interface SemanticFaceCatalog extends OverlayResult {
  readonly entries: readonly (SemanticFaceDescriptor & { face: Face })[];
}
export interface SemanticEdgeCatalog extends OverlayResult {
  readonly entries: readonly { edge: Edge; ref: EdgeReference; aliases: readonly EdgeReference[] }[];
}

function disposeTargetsOnce(targets: readonly { delete(): void }[]): () => void {
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    const errors: unknown[] = [];
    // The legacy factory hands ownership of these fresh wrappers to its result.
    // Do not also invoke legacy.dispose: a failed release must never be retried.
    for (const target of targets) {
      try { target.delete(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Native catalog release failed: ' +
      errors.map(error => error instanceof Error ? error.message : String(error)).join('; '));
  };
}

function assignments<T>(
  actual: readonly T[], bindings: readonly { target: T; ref: FaceReference | EdgeReference }[], sourceFeatureId: string,
  semanticSource: string, validKey: (key: unknown) => boolean, same: (a: T, b: T) => boolean,
): Map<T, FaceReference | EdgeReference> {
  if (semanticSource !== sourceFeatureId || !bindings.length) throw new Error('El ámbito semántico no corresponde al cuerpo.');
  if (bindings.length > actual.length) throw new Error('Hay más referencias semánticas que formas reales.');
  const result = new Map<T, FaceReference | EdgeReference>(), keys = new Set<string>();
  for (const binding of bindings) {
    if (binding.ref.sourceFeatureId !== sourceFeatureId || !validKey(binding.ref.key) || keys.has(binding.ref.key)) {
      throw new Error('El catálogo semántico contiene una referencia incompatible o duplicada.');
    }
    const matches = actual.filter(target => same(target, binding.target));
    if (matches.length !== 1 || result.has(matches[0])) throw new Error('La correspondencia semántica no es única en el cuerpo actual.');
    result.set(matches[0], { sourceFeatureId: binding.ref.sourceFeatureId, key: binding.ref.key });
    keys.add(binding.ref.key);
  }
  return result;
}

/**
 * Consumes already checked v2 role bindings as borrowed inputs. The returned catalog
 * owns fresh wrappers obtained from the actual body, so its lifetime is independent
 * of the producer after construction. A failed overlay leaves every v1 ref intact.
 */
export function createSemanticFaceCatalog(
  shape: Shape3D, sourceFeatureId: string, lineage = '', semantic?: PrismReferences,
): SemanticFaceCatalog {
  const legacy = createFaceCatalog(shape, sourceFeatureId, lineage);
  const dispose = disposeTargetsOnce(legacy.entries.map(entry => entry.face));
  const entries = legacy.entries.map(entry => ({ ...entry, aliases: [{ ...entry.ref }] }));
  if (!semantic) return { entries, semanticStatus: 'absent', dispose };
  try {
    const mapped = assignments(entries.map(entry => entry.face), semantic.faces, sourceFeatureId,
      semantic.sourceFeatureId, isFaceReferenceKeyV2, (a, b) => a.isSame(b));
    // Apply only after the entire overlay has passed, never a partial mutation.
    for (const entry of entries) {
      const reference = mapped.get(entry.face);
      if (reference) entry.ref = { ...reference };
    }
    return { entries, semanticStatus: 'applied', dispose };
  } catch (error) {
    return { entries, semanticStatus: 'unavailable',
      semanticDiagnostic: error instanceof Error ? error.message : 'No se pudo verificar la correspondencia de caras.', dispose };
  }
}

export function createSemanticEdgeCatalog(
  shape: Shape3D, sourceFeatureId: string, lineage = '', semantic?: PrismReferences,
): SemanticEdgeCatalog {
  const legacy = createEdgeCatalog(shape, sourceFeatureId, lineage);
  const dispose = disposeTargetsOnce(legacy.entries.map(entry => entry.edge));
  const entries = legacy.entries.map(entry => ({ ...entry, aliases: [{ ...entry.ref }] }));
  if (!semantic) return { entries, semanticStatus: 'absent', dispose };
  try {
    const mapped = assignments(entries.map(entry => entry.edge), semantic.edges, sourceFeatureId,
      semantic.sourceFeatureId, isEdgeReferenceKeyV2, (a, b) => a.isSame(b));
    for (const entry of entries) {
      const reference = mapped.get(entry.edge);
      if (reference) entry.ref = { ...reference };
    }
    return { entries, semanticStatus: 'applied', dispose };
  } catch (error) {
    return { entries, semanticStatus: 'unavailable',
      semanticDiagnostic: error instanceof Error ? error.message : 'No se pudo verificar la correspondencia de aristas.', dispose };
  }
}

function legacyKey(key: string, kind: 'face' | 'edge'): boolean {
  const prefix = `${kind}-v1|`;
  return key.startsWith(prefix) && key.length > prefix.length && !/[\x00-\x1f\x7f]/.test(key);
}
function match<T extends { ref: FaceReference | EdgeReference; aliases: readonly (FaceReference | EdgeReference)[] }>(
  entries: readonly T[],
  reference: FaceReference | EdgeReference, sourceFeatureId: string, kind: 'face' | 'edge',
): T {
  const v2 = kind === 'face' ? isFaceReferenceKeyV2(reference.key) : isEdgeReferenceKeyV2(reference.key);
  const v1 = legacyKey(reference.key, kind);
  if (reference.sourceFeatureId !== sourceFeatureId || (!v1 && !v2)) {
    throw new Error('La referencia pertenece a otro sólido o tiene una versión incompatible. Recupera la selección.');
  }
  const matches = entries.filter(entry =>
    (entry.ref.sourceFeatureId === sourceFeatureId && entry.ref.key === reference.key) ||
    // A stored v2 reference is never resolved through a geometric alias.
    (v1 && entry.aliases.some(alias => alias.sourceFeatureId === sourceFeatureId && alias.key === reference.key)));
  if (!matches.length) throw new Error('La referencia ya no se puede identificar. Recupera la selección.');
  if (matches.length !== 1) throw new Error('La referencia es ambigua. Recupera la selección.');
  return matches[0];
}

/** Also accepts a historical catalog of copied descriptors, with no native targets. */
export function resolveSemanticFaceReference(
  catalog: { entries: readonly SemanticFaceDescriptor[] }, reference: FaceReference, sourceFeatureId: string,
): PlaneFrame {
  const entry = match(catalog.entries, reference, sourceFeatureId, 'face');
  if (!entry.frame) throw new Error('La cara seleccionada es curva. Selecciona una cara plana para el soporte.');
  return clonePlaneFrame(entry.frame);
}

// Preserve the document format's existing per-type selection bounds.
const MAX_SELECTED_FACES = 256;
const MAX_SELECTED_EDGES = 4096;
function selected<T, R extends FaceReference | EdgeReference>(
  references: readonly R[], resolve: (reference: R) => T, same: (a: T, b: T) => boolean, kind: 'face' | 'edge',
): T[] {
  const maximum = kind === 'face' ? MAX_SELECTED_FACES : MAX_SELECTED_EDGES;
  if (references.length > maximum || (kind === 'edge' && !references.length))
    throw new Error(kind === 'face' ? `Selecciona como máximo ${maximum} caras.`
      : `Selecciona entre 1 y ${maximum} aristas para esta operación.`);
  const targets: T[] = [];
  for (const reference of references) {
    const target = resolve(reference);
    // Different versions/aliases may name the same shape. Keys alone cannot deduplicate this.
    if (targets.some(previous => same(previous, target))) throw new Error('La selección contiene una forma duplicada.');
    targets.push(target);
  }
  return targets;
}

/** Borrowed native results remain owned by the catalog. */
export function resolveSemanticSelectedFaces(
  catalog: SemanticFaceCatalog, references: readonly FaceReference[], sourceFeatureId: string,
): Face[] {
  return selected(references, reference => match(catalog.entries, reference, sourceFeatureId, 'face').face,
    (a, b) => a.isSame(b), 'face');
}
export function resolveSemanticEdgeReferences(
  catalog: SemanticEdgeCatalog, references: readonly EdgeReference[], sourceFeatureId: string,
): Edge[] {
  return selected(references, reference => match(catalog.entries, reference, sourceFeatureId, 'edge').edge,
    (a, b) => a.isSame(b), 'edge');
}

function withCatalog<T>(catalog: { dispose(): void }, operation: () => T): T {
  let operationFailed = false, operationError: unknown;
  try { return operation(); }
  catch (error) { operationFailed = true; operationError = error; throw error; }
  finally {
    try { catalog.dispose(); }
    catch (releaseError) {
      if (operationFailed) throw new AggregateError([operationError, releaseError],
        'Native catalog operation and release failed: ' +
        [operationError, releaseError].map(error => error instanceof Error ? error.message : String(error)).join('; '));
      throw releaseError;
    }
  }
}

export function pickableSemanticFaces(
  shape: Shape3D, sourceFeatureId: string, lineage = '', semantic?: PrismReferences,
): PickableFace[] {
  const catalog = createSemanticFaceCatalog(shape, sourceFeatureId, lineage, semantic);
  return withCatalog(catalog, () => catalog.entries.map(({ face, frame, ref }) => {
    const mesh = face.mesh({ tolerance: .05, angularTolerance: .12 });
    return { ref: { ...ref }, frame: frame ? clonePlaneFrame(frame) : null, vertices: mesh.vertices, triangles: mesh.triangles };
  }));
}
export function pickableSemanticEdges(
  shape: Shape3D, sourceFeatureId: string, lineage = '', semantic?: PrismReferences,
): PickableEdge[] {
  const catalog = createSemanticEdgeCatalog(shape, sourceFeatureId, lineage, semantic);
  return withCatalog(catalog, () => catalog.entries.map(({ edge, ref }) => ({ ref: { ...ref },
    lines: edge.meshEdges({ tolerance: .05, angularTolerance: .12 }).lines })));
}
